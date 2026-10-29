import re

from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr, field_validator, model_validator

from app.schemas.auth import RegisterRequest


class PasswordResetRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr = Field(max_length=100)
    challenge_id: str | None = Field(default=None, min_length=43, max_length=43, pattern=r"^[A-Za-z0-9_-]+$")

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value):
        return value.strip().lower() if isinstance(value, str) else value


class PasswordResetVerify(BaseModel):
    model_config = ConfigDict(extra="forbid")

    challenge_id: str = Field(min_length=43, max_length=43, pattern=r"^[A-Za-z0-9_-]+$")
    otp: SecretStr = Field(min_length=6, max_length=6)
    new_password: SecretStr = Field(min_length=8, max_length=1024)
    confirm_new_password: SecretStr = Field(min_length=8, max_length=1024)

    @field_validator("otp")
    @classmethod
    def otp_digits_only(cls, value):
        if not re.fullmatch(r"[0-9]{6}", value.get_secret_value()):
            raise ValueError("Enter the 6-digit verification code.")
        return value

    @field_validator("new_password")
    @classmethod
    def enforce_password_rules(cls, value):
        return RegisterRequest.strong_password(value)

    @model_validator(mode="after")
    def passwords_match(self):
        if self.new_password.get_secret_value() != self.confirm_new_password.get_secret_value():
            raise ValueError("Passwords must match.")
        return self