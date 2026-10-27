from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, defer
from app.core.config import get_settings
from app.core.dependencies import current_user
from app.core.security import hash_password, verify_password, create_token, DUMMY_HASH
from app.database.connection import get_db
from app.models.user import User
from app.schemas.auth import RegisterRequest, LoginRequest, RegistrationResponse, LoginResponse, UserProfile

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

@router.post("/register", response_model=RegistrationResponse, status_code=201)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.email == str(body.email))):
        raise HTTPException(409, "Email is already registered")
    user = User(name=body.name, email=str(body.email), phone=body.phone or None, password_hash=hash_password(body.password.get_secret_value()), role="parent", account_status="active")
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if getattr(exc.orig, "args", (None,))[0] == 1062:
            raise HTTPException(409, "Email is already registered") from None
        raise HTTPException(503, "Unable to create account") from None
    db.refresh(user)
    return {"message": "Account created", "user": user}

@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    # Password authentication does not require optional Google/photo migrations.
    user = db.scalar(select(User).options(defer(User.google_sub), defer(User.profile_photo)).where(User.email == str(body.email)))
    valid = verify_password(body.password.get_secret_value(), user.password_hash if user and user.password_hash else DUMMY_HASH)
    if not user or not user.password_hash or not valid:
        raise HTTPException(401, "Incorrect email or password", headers={"WWW-Authenticate": "Bearer"})
    if user.account_status != "active":
        raise HTTPException(403, "Account is not active")
    return {"access_token": create_token(user.user_id), "expires_in": get_settings().JWT_EXPIRE_MINUTES * 60, "user": user}

@router.get("/me", response_model=UserProfile)
def me(user: User = Depends(current_user)):
    return user
