import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session, defer
from app.core.security import decode_token
from app.database.connection import get_db
from app.models.user import User

bearer = HTTPBearer(auto_error=False)

# Verify the signed session and load its active account from the database.
def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)):
    unauthorized = HTTPException(401, "Invalid or expired access token", headers={"WWW-Authenticate": "Bearer"})
    if credentials is None:
        raise unauthorized
    try:
        payload = decode_token(credentials.credentials)
        user_id = int(payload["sub"])
    except (jwt.InvalidTokenError, ValueError, TypeError, KeyError):
        raise unauthorized from None
    user = db.get(User, user_id, options=[defer(User.google_sub), defer(User.profile_photo)])
    if not user:
        raise unauthorized
    if user.account_status != "active":
        raise HTTPException(403, "Account is not active")
    return user


# Require an admin role from the database, not from browser input.
def current_admin(user: User = Depends(current_user)):
    if user.role != "admin":
        raise HTTPException(403, "Admin permission required")
    return user
