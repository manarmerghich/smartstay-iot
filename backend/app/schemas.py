from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, field_validator, model_validator
from .db import ensure_utc

class LoginIn(BaseModel):
    email: str
    password: str

class CommandIn(BaseModel):
    """Un seul champ à la fois. Formats envoyés par le dashboard (contrat §7)."""
    door: Optional[Literal["locked", "unlocked"]] = None
    window: Optional[Literal["open", "closed"]] = None
    on: Optional[bool] = None
    target: Optional[int] = None
    mode: Optional[Literal["cool", "auto", "dry"]] = None

class CleaningIn(BaseModel):
    cleaning: bool

class ReservationIn(BaseModel):
    apartment_id: str
    reference: str
    check_in: datetime
    check_out: datetime
    @field_validator("check_in", "check_out")
    @classmethod
    def _utc(cls, v): return ensure_utc(v)
    @model_validator(mode="after")
    def _order(self):
        if self.check_out <= self.check_in:
            raise ValueError("check_out doit être après check_in")
        return self

class ReservationOut(BaseModel):
    id: int; apartment_id: str; reference: str
    check_in: datetime; check_out: datetime; status: str
    model_config = {"from_attributes": True}

class AccessCodeOut(BaseModel):
    id: int; code: str; reservation_id: int; apartment_id: str
    valid_from: datetime; valid_until: datetime; status: str
    model_config = {"from_attributes": True}

class VerifyIn(BaseModel):
    apartment_id: str
    code: str

class RuleIn(BaseModel):
    enabled: bool
