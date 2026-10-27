from sqlalchemy import Column, Integer, String, DateTime, text, inspect
from sqlalchemy.dialects.mysql import ENUM
from sqlalchemy.orm import object_session
from app.database.base import Base

class User(Base):
    __tablename__ = "User"
    user_id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    email = Column(String(100), nullable=False, unique=True)
    password_hash = Column(String(255), nullable=True)
    google_sub = Column(String(255, collation="utf8mb4_bin"), nullable=True, unique=True)
    profile_photo = Column(String(64), nullable=True)
    phone = Column(String(20), nullable=True)
    role = Column(ENUM("parent", "admin"), nullable=False, server_default="parent")
    account_status = Column(ENUM("active"), nullable=False, server_default="active")
    created_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))

    @property
    def profile_photo_url(self):
        # Auth queries defer this optional column until its migration is applied.
        state = inspect(self)
        if state.persistent and 'profile_photo' in state.unloaded:
            session = object_session(self)
            if session is None:
                return None
            columns = inspect(session.connection()).get_columns(self.__tablename__)
            if not any(column['name'] == 'profile_photo' for column in columns):
                return None
        return f"/api/profile-photos/{self.profile_photo}" if self.profile_photo else None
