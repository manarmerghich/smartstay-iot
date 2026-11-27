from datetime import datetime, date
from sqlalchemy import String, Integer, Float, Boolean, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .db import Base, UTCDateTime, now

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(150), unique=True)
    full_name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20))  # toujours "owner" : seul compte du système

class Apartment(Base):
    __tablename__ = "apartments"
    id: Mapped[str] = mapped_column(String(20), primary_key=True)  # "maison1"
    name: Mapped[str] = mapped_column(String(50))
    city: Mapped[str] = mapped_column(String(100))
    cleaning: Mapped[bool] = mapped_column(Boolean, default=False)
    tuya_device_id: Mapped[str | None] = mapped_column(String(50), nullable=True)  # serrure Tuya (optionnel)
    state: Mapped["DeviceState"] = relationship(back_populates="apartment", uselist=False)

class DeviceState(Base):
    """État courant des équipements, déduit du dernier ordre envoyé (contrat §6.3)."""
    __tablename__ = "device_states"
    apartment_id: Mapped[str] = mapped_column(ForeignKey("apartments.id"), primary_key=True)
    door: Mapped[str] = mapped_column(String(10), default="locked")     # locked | unlocked
    window: Mapped[str] = mapped_column(String(10), default="closed")   # open | closed
    ac_on: Mapped[bool] = mapped_column(Boolean, default=False)
    ac_target: Mapped[int] = mapped_column(Integer, default=24)         # serveur seulement
    ac_mode: Mapped[str] = mapped_column(String(10), default="cool")    # serveur seulement
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now, onupdate=now)
    apartment: Mapped[Apartment] = relationship(back_populates="state")

class Measurement(Base):
    __tablename__ = "measurements"
    id: Mapped[int] = mapped_column(primary_key=True)
    apartment_id: Mapped[str] = mapped_column(ForeignKey("apartments.id"), index=True)
    temperature: Mapped[float] = mapped_column(Float)
    humidity: Mapped[float] = mapped_column(Float)
    presence: Mapped[bool] = mapped_column(Boolean)
    recorded_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now, index=True)  # ajouté par le serveur

class Reservation(Base):
    __tablename__ = "reservations"
    id: Mapped[int] = mapped_column(primary_key=True)
    apartment_id: Mapped[str] = mapped_column(ForeignKey("apartments.id"), index=True)
    reference: Mapped[str] = mapped_column(String(50))
    check_in: Mapped[datetime] = mapped_column(UTCDateTime)
    check_out: Mapped[datetime] = mapped_column(UTCDateTime)
    status: Mapped[str] = mapped_column(String(20), default="confirmed")  # confirmed | cancelled

class AccessCode(Base):
    __tablename__ = "access_codes"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(10), index=True)
    reservation_id: Mapped[int] = mapped_column(ForeignKey("reservations.id"))
    apartment_id: Mapped[str] = mapped_column(ForeignKey("apartments.id"))
    valid_from: Mapped[datetime] = mapped_column(UTCDateTime)
    valid_until: Mapped[datetime] = mapped_column(UTCDateTime)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active | cancelled
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now)
    reservation: Mapped[Reservation] = relationship()

class CommandLog(Base):
    """Journal : commandes, tentatives d'accès, automatisations."""
    __tablename__ = "commands_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    ts: Mapped[datetime] = mapped_column(UTCDateTime, default=now, index=True)
    apartment_id: Mapped[str] = mapped_column(String(20), nullable=True)
    actor: Mapped[str] = mapped_column(String(100))   # email | "automation" | "keypad"
    action: Mapped[str] = mapped_column(String(100))
    result: Mapped[str] = mapped_column(String(20))   # accepted | refused
    detail: Mapped[str] = mapped_column(Text, default="")


class EnergyDaily(Base):
    """Consommation simulée par logement et par jour (kWh). Même forme que
    energy_daily dans le script SQL de Fatizohra (apartment_id, day_date, kwh)."""
    __tablename__ = "energy_daily"
    apartment_id: Mapped[str] = mapped_column(ForeignKey("apartments.id"), primary_key=True)
    day: Mapped[date] = mapped_column(primary_key=True)    # jour UTC
    kwh: Mapped[float] = mapped_column(Float, default=0.0)


class Rule(Base):
    """Règles d'automatisation activables depuis le dashboard (page Automation)."""
    __tablename__ = "rules"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)   # comfort-guard | save-energy
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(String(300), default="")
    enabled: Mapped[bool] = mapped_column(default=True)
