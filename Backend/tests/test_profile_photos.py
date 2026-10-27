import os
import secrets
import tempfile
import unittest
from datetime import datetime
from io import BytesIO
from pathlib import Path
from unittest.mock import MagicMock, patch
os.environ.setdefault('JWT_SECRET', secrets.token_urlsafe(48))
os.environ.setdefault('DB_HOST', 'localhost')
os.environ.setdefault('DB_USER', 'test')
os.environ.setdefault('DB_PASSWORD', 'unused')
from PIL import Image
from fastapi.testclient import TestClient
from app.main import app
from app.database.connection import get_db
from app.models.user import User
from app.core.security import create_token
from app.routers.profile_photos import MAX_BYTES


class PhotoTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name)
        patcher = patch('app.routers.profile_photos.UPLOAD_DIR', self.path)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.db = MagicMock()
        self.user = User(user_id=8, name='Fixture', email='fixture@example.com', role='parent', account_status='active', created_at=datetime.now())
        self.db.get.return_value = self.user
        app.dependency_overrides[get_db] = lambda: self.db
        self.addCleanup(app.dependency_overrides.clear)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.headers = {'Authorization': 'Bearer ' + create_token(8), 'Content-Type': 'application/octet-stream'}

    def test_formats_roles_and_serving(self):
        for role in ('parent', 'admin'):
            self.user.role = role
            for format in ('JPEG', 'PNG', 'WEBP'):
                image = BytesIO()
                Image.new('RGB', (20, 30), 'blue').save(image, format=format)
                response = self.client.post('/api/auth/me/profile-photo', content=image.getvalue(), headers=self.headers)
                self.assertEqual(response.status_code, 200)
                url = response.json()['profile_photo_url']
                self.assertTrue(url.endswith(self.user.profile_photo))
                served = self.client.get(url)
                self.assertEqual(served.status_code, 200)
                self.assertEqual(served.headers['x-content-type-options'], 'nosniff')
                self.assertEqual(Image.open(BytesIO(served.content)).format, 'WEBP')
                self.assertEqual(self.client.get('/api/auth/me', headers=self.headers).json()['profile_photo_url'], url)
                self.assertEqual(self.user.user_id, 8)

    def test_rejections(self):
        self.assertEqual(self.client.post('/api/auth/me/profile-photo', content=b'x').status_code, 401)
        for content, code in [(b'<svg>not a raster</svg>', 422), (b'', 422), (b'x' * (MAX_BYTES+1), 413), (b'GIF89a', 422)]:
            self.assertEqual(self.client.post('/api/auth/me/profile-photo', content=content, headers=self.headers).status_code, code)
        self.user.account_status = 'inactive'
        self.assertEqual(self.client.post('/api/auth/me/profile-photo', content=b'x', headers=self.headers).status_code, 403)
        self.db.commit.assert_not_called()
        self.assertEqual(list(self.path.iterdir()), [])
        self.assertEqual(self.client.get('/api/profile-photos/not-a-safe-name.webp').status_code, 404)

    def test_failed_commit_removes_new_file(self):
        from sqlalchemy.exc import SQLAlchemyError
        self.db.commit.side_effect = SQLAlchemyError()
        image = BytesIO()
        Image.new('RGB', (10,10)).save(image, format='PNG')
        result = self.client.post('/api/auth/me/profile-photo', content=image.getvalue(), headers=self.headers)
        self.assertEqual(result.status_code, 503)
        self.assertEqual(list(self.path.iterdir()), [])

    def test_persists_only_jwt_owner_across_sessions(self):
        from sqlalchemy import create_engine, text
        from sqlalchemy.orm import Session
        engine = create_engine('sqlite:///' + str(self.path / 'fixture.sqlite'), connect_args={'check_same_thread': False})
        self.addCleanup(engine.dispose)
        with engine.begin() as connection:
            connection.execute(text('CREATE TABLE User (user_id INTEGER PRIMARY KEY, name TEXT, email TEXT, password_hash TEXT, google_sub TEXT, profile_photo TEXT, phone TEXT, role TEXT, account_status TEXT, created_at DATETIME)'))
            for user_id in (8, 9):
                connection.execute(text("INSERT INTO User (user_id, name, email, role, account_status, created_at) VALUES (:id, 'Fixture', 'fixture@example.com', 'parent', 'active', CURRENT_TIMESTAMP)"), {'id': user_id})
        def isolated_db():
            with Session(engine) as db:
                yield db
        app.dependency_overrides[get_db] = isolated_db
        image = BytesIO()
        Image.new('RGB', (20,20)).save(image, format='PNG')
        response = self.client.post('/api/auth/me/profile-photo?user_id=9', content=image.getvalue(), headers=self.headers)
        self.assertEqual(response.status_code, 200)
        url = response.json()['profile_photo_url']
        with Session(engine) as db:
            self.assertEqual(db.get(User, 8).profile_photo_url, url)
            self.assertIsNone(db.get(User, 9).profile_photo)
        self.assertEqual(self.client.get('/api/auth/me', headers=self.headers).json()['profile_photo_url'], url)
