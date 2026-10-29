"""Explicit additive migration for password recovery storage; never run by the app."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import Column, ForeignKeyConstraint, Integer, MetaData, Table, inspect, text
from sqlalchemy.exc import SQLAlchemyError

from app.database.connection import get_engine
from app.models.password_recovery import PasswordRecoveryChallenge
from app.models.user import User


def build_recovery_table(user_table_name):
    metadata = MetaData()
    Table(user_table_name, metadata, Column("user_id", Integer, primary_key=True))
    table = PasswordRecoveryChallenge.__table__.to_metadata(metadata)
    table.append_constraint(ForeignKeyConstraint(
        ["user_id"], [f"{user_table_name}.user_id"], ondelete="SET NULL"
    ))
    return table


def validate_recovery_foreign_key(inspector, recovery_table_name, user_table_name):
    foreign_keys = inspector.get_foreign_keys(recovery_table_name)
    if not any(
        fk.get("constrained_columns") == ["user_id"]
        and (fk.get("referred_table") or "").casefold() == user_table_name.casefold()
        and fk.get("referred_columns") == ["user_id"]
        for fk in foreign_keys
    ):
        raise ValueError("Existing password recovery table has an incompatible user foreign key.")


def main():
    engine = get_engine()
    try:
        with engine.begin() as connection:
            inspector = inspect(connection)
            names = inspector.get_table_names()
            user_tables = [name for name in names if name.casefold() == User.__tablename__.casefold()]
            if len(user_tables) != 1:
                raise ValueError("Expected exactly one existing user table; no changes made.")
            user_table_name = user_tables[0]
            user_columns = {column["name"]: column for column in inspector.get_columns(user_table_name)}
            primary_key = inspector.get_pk_constraint(user_table_name).get("constrained_columns") or []
            user_id = user_columns.get("user_id")
            if user_id is None or "user_id" not in primary_key or not isinstance(user_id["type"], Integer):
                raise ValueError("Existing user table has an incompatible user_id primary key; no changes made.")

            recovery_tables = [
                name for name in names
                if name.casefold() == PasswordRecoveryChallenge.__tablename__.casefold()
            ]
            if len(recovery_tables) > 1:
                raise ValueError("Multiple password recovery tables differ only by case; no changes made.")
            if recovery_tables:
                recovery_table_name = recovery_tables[0]
                if recovery_table_name != PasswordRecoveryChallenge.__tablename__:
                    raise ValueError("Existing password recovery table has incompatible casing; no changes made.")
                validate_recovery_foreign_key(inspector, recovery_table_name, user_table_name)
                columns = {column["name"] for column in inspector.get_columns(recovery_table_name)}
                if "send_history" not in columns:
                    # Additive only: preserve every existing challenge and user record.
                    connection.execute(text(
                        "ALTER TABLE `password_recovery_challenges` ADD COLUMN `send_history` JSON NULL"
                    ))
            else:
                build_recovery_table(user_table_name).create(connection, checkfirst=True)
        print("Password recovery challenge table ready. Existing user data was not changed.")
        return 0
    except ValueError as error:
        print(str(error))
        return 1
    except SQLAlchemyError:
        print("Migration failed. Check database access and existing table definitions. No credentials displayed.")
        return 1
    finally:
        engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())