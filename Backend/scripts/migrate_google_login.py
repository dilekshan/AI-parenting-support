"""Run explicitly after backing up MySQL; never executed by app startup."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import inspect, text
from sqlalchemy.exc import SQLAlchemyError
from app.database.connection import get_engine


def main():
    engine = get_engine()
    try:
        with engine.begin() as connection:
            inspector = inspect(connection)
            names = [name for name in inspector.get_table_names() if name.lower() == 'user']
            if len(names) != 1:
                raise ValueError('Expected exactly one existing User table; no changes made.')
            table = engine.dialect.identifier_preparer.quote(names[0])
            columns = {column['name']: column for column in inspector.get_columns(names[0])}
            password = columns.get('password_hash')
            if password is None or str(password['type']).upper() != 'VARCHAR(255)':
                raise ValueError('Unexpected password_hash schema. Review manually before migration.')
            # MySQL DDL commits implicitly. Each step is independently restartable.
            if not password['nullable']:
                connection.execute(text(f'ALTER TABLE {table} MODIFY COLUMN password_hash VARCHAR(255) NULL'))
            if 'google_sub' not in columns:
                connection.execute(text(f'ALTER TABLE {table} ADD COLUMN google_sub VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL, ADD UNIQUE KEY uq_user_google_sub (google_sub)'))
            else:
                google = columns['google_sub']
                unique = inspector.get_indexes(names[0]) + inspector.get_unique_constraints(names[0])
                if (not google['nullable'] or getattr(google['type'], 'collation', None) != 'utf8mb4_bin'
                        or not any(item.get('column_names') == ['google_sub'] and item.get('unique', True) for item in unique)):
                    raise ValueError('Existing google_sub column needs manual review; expected nullable utf8mb4_bin and a unique index.')
        print('Google login schema ready. Existing account values were not changed.')
        return 0
    except ValueError as error:
        print(str(error))
    except SQLAlchemyError:
        print('Migration failed. Check MySQL availability and ALTER permission. No credentials displayed. MySQL DDL may have partially completed; this script can be rerun.')
    finally:
        engine.dispose()
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
