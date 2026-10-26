import os
import asyncio
import json
import secrets
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

os.environ.setdefault("JWT_SECRET", secrets.token_urlsafe(48))
os.environ.setdefault("DB_HOST", "localhost")
os.environ.setdefault("DB_USER", "test")
os.environ.setdefault("DB_PASSWORD", "unused")

import jwt
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import ValidationError
from app.core.config import get_settings
from app.core.dependencies import current_user
from app.core.security import hash_password, verify_password, create_token, decode_token
from app.models.user import User
from app.routers.auth import register, login
from app.schemas.auth import RegisterRequest, LoginRequest, RegistrationResponse, LoginResponse

class AuthTests(unittest.TestCase):
    def setUp(self):
        self.db = MagicMock()
        self.user = User(user_id=1, name="Test Parent", email="parent@example.com", phone=None, password_hash=hash_password("Test-password1!"), role="parent", account_status="active", created_at=datetime.now())

    def test_registration_hash_and_safe_response(self):
        self.db.scalar.return_value = None
        def refresh(user):
            user.user_id = 1
            user.created_at = datetime.now()
        self.db.refresh.side_effect = refresh
        result = register(RegisterRequest(name="Test Parent", email="parent@example.com", password="Test-password1!"), self.db)
        user = result["user"]
        self.assertEqual(user.role, "parent")
        self.assertEqual(user.account_status, "active")
        self.assertTrue(user.password_hash.startswith("$argon2id$"))
        self.assertTrue(verify_password("Test-password1!", user.password_hash))
        self.db.commit.assert_called_once()
        self.assertNotIn("password", RegistrationResponse.model_validate(result).model_dump_json())

    def test_duplicate(self):
        self.db.scalar.return_value = self.user
        with self.assertRaises(HTTPException) as error:
            register(RegisterRequest(name="Test", email="parent@example.com", password="Test-password1!"), self.db)
        self.assertEqual(error.exception.status_code, 409)
        self.db.add.assert_not_called()

    def test_login_and_me(self):
        self.db.scalar.return_value = self.user
        result = login(LoginRequest(email="parent@example.com", password="Test-password1!"), self.db)
        self.assertEqual(decode_token(result["access_token"])["sub"], "1")
        self.assertNotIn("password", LoginResponse.model_validate(result).model_dump_json())
        self.db.get.return_value = self.user
        self.assertEqual(current_user(HTTPAuthorizationCredentials(scheme="Bearer", credentials=result["access_token"]), self.db).user_id, 1)

    def test_wrong_password(self):
        self.db.scalar.return_value = self.user
        with self.assertRaises(HTTPException) as error:
            login(LoginRequest(email="parent@example.com", password="wrong"), self.db)
        self.assertEqual(error.exception.status_code, 401)

    def test_unknown_email(self):
        self.db.scalar.return_value = None
        with self.assertRaises(HTTPException) as error:
            login(LoginRequest(email="unknown@example.com", password="wrong"), self.db)
        self.assertEqual(error.exception.status_code, 401)

    def test_malformed_hash(self):
        self.assertFalse(verify_password("test", "$argon2id$broken"))

    def test_mobile_prefixes_and_lengths(self):
        base = dict(name="Parent", email="parent@example.com", password="Test-password1!")
        for prefix in ("070", "071", "072", "074", "075", "076", "077", "078", "073", "079"):
            local = prefix + "1234567"
            for phone in (local, "+94" + local[1:], "94" + local[1:]):
                with self.subTest(phone=phone):
                    if prefix in ("073", "079"):
                        with self.assertRaises(ValidationError) as error:
                            RegisterRequest(**base, phone=phone)
                        self.assertIn("Please enter a valid Sri Lankan mobile number.", str(error.exception))
                    else:
                        self.assertEqual(RegisterRequest(**base, phone=phone).phone, "+94" + local[1:])
                    for bad in (phone[:-1], phone + "0"):
                        with self.assertRaises(ValidationError):
                            RegisterRequest(**base, phone=bad)
        for phone in (None, "", "  "):
            self.assertIsNone(RegisterRequest(**base, phone=phone).phone)

    def test_registration_password_strength(self):
        base = dict(name="Parent", email="parent@example.com")
        for password in ("", "Ab1!xyz", "abcdef1!", "ABCDEF1!", "Abcdefg!", "Abcdef12", "Abcdef1 "):
            with self.subTest(password_case=len(password)):
                with self.assertRaises(ValidationError):
                    RegisterRequest(**base, password=password)
        for password in ("Abcdef1!", "Strong#Pass9", " Abcdef1! "):
            self.assertEqual(RegisterRequest(**base, password=password).password.get_secret_value(), password)
        # Existing accounts are still allowed to log in with older passwords.
        self.assertEqual(LoginRequest(email="parent@example.com", password="old").password.get_secret_value(), "old")

    def test_missing_fields(self):
        for data in ({}, {"email": "parent@example.com"}, {"email": "parent@example.com", "password": ""}):
            with self.assertRaises(ValidationError):
                LoginRequest(**data)

    def test_duplicate_race_rolls_back(self):
        from sqlalchemy.exc import IntegrityError
        self.db.scalar.return_value = None
        self.db.commit.side_effect = IntegrityError("insert", {}, Exception(1062, "duplicate"))
        with self.assertRaises(HTTPException) as error:
            register(RegisterRequest(name="Parent", email="parent@example.com", password="Test-password1!"), self.db)
        self.assertEqual(error.exception.status_code, 409)
        self.db.rollback.assert_called_once()

    def test_database_failure_rolls_back_and_closes(self):
        from sqlalchemy.exc import OperationalError
        from app.database.connection import get_db
        with patch("app.database.connection.get_engine"), patch("app.database.connection.sessionmaker", return_value=lambda: self.db):
            session = get_db()
            next(session)
            with self.assertRaises(HTTPException) as error:
                session.throw(OperationalError("query", {}, Exception("sensitive database detail")))
            self.assertEqual(error.exception.status_code, 503)
            self.assertNotIn("sensitive", error.exception.detail)
            self.db.rollback.assert_called_once()
            self.db.close.assert_called_once()

    def test_invalid_and_expired_tokens(self):
        now = datetime.now(timezone.utc)
        expired = jwt.encode({"sub": "1", "iat": now - timedelta(minutes=2), "exp": now - timedelta(minutes=1), "iss": "juvcare", "aud": "juvcare-web"}, get_settings().JWT_SECRET.get_secret_value(), algorithm="HS256")
        for token in ("invalid", expired):
            with self.assertRaises(HTTPException) as error:
                current_user(HTTPAuthorizationCredentials(scheme="Bearer", credentials=token), self.db)
            self.assertEqual(error.exception.status_code, 401)

    def test_validation_and_role_injection(self):
        for changes in ({"name": " "}, {"email": "invalid"}, {"role": "admin"}, {"password": " "}, {"phone": "1" * 21}):
            data = dict(name="Parent", email="parent@example.com", password="Test-password1!")
            data.update(changes)
            with self.assertRaises(ValidationError):
                RegisterRequest(**data)

