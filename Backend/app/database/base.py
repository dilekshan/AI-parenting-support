from sqlalchemy.orm import DeclarativeBase

# Give database models a shared SQLAlchemy mapping base.
class Base(DeclarativeBase):
    pass
