from functools import lru_cache
from pathlib import Path
from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=Path(__file__).resolve().parents[2] / ".env", extra="ignore", hide_input_in_errors=True)
    DB_HOST: str
    DB_PORT: int = 3306
    DB_NAME: str = "juvcare_db"
    DB_USER: str
    DB_PASSWORD: SecretStr
    JWT_SECRET: SecretStr = Field(min_length=32)
    JWT_EXPIRE_MINUTES: int = Field(default=30, ge=1, le=1440)

@lru_cache
def get_settings():
    return Settings()
