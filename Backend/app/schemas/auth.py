import re
import string
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr, field_validator

class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr = Field(max_length=100)
    password: SecretStr = Field(min_length=1, max_length=1024)

class RegisterRequest(LoginRequest):
    name: str = Field(min_length=1, max_length=100)
    phone: str | None = Field(default=None, max_length=20)

    @field_validator("name", mode="before")
    @classmethod
    def name_required(cls, value):
        if isinstance(value, str):
            value = value.strip()
            if not value:
                raise ValueError("Please enter your full name")
        return value

    @field_validator("email", mode="before")
    @classmethod
    def email_syntax(cls, value):
        if not isinstance(value, str):
            raise ValueError("Please enter a valid email address")
        value = value.translate(str.maketrans(string.ascii_uppercase, string.ascii_lowercase)).rstrip()
        if not re.match(r"^[a-z]", value):
            raise ValueError("Email must start with an English letter (a-z), not a number, symbol or space")
        parts = value.split("@")
        valid = len(parts) == 2
        if valid:
            local, domain = parts
            labels = domain.split(".")
            valid = (len(value) <= 100 and 0 < len(local) <= 64
                     and re.fullmatch(r"[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+", local)
                     and not local.startswith(".") and not local.endswith(".") and ".." not in local
                     and len(labels) >= 2
                     and all(re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?", label) for label in labels)
                     and re.fullmatch(r"[A-Za-z]{2,63}", labels[-1]))
        if not valid:
            raise ValueError("Please enter a valid email address")
        return value

    @field_validator("phone", mode="before")
    @classmethod
    def sri_lankan_mobile(cls, value):
        if value is None:
            return None
        if not isinstance(value, str):
            raise ValueError("Please enter a valid Sri Lankan mobile number.")
        value = value.strip()
        if not value:
            return None
        if not re.fullmatch(r"(?:(?:0|\+94|94)7[01245678][0-9]{7})", value):
            raise ValueError("Please enter a valid Sri Lankan mobile number.")
        return "+94" + value[1:] if value.startswith("0") else value if value.startswith("+") else "+" + value

    @field_validator("password")
    @classmethod
    def strong_password(cls, value):
        password = value.get_secret_value()
        missing = []
        if len(password) < 8:
            missing.append("at least 8 characters")
        if not re.search(r"[A-Z]", password):
            missing.append("an uppercase letter (A-Z)")
        if not re.search(r"[a-z]", password):
            missing.append("a lowercase letter (a-z)")
        if not re.search(r"[0-9]", password):
            missing.append("a number (0-9)")
        if not any(char in string.punctuation for char in password):
            missing.append("a special character (e.g. @, #, $, !)")
        if missing:
            raise ValueError("Password must contain " + ", ".join(missing) + ".")
        return value

class UserProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    user_id: int
    name: str
    email: str
    phone: str | None
    role: Literal["parent", "admin"]
    account_status: Literal["active"]
    created_at: datetime
    profile_photo_url: str | None = None

class RegistrationResponse(BaseModel):
    message: str
    user: UserProfile

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserProfile
