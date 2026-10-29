import hashlib
import hmac
import secrets
import math
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session, defer

from app.core.config import get_settings
from app.core.security import hash_password
from app.database.connection import get_db
from app.models.password_recovery import PasswordRecoveryChallenge
from app.models.user import User
from app.schemas.password_recovery import PasswordResetRequest, PasswordResetVerify
from app.services.email_service import send_email

router = APIRouter(prefix="/api/auth/password-reset", tags=["Password recovery"])
OTP_LIFETIME = timedelta(seconds=60)
RESEND_INTERVAL = timedelta(seconds=60)
RATE_WINDOW = timedelta(hours=24)
LOCKOUT_PERIOD = timedelta(hours=24)
MAX_FAILED_ATTEMPTS = 3
MAX_SENDS_PER_WINDOW = 3
LIMIT_MESSAGE = "You have reached the OTP limit. Please try again after 24 hours."
GENERIC_REQUEST_MESSAGE = "If an eligible account matches, a verification code will be sent."


def now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _configured():
    settings = get_settings()
    secret = settings.PASSWORD_RECOVERY_SECRET.get_secret_value()
    if secret:
        if len(secret) < 32:
            raise HTTPException(503, "Password recovery is not configured.")
        return secret.encode()
    jwt_secret = settings.JWT_SECRET.get_secret_value().encode()
    if len(jwt_secret) < 32:
        raise HTTPException(503, "Password recovery is not configured.")
    return hmac.new(jwt_secret, b"juvcare:password-recovery:v1", hashlib.sha256).digest()


def _digest(key: bytes, kind: str, value: str) -> str:
    return hmac.new(key, f"{kind}:{value}".encode(), hashlib.sha256).hexdigest()


def _locked_challenge(db: Session, email_digest: str, stamp: datetime) -> PasswordRecoveryChallenge:
    values = {
        "email_digest": email_digest,
        "challenge_digest": secrets.token_hex(32),
        "window_started_at": stamp,
    }
    dialect = db.get_bind().dialect.name
    if dialect == "mysql":
        statement = mysql_insert(PasswordRecoveryChallenge).values(**values)
        db.execute(statement.on_duplicate_key_update(email_digest=statement.inserted.email_digest))
    elif dialect == "sqlite":
        db.execute(sqlite_insert(PasswordRecoveryChallenge).values(**values).on_conflict_do_nothing(index_elements=[PasswordRecoveryChallenge.email_digest]))
    else:
        raise HTTPException(503, "Password recovery storage is unavailable.")
    return db.scalar(
        select(PasswordRecoveryChallenge)
        .where(PasswordRecoveryChallenge.email_digest == email_digest)
        .with_for_update()
        .execution_options(populate_existing=True)
    )


def _reset_window(row: PasswordRecoveryChallenge, stamp: datetime) -> None:
    if row.locked_until and row.locked_until > stamp:
        return
    if row.locked_until or stamp >= row.window_started_at + RATE_WINDOW:
        row.window_started_at = stamp
        row.failed_attempts = 0
        row.request_count = 0
        row.locked_until = None


def _send_times(row, stamp):
    # Older rows lack exact timestamps. Conservatively retain their send budget
    # for 24 hours from first use after migration rather than bypassing limits.
    if row.send_history is None:
        last_known_activity = max(value for value in (row.window_started_at, row.next_send_at, row.expires_at) if value is not None)
        recent = last_known_activity + RATE_WINDOW > stamp
        history = [stamp] * min(row.send_count, MAX_SENDS_PER_WINDOW) if recent else []
    else:
        history = [datetime.fromisoformat(value) for value in row.send_history]
    history = sorted(value for value in history if value + RATE_WINDOW > stamp)
    row.send_history = [value.isoformat() for value in history]
    row.send_count = len(history)
    return history


def _limit_error(until, stamp):
    seconds = max(1, math.ceil((until - stamp).total_seconds()))
    return HTTPException(429, f"{LIMIT_MESSAGE} Try again in {seconds} seconds.",
                         headers={"Retry-After": str(seconds)})


def _send_otp_email(recipient: str, otp: str) -> None:
    try:
        send_email(
            recipient,
            "JuvCare password reset code",
            f"Your JuvCare password reset code is {otp}. It expires in 60 seconds. Do not share it.",
        )
    except Exception:
        pass


