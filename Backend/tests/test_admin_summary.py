"""Summary endpoint tests: signed JWTs and isolated in-memory SQL only."""
import asyncio
import json
import os
import secrets
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from datetime import datetime, timedelta, timezone
os.environ.setdefault('JWT_SECRET', secrets.token_urlsafe(48))
os.environ.setdefault('DB_HOST', 'localhost')
os.environ.setdefault('DB_USER', 'test')
os.environ.setdefault('DB_PASSWORD', 'unused')
import jwt
from sqlalchemy import Column, DateTime, Integer, MetaData, String, Table, create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from app.core.config import get_settings
from app.core.security import create_token
from app.database.connection import get_db
from app.main import app

# Send a request and turn network or response failures into readable errors.
async def request(token=None, path='/api/admin/dashboard/summary'):
    messages = []
    # Supply a request message to the in-process HTTP test.
    async def receive():
        return {'type': 'http.request', 'body': b'', 'more_body': False}
    # Collect response messages so the test can inspect status and content.
    async def send(message):
        messages.append(message)
    headers = [] if token is None else [(b'authorization', ('Bearer ' + token).encode())]
    await app({'type': 'http', 'asgi': {'version': '3.0'}, 'http_version': '1.1', 'method': 'GET', 'scheme': 'http', 'path': path, 'raw_path': path.encode(), 'query_string': b'', 'headers': headers, 'server': ('test', 80), 'client': ('test', 1), 'root_path': ''}, receive, send)
    return next(m['status'] for m in messages if m['type'] == 'http.response.start'), json.loads(b''.join(m.get('body', b'') for m in messages if m['type'] == 'http.response.body'))

