"""Explicit, repeatable MySQL migration. Never invoked by the application."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import inspect, text
from app.database.connection import get_engine


def main():
    engine = get_engine()
    try:
        with engine.begin() as connection:
            inspector = inspect(connection)
            names = [name for name in inspector.get_table_names() if name.lower() == 'user']
            if len(names) != 1:
                raise ValueError('Expected exactly one existing User table.')
            columns = {c['name']: c for c in inspector.get_columns(names[0])}
            if 'profile_photo' in columns:
                column = columns['profile_photo']
                if not column['nullable'] or str(column['type']).upper() != 'VARCHAR(64)':
                    raise ValueError('Existing profile_photo column needs manual review.')
            else:
                table = engine.dialect.identifier_preparer.quote(names[0])
                connection.execute(text(f'ALTER TABLE {table} ADD COLUMN profile_photo VARCHAR(64) NULL'))
        print('Profile photo column ready. No existing account values changed.')
        return 0
    except Exception:
        print('Migration did not complete. Check database access and existing column definition. No credentials displayed.')
        return 1
    finally:
        engine.dispose()


if __name__ == '__main__':
    raise SystemExit(main())
