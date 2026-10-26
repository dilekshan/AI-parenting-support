r"""Interactive, local-only bootstrap. Never imported by the web application.

Run from the project root:
    .\Backend\venv\Scripts\python.exe .\Backend\scripts\setup_admin.py
"""
import getpass
import sys
import warnings
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pydantic import ValidationError
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from app.core.security import hash_password
from app.database.connection import get_engine
from app.models.user import User
from app.schemas.auth import RegisterRequest

LOCK_NAME = "juvcare_private_admin_bootstrap"


class SetupRefused(Exception):
    """Safe, non-sensitive explanation suitable for terminal output."""


def insert_admin(db: Session, details: RegisterRequest):
    """Caller must hold the bootstrap lock and own the transaction."""
    if db.scalar(select(User.user_id).where(User.role == "admin").limit(1).with_for_update()) is not None:
        raise SetupRefused("An admin account already exists. Nothing changed.")
    if db.scalar(select(User.user_id).where(User.email == str(details.email)).limit(1).with_for_update()) is not None:
        raise SetupRefused("An account with that email already exists. Nothing changed.")
    user = User(name=details.name, email=str(details.email),
                password_hash=hash_password(details.password.get_secret_value()),
                role="admin", account_status="active")
    db.add(user)
    db.flush()
    db.refresh(user)
    if user.role != "admin" or user.account_status != "active":
        raise SetupRefused("Account verification failed. Transaction rolled back.")
    return user.user_id


def setup_admin(details: RegisterRequest):
    engine = get_engine()
    try:
        with engine.connect() as connection:
            locked = False
            try:
                # Connection-scoped lock prevents two copies of this script from
                # both observing no admin. It remains held through commit.
                locked = connection.scalar(text("SELECT GET_LOCK(:name, 0)"), {"name": LOCK_NAME}) == 1
                connection.commit()
                if not locked:
                    raise SetupRefused("Another admin setup is running. Nothing changed.")
                with Session(bind=connection, expire_on_commit=False) as db:
                    with db.begin():
                        user_id = insert_admin(db, details)
                    # Verify the committed row without returning personal data.
                    verified = db.execute(select(User.role, User.account_status).where(User.user_id == user_id)).one()
                    if tuple(verified) != ("admin", "active"):
                        raise SetupRefused("Setup completed but verification failed; inspect the account before retrying.")
            finally:
                connection.rollback()
                if locked:
                    connection.execute(text("SELECT RELEASE_LOCK(:name)"), {"name": LOCK_NAME})
                    connection.commit()
    finally:
        engine.dispose()


def main():
    if not sys.stdin.isatty():
        print("Run this script interactively in your local terminal; redirected input is not accepted.")
        return 1
    try:
        name = input("Admin name: ").strip()
        email = input("Admin email: ").strip()
        # Refuse getpass's fallback to echoed input on unsupported terminals.
        with warnings.catch_warnings():
            warnings.simplefilter("error", getpass.GetPassWarning)
            password = getpass.getpass("Admin password: ")
            confirmation = getpass.getpass("Confirm password: ")
        if password != confirmation:
            raise SetupRefused("Passwords do not match. Nothing changed.")
        details = RegisterRequest(name=name, email=email, password=password)
        del password, confirmation
        setup_admin(details)
        print("Admin account created and verified: role=admin, account_status=active. Sign in at /login.")
        return 0
    except ValidationError:
        print("Invalid name, email or password. Password must have at least 8 characters, uppercase, lowercase, a number and a symbol. Nothing changed.")
    except SetupRefused as exc:
        print(str(exc))
    except getpass.GetPassWarning:
        print("Hidden password input is unavailable. Use the VS Code terminal. Nothing changed.")
    except (KeyboardInterrupt, EOFError):
        print("\nSetup cancelled.")
    except SQLAlchemyError:
        # Do not expose SQL parameters, credentials, or exception tracebacks.
        print("Database operation failed. No credentials were displayed. Check database availability; the script will refuse an existing admin on retry.")
    except Exception:
        print("Setup failed. Check the local backend configuration. No credentials were displayed.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
