"""Google OIDC authorization-code flow. No password-account auto-linking."""
from datetime import datetime, timedelta, timezone
from functools import lru_cache
import secrets
import jwt
from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.core.config import get_settings
from app.core.dependencies import current_user
from app.core.security import create_token
from app.database.connection import get_db
from app.models.user import User
from app.schemas.auth import LoginResponse, RegisterRequest, UserProfile

router = APIRouter(prefix="/api/auth/google", tags=["Authentication"])
COOKIE = "juvcare_google_handoff"
COOKIE_PATH = "/api/auth/google/exchange"


@lru_cache
def google_client():
    settings = get_settings()
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET.get_secret_value():
        raise HTTPException(503, "Google login is not configured yet")
    oauth = OAuth()
    return oauth.register(
        name="google", client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET.get_secret_value(),
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile", "code_challenge_method": "S256"},
    )


def frontend_redirect(error=None):
    # Fixed destination; never accept a redirect URL supplied by the browser.
    target = get_settings().FRONTEND_URL.rstrip("/") + "/auth/google/callback"
    response = RedirectResponse(target + ("?error=" + error if error else ""), status_code=303)
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.delete_cookie(COOKIE, path=COOKIE_PATH)
    return response


@router.get("/start")
async def start(request: Request):
    try:
        client = google_client()
    except HTTPException:
        return frontend_redirect("configuration")
    request.session.clear()
    return await client.authorize_redirect(
        request, get_settings().GOOGLE_REDIRECT_URI,
        prompt="select_account", nonce=secrets.token_urlsafe(32),
        code_verifier=secrets.token_urlsafe(48),
    )


@router.get("/callback")
async def callback(request: Request, db: Session = Depends(get_db)):
    try:
        # Authlib checks state and verifies the ID token signature, issuer,
        # audience, expiry and nonce against Google's discovery/JWKS metadata.
        token = await google_client().authorize_access_token(request)
        identity = token.get("userinfo")
        if not identity or identity.get("email_verified") is not True:
            return frontend_redirect("identity")
        subject = identity.get("sub")
        if not isinstance(subject, str) or not subject or len(subject) > 255 or not subject.isascii():
            return frontend_redirect("identity")
    except Exception:
        # Provider responses can contain credentials; never echo or log them.
        return frontend_redirect("authentication")
    finally:
        request.session.clear()

    user = db.scalar(select(User).where(User.google_sub == subject))
    is_new = user is None
    if is_new:
        email = identity.get("email", "").strip().lower()
        if not email or len(email) > 100:
            return frontend_redirect("identity")
        if db.scalar(select(User.user_id).where(User.email == email)) is not None:
            # Email ownership at Google is not ownership of a JuvCare account.
            return frontend_redirect("existing_account")
        name = str(identity.get("name") or email.split("@")[0]).strip()[:100]
        user = User(name=name, email=email, google_sub=subject, password_hash=None,
                    role="parent", account_status="active")
        db.add(user)
        try:
            db.commit()
            db.refresh(user)
        except IntegrityError:
            db.rollback()
            return frontend_redirect("account_conflict")
    if user.role != "parent" or user.account_status != "active":
        return frontend_redirect("permission")

    settings = get_settings()
    now = datetime.now(timezone.utc)
    handoff = jwt.encode({"sub": str(user.user_id), "new_user": is_new,
                          "iat": now, "exp": now + timedelta(seconds=60),
                          "iss": "juvcare", "aud": "juvcare-google-handoff"},
                         settings.JWT_SECRET.get_secret_value(), algorithm="HS256")
    response = frontend_redirect()
    response.set_cookie(COOKIE, handoff, max_age=60, httponly=True,
                        secure=settings.GOOGLE_COOKIE_SECURE, samesite="strict", path=COOKIE_PATH)
    return response


class GoogleLoginResponse(LoginResponse):
    new_user: bool


@router.post("/exchange", response_model=GoogleLoginResponse)
def exchange(request: Request, response: Response, db: Session = Depends(get_db)):
    settings = get_settings()
    if request.headers.get("origin") != settings.FRONTEND_URL.rstrip("/"):
        raise HTTPException(403, "Invalid login origin")
    try:
        payload = jwt.decode(request.cookies.get(COOKIE, ""), settings.JWT_SECRET.get_secret_value(),
                             algorithms=["HS256"], issuer="juvcare", audience="juvcare-google-handoff",
                             options={"require": ["sub", "iat", "exp", "new_user"]})
        user = db.get(User, int(payload["sub"]))
    except (jwt.InvalidTokenError, ValueError, TypeError):
        raise HTTPException(401, "Google login expired. Please try again.") from None
    if not user or not user.google_sub or user.role != "parent" or user.account_status != "active":
        raise HTTPException(403, "Google login is available only for active parent accounts")
    response.delete_cookie(COOKIE, path=COOKIE_PATH)
    response.headers["Cache-Control"] = "no-store"
    return {"access_token": create_token(user.user_id), "expires_in": settings.JWT_EXPIRE_MINUTES * 60,
            "user": user, "new_user": payload["new_user"]}


class GoogleProfileRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    phone: str | None = Field(default=None, max_length=20)

    @field_validator("phone", mode="before")
    @classmethod
    def validate_phone(cls, value):
        return RegisterRequest.sri_lankan_mobile(value)


@router.post("/profile", response_model=UserProfile)
def complete_profile(body: GoogleProfileRequest, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role != "parent" or not user.google_sub:
        raise HTTPException(403, "Google parent account required")
    user.phone = body.phone
    db.commit()
    db.refresh(user)
    return user
