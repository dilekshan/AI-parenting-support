from functools import lru_cache
from fastapi import HTTPException
from sqlalchemy import create_engine, URL
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker
from app.core.config import get_settings

# Reuse the database connection pool with hidden SQL parameters.
@lru_cache
def get_engine():
    s = get_settings()
    url = URL.create("mysql+pymysql", username=s.DB_USER, password=s.DB_PASSWORD.get_secret_value(), host=s.DB_HOST, port=s.DB_PORT, database=s.DB_NAME)
    return create_engine(url, pool_pre_ping=True, hide_parameters=True, connect_args={"connect_timeout": 5})

# Give each request a session and always close it after use.
def get_db():
    session = sessionmaker(bind=get_engine(), expire_on_commit=False)()
    try:
        yield session
    # Undo failed database work and return a safe service error.
    except SQLAlchemyError:
        session.rollback()
        raise HTTPException(503, "Database temporarily unavailable") from None
    finally:
        session.close()
