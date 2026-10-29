import unittest
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.security import hash_password, verify_password
from app.database.connection import get_db
from app.models.password_recovery import PasswordRecoveryChallenge
from app.models.user import User
from app.routers import password_recovery as recovery


class PasswordRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        with self.engine.begin() as connection:
            connection.execute(text(
                "CREATE TABLE User (user_id INTEGER PRIMARY KEY AUTOINCREMENT, "
                "name VARCHAR(100) NOT NULL, email VARCHAR(100) NOT NULL UNIQUE, "
                "password_hash VARCHAR(255), google_sub VARCHAR(255), "
                "profile_photo VARCHAR(64), phone VARCHAR(20), role VARCHAR(10) NOT NULL, "
                "account_status VARCHAR(10) NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)"
            ))
        PasswordRecoveryChallenge.__table__.create(self.engine)
        self.stamp = datetime(2026, 1, 1, 12, 0, 0)
        self.clock_patch = patch.object(recovery, "now", side_effect=lambda: self.stamp)
        self.clock_patch.start()
        self.settings = SimpleNamespace(PASSWORD_RECOVERY_SECRET=SecretStr("test-secret-" + "x" * 40))
        self.settings_patch = patch.object(recovery, "get_settings", return_value=self.settings)
        self.settings_patch.start()
        self.mail_patch = patch.object(recovery, "send_email")
        self.mail = self.mail_patch.start()

        self.app = FastAPI()
        self.app.include_router(recovery.router)

        def database():
            with Session(self.engine, expire_on_commit=False) as session:
                yield session

        self.app.dependency_overrides[get_db] = database
        self.client = TestClient(self.app)
        self.addCleanup(self.client.close)
        self.addCleanup(self.mail_patch.stop)
        self.addCleanup(self.settings_patch.stop)
        self.addCleanup(self.clock_patch.stop)
        self.addCleanup(self.engine.dispose)
        self.add_user("parent@example.com", "Old-password1!")

    def add_user(self, email, password):
        with Session(self.engine) as session:
            session.add(User(
                name="Test Parent",
                email=email,
                password_hash=hash_password(password) if password else None,
                role="parent",
                account_status="active",
            ))
            session.commit()

    def user(self, email):
        with Session(self.engine) as session:
            return session.scalar(select(User).where(User.email == email))

    def request_code(self, email="parent@example.com", challenge_id=None, code=123456):
        body = {"email": email}
        if challenge_id is not None:
            body["challenge_id"] = challenge_id
        with patch.object(recovery.secrets, "randbelow", return_value=code):
            return self.client.post("/api/auth/password-reset/request", json=body)

    def verify_code(self, challenge_id, otp="123456", password="New-password2!"):
        return self.client.post("/api/auth/password-reset/verify", json={
            "challenge_id": challenge_id,
            "otp": otp,
            "new_password": password,
            "confirm_new_password": password,
        })

    def test_request_response_is_generic_and_only_eligible_accounts_receive_email(self):
        known = self.request_code()
        unknown = self.request_code("unknown@example.com")

        self.assertEqual(known.status_code, 200)
        self.assertEqual(unknown.status_code, 200)
        self.assertEqual(known.json()["message"], unknown.json()["message"])
        self.assertEqual(set(known.json()), set(unknown.json()))
        self.assertEqual(len(self.mail.call_args_list), 1)
        self.assertEqual(self.mail.call_args.args[0], "parent@example.com")
        self.assertRegex(self.mail.call_args.args[2], r"\b123456\b")
        self.assertNotIn("123456", known.text)

    def test_success_updates_hash_only_after_otp_and_prevents_replay(self):
        before = self.user("parent@example.com").password_hash
        requested = self.request_code()
        challenge_id = requested.json()["challenge_id"]

        self.assertEqual(self.user("parent@example.com").password_hash, before)
        with Session(self.engine) as session:
            row = session.scalar(select(PasswordRecoveryChallenge))
            self.assertNotEqual(row.otp_digest, "123456")
            self.assertEqual(len(row.otp_digest), 64)

        result = self.verify_code(challenge_id)
        self.assertEqual(result.status_code, 200)
        updated_hash = self.user("parent@example.com").password_hash
        self.assertNotEqual(updated_hash, before)
        self.assertTrue(verify_password("New-password2!", updated_hash))
        self.assertFalse(verify_password("Old-password1!", updated_hash))
        self.assertEqual(self.verify_code(challenge_id).status_code, 400)

    def test_expired_code_is_rejected(self):
        challenge_id = self.request_code().json()["challenge_id"]
        self.stamp += timedelta(minutes=5)

        self.assertEqual(self.verify_code(challenge_id).status_code, 400)
        self.assertTrue(verify_password("Old-password1!", self.user("parent@example.com").password_hash))

    def test_failed_attempt_limit_locks_verification(self):
        challenge_id = self.request_code().json()["challenge_id"]
        for _ in range(recovery.MAX_FAILED_ATTEMPTS):
            result = self.verify_code(challenge_id, otp="000000")
            self.assertEqual(result.status_code, 400)

        self.assertEqual(self.verify_code(challenge_id).status_code, 429)
        self.assertTrue(verify_password("Old-password1!", self.user("parent@example.com").password_hash))

    def test_lockout_is_not_cleared_by_the_original_window_boundary(self):
        first = self.request_code()
        self.stamp += timedelta(hours=24)
        second = self.request_code()
        self.stamp += timedelta(hours=23, minutes=59)
        third = self.request_code(challenge_id=second.json()["challenge_id"])
        for _ in range(recovery.MAX_FAILED_ATTEMPTS):
            self.assertEqual(self.verify_code(third.json()["challenge_id"], otp="000000").status_code, 400)

        self.stamp = datetime(2026, 1, 3, 12, 0, 0)
        self.assertEqual(self.request_code().status_code, 429)
        self.stamp += timedelta(hours=24)
        self.assertEqual(self.request_code().status_code, 200)

    def test_resend_cooldown_limit_and_old_challenge_invalidation(self):
        first = self.request_code()
        first_id = first.json()["challenge_id"]
        self.assertEqual(self.request_code(challenge_id=first_id).status_code, 429)

        self.stamp += timedelta(seconds=60)
        second = self.request_code(challenge_id=first_id, code=654321)
        second_id = second.json()["challenge_id"]
        self.assertNotEqual(first_id, second_id)
        self.assertEqual(self.verify_code(first_id).status_code, 400)

        self.stamp += timedelta(seconds=60)
        third = self.request_code(challenge_id=second_id, code=333333)
        self.stamp += timedelta(seconds=60)
        self.assertEqual(self.request_code(challenge_id=third.json()["challenge_id"]).status_code, 429)
        self.assertEqual(self.mail.call_count, 3)

    def test_repeated_request_limit_is_persistent(self):
        first = self.request_code()
        for _ in range(recovery.MAX_REQUESTS_PER_WINDOW - 1):
            self.assertEqual(self.request_code(challenge_id=first.json()["challenge_id"]).status_code, 429)

        self.stamp += timedelta(seconds=60)
        self.assertEqual(self.request_code().status_code, 429)
        self.assertEqual(self.mail.call_count, 1)

    def test_google_only_account_does_not_receive_otp_or_gain_password_access(self):
        self.add_user("google@example.com", None)
        result = self.request_code("google@example.com")

        self.assertEqual(result.status_code, 200)
        self.assertEqual(self.mail.call_count, 0)
        self.assertEqual(self.verify_code(result.json()["challenge_id"]).status_code, 400)
        self.assertIsNone(self.user("google@example.com").password_hash)

    def test_challenge_cannot_be_rebound_to_another_email(self):
        self.add_user("other@example.com", "Other-password1!")
        first = self.request_code()

        result = self.request_code("other@example.com", challenge_id=first.json()["challenge_id"])

        self.assertEqual(result.status_code, 400)
        self.assertEqual(self.mail.call_count, 1)
        self.assertTrue(verify_password("Other-password1!", self.user("other@example.com").password_hash))

    def test_mismatched_new_passwords_are_rejected(self):
        challenge_id = self.request_code().json()["challenge_id"]
        result = self.client.post("/api/auth/password-reset/verify", json={
            "challenge_id": challenge_id,
            "otp": "123456",
            "new_password": "New-password2!",
            "confirm_new_password": "Different-password3!",
        })

        self.assertEqual(result.status_code, 422)
        self.assertTrue(verify_password("Old-password1!", self.user("parent@example.com").password_hash))


if __name__ == "__main__":
    unittest.main()