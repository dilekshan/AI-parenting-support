from sqlalchemy import Column, Integer, String, DateTime, text
from sqlalchemy.dialects.mysql import ENUM
from app.database.base import Base

class User(Base):
    __tablename__ = "User"
    user_id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    email = Column(String(100), nullable=False, unique=True)
    password_hash = Column(String(255), nullable=False)
    phone = Column(String(20), nullable=True)
    role = Column(ENUM("parent", "admin"), nullable=False, server_default="parent")
    account_status = Column(ENUM("active"), nullable=False, server_default="active")
    created_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))
