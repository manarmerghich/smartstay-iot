import os
from datetime import timedelta
from app import energy, config
from app.db import SessionLocal, now
from app.models import DeviceState
import seed  # noqa

def _set(db, **kw):
    st = db.get(DeviceState, "maison2")
    for k, v in kw.items(): setattr(st, k, v)
    db.commit(); return st

def test_power_levels():
    with SessionLocal() as db:
        st = _set(db, ac_on=False, ac_mode="cool", window="closed")
        assert energy.power_kw(st) == config.ENERGY_BASE_KW
        st = _set(db, ac_on=True)
        assert energy.power_kw(st) == config.ENERGY_BASE_KW + config.ENERGY_AC_KW["cool"]
        st = _set(db, window="open")
        assert energy.power_kw(st) > config.ENERGY_BASE_KW + config.ENERGY_AC_KW["cool"]
        _set(db, ac_on=False, window="closed")

def test_accrue_one_hour_of_ac():
    with SessionLocal() as db:
        _set(db, ac_on=True, ac_mode="cool", window="closed")
        before = energy.summary(db, "maison2")["today"]
        t0 = now().replace(hour=6, minute=0, second=0, microsecond=0); energy._last.clear()
        energy.accrue(db, t0)                       # 1er passage : rien ajouté
        for i in range(1, 13):                      # 12 pas de 5 min = 1 h
            energy.accrue(db, t0 + timedelta(minutes=5 * i))
        gained = energy.summary(db, "maison2")["today"] - before
        assert abs(gained - (config.ENERGY_BASE_KW + config.ENERGY_AC_KW["cool"])) < 0.02
        _set(db, ac_on=False)

def test_summary_shape_and_history():
    with SessionLocal() as db:
        s = energy.summary(db, "maison1")
        assert len(s["history"]) == 6 and len(s["days"]) == 7
        assert s["history"] == [9.8, 10.4, 8.9, 11.2, 12.1, 10.7]
