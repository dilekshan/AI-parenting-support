from datetime import datetime, timedelta, timezone
import jwt
from pwdlib import PasswordHash
from pwdlib.exceptions import UnknownHashError
from app.core.config import get_settings

password_hasher = PasswordHash.recommended()
DUMMY_HASH = password_hasher.hash("unused-timing-equalization-password")

def hash_password(password):
    return password_hasher.hash(password)

def verify_password(password, hashed):
    try:
        return password_hasher.verify(password, hashed)
    except (ValueError, UnknownHashError):
        # Invalid stored hashes must never leak into API responses.
        return False

def create_token(user_id):
    s = get_settings()
    now = datetime.now(timezone.utc)
    return jwt.encode({"sub": str(user_id), "iat": now, "exp": now + timedelta(minutes=s.JWT_EXPIRE_MINUTES), "iss": "juvcare", "aud": "juvcare-web"}, s.JWT_SECRET.get_secret_value(), algorithm="HS256")

def decode_token(token):
    return jwt.decode(token, get_settings().JWT_SECRET.get_secret_value(), algorithms=["HS256"], issuer="juvcare", audience="juvcare-web", options={"require": ["sub", "exp", "iat"]})
