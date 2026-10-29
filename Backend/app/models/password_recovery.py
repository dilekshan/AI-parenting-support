from sqlalchemy import JSON, DateTime, Integer, String, text
from sqlalchemy.orm import mapped_column

from app.database.base import Base


class PasswordRecoveryChallenge(Base):
    __tablename__ = "password_recovery_challenges"

    id = mapped_column(Integer, primary_key=True, autoincrement=True)
    # The explicit migration attaches the FK using the physical MySQL table casing.
    user_id = mapped_column(Integer, nullable=True, index=True)
    email_digest = mapped_column(String(64), nullable=False, unique=True)
    challenge_digest = mapped_column(String(64), nullable=False, unique=True)
    otp_digest = mapped_column(String(64), nullable=True)
    failed_attempts = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    request_count = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    send_count = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    window_started_at = mapped_column(DateTime, nullable=False)
    expires_at = mapped_column(DateTime, nullable=True)
    next_send_at = mapped_column(DateTime, nullable=True)
    locked_until = mapped_column(DateTime, nullable=True)
    consumed_at = mapped_column(DateTime, nullable=True)
    # Up to three UTC generation timestamps enforce an exact rolling window.
    send_history = mapped_column(JSON, nullable=True)