# Group checks for admin summary.
class AdminSummaryTests(unittest.TestCase):
    # Prepare isolated fixtures before each test.
    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        self.metadata = MetaData()
        users = Table('User', self.metadata, Column('user_id', Integer, primary_key=True), Column('name', String), Column('email', String), Column('password_hash', String), Column('phone', String), Column('role', String), Column('account_status', String), Column('created_at', DateTime))
        self.metadata.create_all(self.engine)
        with self.engine.begin() as conn:
            conn.execute(users.insert(), [{'user_id': uid, 'name': 'Fixture', 'email': f'{uid}@example.com', 'password_hash': 'not-a-real-password', 'role': role, 'account_status': status, 'created_at': datetime(2026, 1, uid, 12, 30)} for uid, role, status in [(1, 'admin', 'active'), (2, 'parent', 'active'), (3, 'parent', 'inactive'), (4, 'admin', 'inactive')]])
        self.db = Session(self.engine)
        app.dependency_overrides[get_db] = lambda: self.db

    # Release test sessions and remove dependency overrides after each test.
    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()

    # Check that no token 401.
    def test_no_token_401(self):
        self.assertEqual(asyncio.run(request())[0], 401)

    # Check that parent 403.
    def test_parent_403(self):
        self.assertEqual(asyncio.run(request(create_token(2)))[0], 403)

    # Check that inactive admin 403.
    def test_inactive_admin_403(self):
        # Production's enum currently allows only 'active'; simulate a future
        # inactive record at the lookup boundary without changing its schema.
        with patch.object(self.db, 'get', return_value=SimpleNamespace(role='admin', account_status='inactive')):
            self.assertEqual(asyncio.run(request(create_token(4)))[0], 403)

    # Check that admin counts and missing tables.
    def test_admin_counts_and_missing_tables(self):
        status, body = asyncio.run(request(create_token(1)))
        self.assertEqual(status, 200)
        self.assertEqual(body['total_parents'], 2)
        self.assertEqual(body['active_users'], 2)
        self.assertIsNone(body['total_children'])
        self.assertIsNone(body['subscription_users'])
        self.assertEqual(body['unavailable_statistics'], {'total_children': 'Child table does not exist.', 'subscription_users': 'ParentSubscription table does not exist.'})
        self.assertNotIn('password', json.dumps(body))
        self.assertNotIn('email', json.dumps(body))

    # Check that existing child table empty then populated.
    def test_existing_child_table_empty_then_populated(self):
        child = Table('Child', self.metadata, Column('child_id', Integer, primary_key=True))
        child.create(self.engine)
        self.assertEqual(asyncio.run(request(create_token(1)))[1]['total_children'], 0)
        self.db.rollback()
        with self.engine.begin() as conn:
            conn.execute(child.insert(), [{'child_id': 1}, {'child_id': 2}, {'child_id': 3}])
        body = asyncio.run(request(create_token(1)))[1]
        self.assertEqual(body['total_children'], 3)
        self.assertNotIn('total_children', body['unavailable_statistics'])

    # Check that subscription without verified fields unavailable.
    def test_subscription_without_verified_fields_unavailable(self):
        Table('ParentSubscription', self.metadata, Column('id', Integer, primary_key=True)).create(self.engine)
        status, body = asyncio.run(request(create_token(1)))
        self.assertEqual(status, 200)
        self.assertIsNone(body['subscription_users'])
        self.assertIn('not defined', body['unavailable_statistics']['subscription_users'])

    # Check that jwt role claim does not override database.
    def test_jwt_role_claim_does_not_override_database(self):
        now = datetime.now(timezone.utc)
        token = jwt.encode({'sub': '2', 'role': 'admin', 'iat': now, 'exp': now + timedelta(minutes=1), 'iss': 'juvcare', 'aud': 'juvcare-web'}, get_settings().JWT_SECRET.get_secret_value(), algorithm='HS256')
        self.assertEqual(asyncio.run(request(token))[0], 403)

    # Check that invalid expired and deleted user 401.
    def test_invalid_expired_and_deleted_user_401(self):
        now = datetime.now(timezone.utc)
        expired = jwt.encode({'sub': '1', 'iat': now - timedelta(minutes=2), 'exp': now - timedelta(minutes=1), 'iss': 'juvcare', 'aud': 'juvcare-web'}, get_settings().JWT_SECRET.get_secret_value(), algorithm='HS256')
        for token in ['invalid', expired, create_token(999)]:
            self.assertEqual(asyncio.run(request(token))[0], 401)


    # Check that recent registrations security.
    def test_recent_registrations_security(self):
        path = '/api/admin/dashboard/recent-registrations'
        for token, expected in [(None, 401), ('invalid', 401), (create_token(2), 403), (create_token(1), 200)]:
            self.assertEqual(asyncio.run(request(token, path))[0], expected)
        with patch.object(self.db, 'get', return_value=SimpleNamespace(role='admin', account_status='inactive')):
            self.assertEqual(asyncio.run(request(create_token(4), path))[0], 403)

    # Check that recent registrations are latest real rows with safe fields.
    def test_recent_registrations_are_latest_real_rows_with_safe_fields(self):
        users = self.metadata.tables['User']
        with self.engine.begin() as conn:
            conn.execute(users.insert(), [
                {'user_id': uid, 'name': f'New User {uid}', 'role': 'parent', 'account_status': 'active', 'created_at': datetime(2026, 2, 1, 10, 0)}
                for uid in [5, 6]
            ])
        status, rows = asyncio.run(request(create_token(1), '/api/admin/dashboard/recent-registrations'))
        self.assertEqual(status, 200)
        self.assertEqual([row['user_id'] for row in rows], [6, 5, 4, 3])
        self.assertEqual(rows[0]['name'], 'New User 6')
        self.assertEqual(rows[0]['created_at'], '2026-02-01T10:00:00')
        for row in rows:
            self.assertEqual(set(row), {'user_id', 'name', 'role', 'created_at'})

    # Check that recent registrations empty database.
    def test_recent_registrations_empty_database(self):
        from app.routers.admin import recent_registrations
        self.db.execute(self.metadata.tables['User'].delete())
        self.assertEqual(recent_registrations(admin=SimpleNamespace(role='admin'), db=self.db), [])

if __name__ == '__main__':
    unittest.main()
