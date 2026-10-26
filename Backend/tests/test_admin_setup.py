"""Bootstrap tests never connect to MySQL or invoke the interactive script."""
import unittest
from unittest.mock import patch
from sqlalchemy import Column, DateTime, Integer, MetaData, String, Table, create_engine, select, func
from sqlalchemy.orm import Session
from app.models.user import User
from app.schemas.auth import RegisterRequest
from app.core.security import verify_password
from scripts.setup_admin import insert_admin, SetupRefused, setup_admin


class AdminSetupTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://')
        metadata = MetaData()
        Table('User', metadata, Column('user_id', Integer, primary_key=True), Column('name', String), Column('email', String(collation='NOCASE'), unique=True), Column('password_hash', String), Column('phone', String), Column('role', String), Column('account_status', String), Column('created_at', DateTime, server_default=func.current_timestamp()))
        metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.details = RegisterRequest(name='Test Administrator', email='admin@example.com', password='Fixture-Only1!')

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_creates_one_admin_with_existing_hash_function(self):
        with self.db.begin():
            uid = insert_admin(self.db, self.details)
        user = self.db.get(User, uid)
        self.assertEqual((user.role, user.account_status), ('admin', 'active'))
        self.assertNotEqual(user.password_hash, self.details.password.get_secret_value())
        self.assertTrue(verify_password(self.details.password.get_secret_value(), user.password_hash))
        self.db.rollback()
        with self.assertRaisesRegex(SetupRefused, 'admin account already exists'):
            with self.db.begin():
                insert_admin(self.db, self.details)
        self.assertEqual(self.db.scalar(select(func.count()).select_from(User)), 1)

    def test_existing_parent_email_is_never_promoted_or_modified(self):
        with self.db.begin():
            self.db.add(User(name='Existing Parent', email='ADMIN@example.com', password_hash='original-hash', phone='original-phone', role='parent', account_status='active'))
        with self.assertRaisesRegex(SetupRefused, 'email already exists'):
            with self.db.begin():
                insert_admin(self.db, self.details)
        user = self.db.scalar(select(User))
        self.assertEqual((user.name, user.role, user.password_hash, user.phone, user.account_status), ('Existing Parent', 'parent', 'original-hash', 'original-phone', 'active'))
        self.assertEqual(self.db.scalar(select(func.count()).select_from(User)), 1)

    def test_unrelated_parent_is_unchanged(self):
        with self.db.begin():
            self.db.add(User(name='Parent', email='parent@example.com', password_hash='original-hash', role='parent', account_status='active'))
        with self.db.begin():
            insert_admin(self.db, self.details)
        parent = self.db.scalar(select(User).where(User.role == 'parent'))
        self.assertEqual((parent.email, parent.password_hash), ('parent@example.com', 'original-hash'))
        self.assertEqual(self.db.scalar(select(func.count()).select_from(User)), 2)

    def test_failed_lock_prevents_insert(self):
        with patch('scripts.setup_admin.get_engine') as engine, patch('scripts.setup_admin.insert_admin') as insert:
            connection = engine.return_value.connect.return_value.__enter__.return_value
            connection.scalar.return_value = 0
            with self.assertRaisesRegex(SetupRefused, 'Another admin setup'):
                setup_admin(self.details)
            insert.assert_not_called()
            connection.rollback.assert_called()

    def test_lock_held_through_commit_and_released_on_refusal(self):
        with patch('scripts.setup_admin.get_engine') as engine, patch('scripts.setup_admin.Session') as session, patch('scripts.setup_admin.insert_admin', side_effect=SetupRefused('Existing admin')):
            connection = engine.return_value.connect.return_value.__enter__.return_value
            connection.scalar.return_value = 1
            with self.assertRaises(SetupRefused):
                setup_admin(self.details)
            self.assertIn('GET_LOCK', str(connection.scalar.call_args.args[0]))
            self.assertIn('RELEASE_LOCK', str(connection.execute.call_args.args[0]))
            session.return_value.__enter__.return_value.begin.return_value.__exit__.assert_called()
            engine.return_value.dispose.assert_called_once()

if __name__ == '__main__':
    unittest.main()
