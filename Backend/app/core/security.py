from datetime import datetime, timedelta, timezone
import jwt
from pwdlib import PasswordHash
from pwdlib.exceptions import UnknownHashError
from app.core.config import get_settings

password_hasher = PasswordHash.recommended()
DUMMY_HASH = password_hasher.hash("unused-timing-equalization-password")

# Store a secure password hash rather than the original password.
def hash_password(password):
    return password_hasher.hash(password)

# Compare a supplied password with its stored hash safely.
def verify_password(password, hashed):
    try:
        return password_hasher.verify(password, hashed)
    except (ValueError, UnknownHashError):
        # Invalid stored hashes must never leak into API responses.
        return False

# Issue a time-limited signed session for this account.
def create_token(user_id):
    s = get_settings()
    now = datetime.now(timezone.utc)
    return jwt.encode({"sub": str(user_id), "iat": now, "exp": now + timedelta(minutes=s.JWT_EXPIRE_MINUTES), "iss": "juvcare", "aud": "juvcare-web"}, s.JWT_SECRET.get_secret_value(), algorithm="HS256")

# Check the signature, expiry and intended recipient before trusting a session.
def decode_token(token):
    return jwt.decode(token, get_settings().JWT_SECRET.get_secret_value(), algorithms=["HS256"], issuer="juvcare", audience="juvcare-web", options={"require": ["sub", "exp", "iat"]})
