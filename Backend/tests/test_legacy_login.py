"""Password login works against the pre-Google schema without changing MySQL."""
import unittest
from datetime import datetime
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from app.core.security import hash_password
from app.core.dependencies import current_user
from app.routers.auth import login
from app.schemas.auth import LoginRequest, LoginResponse, UserProfile


# Group checks for legacy login.
class LegacyLoginTests(unittest.TestCase):
    # Check that login and me without google column.
    def test_login_and_me_without_google_column(self):
        engine = create_engine('sqlite:///:memory:')
        with engine.begin() as connection:
            connection.execute(text('CREATE TABLE User (user_id INTEGER PRIMARY KEY, name VARCHAR(100), email VARCHAR(100), password_hash VARCHAR(255) NOT NULL, phone VARCHAR(20), role VARCHAR(10), account_status VARCHAR(10), created_at DATETIME)'))
            for user_id, role in enumerate(('parent', 'admin'), start=1):
                connection.execute(text('INSERT INTO User VALUES (:id, :name, :email, :hash, NULL, :role, :status, :created)'), dict(id=user_id, name='Fixture', email=role+'@example.com', hash=hash_password('Fixture-only1!'), role=role, status='active', created=datetime.now()))
        for role in ('parent', 'admin'):
            with Session(engine) as db:
                result = login(LoginRequest(email=role+'@example.com', password='Fixture-only1!'), db)
                self.assertEqual(LoginResponse.model_validate(result).user.role, role)
                token = result['access_token']
            with Session(engine) as db:
                user = current_user(HTTPAuthorizationCredentials(scheme='Bearer', credentials=token), db)
                self.assertEqual(UserProfile.model_validate(user).role, role)
                self.assertIsNone(UserProfile.model_validate(user).profile_photo_url)
                with self.assertRaises(HTTPException) as error:
                    login(LoginRequest(email=role+'@example.com', password='wrong'), db)
                self.assertEqual(error.exception.status_code, 401)
        engine.dispose()