class HttpTests(unittest.TestCase):
    def test_http_workflow_with_isolated_session(self):
        from app.main import app
        from app.database.connection import get_db
        db = MagicMock()
        users = {}
        db.scalar.side_effect = lambda query: next(iter(users.values()), None)
        def add(user):
            user.user_id = 10
            user.created_at = datetime.now()
            users[10] = user
        db.add.side_effect = add
        db.get.side_effect = lambda model, key: users.get(key)
        app.dependency_overrides[get_db] = lambda: db
        async def request(path, data=None, token=None):
            messages = []
            body = json.dumps(data).encode() if data is not None else b""
            async def receive():
                return {"type": "http.request", "body": body, "more_body": False}
            async def send(message):
                messages.append(message)
            headers = [(b"content-type", b"application/json")]
            if token:
                headers.append((b"authorization", ("Bearer " + token).encode()))
            await app({"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": "POST" if data is not None else "GET", "scheme": "http", "path": path, "raw_path": path.encode(), "query_string": b"", "headers": headers, "server": ("test", 80), "client": ("test", 1), "root_path": ""}, receive, send)
            status = next(m["status"] for m in messages if m["type"] == "http.response.start")
            output = json.loads(b"".join(m.get("body", b"") for m in messages if m["type"] == "http.response.body"))
            return status, output
        async def workflow():
            async with app.router.lifespan_context(app):
                status, _ = await request("/health")
                self.assertEqual(status, 200)
                payload = {"name": "Test Parent", "email": "parent@example.com", "password": "Test-password1!"}
                for field, value in [("name", " "), ("email", "nameexample.com"), ("email", "name@"), ("email", "a..b@example.com"), ("phone", "letters"), ("phone", "07123"), ("phone", "0812345678"), ("phone", "0731234567"), ("phone", "0791234567"), ("phone", "+94731234567"), ("phone", "+94791234567"), ("phone", "94731234567"), ("phone", "94791234567")]:
                    status, _ = await request("/api/auth/register", {**payload, field: value})
                    self.assertEqual(status, 422)
                for password in ("Ab1!xyz", "abcdef1!", "ABCDEF1!", "Abcdefg!", "Abcdef12"):
                    status, _ = await request("/api/auth/register", {**payload, "password": password})
                    self.assertEqual(status, 422)
                db.add.assert_not_called()
                for phone in (None, "", "0712345678", "+94712345678", "94712345678"):
                    parsed = RegisterRequest(**payload, phone=phone)
                    self.assertEqual(parsed.phone, "+94712345678" if phone else None)
                status, result = await request("/api/auth/register", payload)
                self.assertEqual(status, 201)
                self.assertNotIn("password", json.dumps(result))
                self.assertEqual((await request("/api/auth/register", payload))[0], 409)
                credentials = {"email": payload["email"], "password": payload["password"]}
                status, result = await request("/api/auth/login", credentials)
                self.assertEqual(status, 200)
                self.assertEqual((await request("/api/auth/me", token=result["access_token"]))[0], 200)
                self.assertEqual((await request("/api/auth/me", token="invalid"))[0], 401)
                self.assertEqual((await request("/api/auth/login", {**credentials, "password": "wrong"}))[0], 401)
                status, result = await request("/api/auth/register", {**payload, "role": "admin"})
                self.assertEqual(status, 422)
                self.assertNotIn("Test-password1!", json.dumps(result))
        try:
            asyncio.run(workflow())
        finally:
            app.dependency_overrides.clear()

if __name__ == "__main__":
    unittest.main()
