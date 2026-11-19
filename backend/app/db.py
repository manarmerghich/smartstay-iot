from datetime import datetime, timezone
from sqlalchemy import create_engine, DateTime
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.types import TypeDecorator
from . import config

UTC = timezone.utc

def now() -> datetime:
    return datetime.now(UTC)

def ensure_utc(dt: datetime) -> datetime:
    """Une date sans fuseau est considérée comme UTC."""
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt.astimezone(UTC)

class UTCDateTime(TypeDecorator):
    """Stocke en UTC (naïf) et relit toujours des datetimes avec fuseau UTC."""
    impl = DateTime
    cache_ok = True
    def process_bind_param(self, value, dialect):
        return None if value is None else ensure_utc(value).replace(tzinfo=None)
    def process_result_value(self, value, dialect):
        return None if value is None else value.replace(tzinfo=UTC)

class Base(DeclarativeBase):
    pass

_args = {"check_same_thread": False} if config.DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(config.DATABASE_URL, connect_args=_args, pool_pre_ping=True,
                       **({} if config.DATABASE_URL.startswith("sqlite") else {"pool_recycle": 300}))
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