@router.post("/request")
def request_password_reset(
    body: PasswordResetRequest,
    tasks: BackgroundTasks,
    response: Response,
    db: Session = Depends(get_db),
):
    key = _configured()
    response.headers["Cache-Control"] = "no-store"
    stamp = now()
    normalized_email = str(body.email).strip().lower()
    email_digest = _digest(key, "email", normalized_email)
    challenge_id = secrets.token_urlsafe(32)
    otp = f"{secrets.randbelow(1_000_000):06d}"

    row = _locked_challenge(db, email_digest, stamp)
    history = _send_times(row, stamp)
    _reset_window(row, stamp)
    row.request_count += 1

    if row.locked_until and row.locked_until > stamp:
        db.commit()
        raise _limit_error(row.locked_until, stamp)
    if len(history) >= MAX_SENDS_PER_WINDOW:
        unlock = history[0] + RATE_WINDOW
        db.commit()
        raise _limit_error(unlock, stamp)
    if row.next_send_at and stamp < row.next_send_at:
        db.commit()
        raise HTTPException(429, "Please wait until the current code expires before requesting another code.")
    if body.challenge_id and not hmac.compare_digest(
        row.challenge_digest, _digest(key, "challenge", body.challenge_id)
    ):
        db.commit()
        raise HTTPException(400, "Invalid or expired password reset request.")

    user = db.scalar(
        select(User)
        .options(defer(User.google_sub), defer(User.profile_photo))
        .where(func.lower(User.email) == normalized_email)
        .with_for_update()
    )
    eligible = bool(user and user.password_hash and user.account_status == "active")
    row.user_id = user.user_id if eligible else None
    row.challenge_digest = _digest(key, "challenge", challenge_id)
    row.otp_digest = _digest(key, "otp", f"{challenge_id}:{otp}:{email_digest}") if eligible else None
    row.expires_at = stamp + OTP_LIFETIME
    row.next_send_at = stamp + RESEND_INTERVAL
    row.consumed_at = None
    history.append(stamp)
    row.send_history = [value.isoformat() for value in history]
    row.send_count = len(history)
    db.commit()

    if eligible:
        tasks.add_task(_send_otp_email, user.email, otp)

    return {
        "message": GENERIC_REQUEST_MESSAGE,
        "challenge_id": challenge_id,
        "expires_in": int(OTP_LIFETIME.total_seconds()),
        "retry_after": int(RESEND_INTERVAL.total_seconds()),
        "sends_remaining": MAX_SENDS_PER_WINDOW - len(history),
        "send_limit_retry_after": max(0, math.ceil((history[0] + RATE_WINDOW - stamp).total_seconds())) if len(history) >= MAX_SENDS_PER_WINDOW else 0,
    }


@router.post("/verify")
def verify_password_reset(
    body: PasswordResetVerify,
    response: Response,
    db: Session = Depends(get_db),
):
    key = _configured()
    response.headers["Cache-Control"] = "no-store"
    stamp = now()
    challenge_digest = _digest(key, "challenge", body.challenge_id)
    row = db.scalar(
        select(PasswordRecoveryChallenge)
        .where(PasswordRecoveryChallenge.challenge_digest == challenge_digest)
        .with_for_update()
    )
    invalid = HTTPException(400, "Invalid or expired verification code.")
    if not row or row.consumed_at:
        raise invalid
    if row.locked_until and row.locked_until > stamp:
        db.commit()
        raise _limit_error(row.locked_until, stamp)
    if not row.expires_at:
        raise invalid
    if stamp >= row.expires_at:
        row.otp_digest = None
        row.consumed_at = stamp
        db.commit()
        raise invalid

    expected_otp_digest = _digest(
        key,
        "otp",
        f"{body.challenge_id}:{body.otp.get_secret_value()}:{row.email_digest}",
    )
    user = db.scalar(select(User).where(User.user_id == row.user_id).with_for_update()) if row.user_id else None
    eligible = bool(
        user
        and user.password_hash
        and user.account_status == "active"
        and hmac.compare_digest(row.email_digest, _digest(key, "email", user.email.strip().lower()))
    )
    if not eligible or not hmac.compare_digest(row.otp_digest or "", expected_otp_digest):
        row.failed_attempts += 1
        if row.failed_attempts >= MAX_FAILED_ATTEMPTS:
            row.otp_digest = None
            row.locked_until = stamp + LOCKOUT_PERIOD
        db.commit()
        if row.failed_attempts >= MAX_FAILED_ATTEMPTS:
            raise _limit_error(row.locked_until, stamp)
        raise invalid

    user.password_hash = hash_password(body.new_password.get_secret_value())
    row.otp_digest = None
    row.consumed_at = stamp
    db.commit()
    return {"message": "Password updated. You can now sign in."}