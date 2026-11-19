"""Consommation électrique simulée (F6).
La simulation ESP32 ne mesure aucune puissance : le serveur ESTIME la consommation
à partir de l'état des équipements (clim allumée ou non, mode, fenêtre) multiplié par le temps.
    énergie (kWh) = puissance (kW) x durée (h)
Limite connue : l'état est déduit du dernier ordre envoyé (contrat §6.3)."""
import asyncio, logging
from datetime import date, datetime, timedelta
from sqlalchemy import select
from sqlalchemy.orm import Session
from . import config
from .db import SessionLocal, now
from .models import Apartment, DeviceState, EnergyDaily

log = logging.getLogger("energy")
_last: dict[str, datetime] = {}          # dernier instant calculé, par logement
MAX_GAP_SECONDS = 300                    # on ne rattrape jamais plus de 5 min d'un coup

def power_kw(st: DeviceState) -> float:
    p = config.ENERGY_BASE_KW
    if st.ac_on:
        ac = config.ENERGY_AC_KW.get(st.ac_mode, config.ENERGY_AC_KW["cool"])
        if st.window == "open":
            ac *= config.ENERGY_WINDOW_OPEN_FACTOR
        p += ac
    return p

def _row(db: Session, apartment_id: str, day: date) -> EnergyDaily:
    r = db.get(EnergyDaily, (apartment_id, day))
    if not r:
        r = EnergyDaily(apartment_id=apartment_id, day=day, kwh=0.0)
        db.add(r)
    return r

def accrue(db: Session, t: datetime | None = None) -> None:
    """Ajoute à la journée en cours l'énergie consommée depuis le dernier calcul."""
    t = t or now()
    for st in db.scalars(select(DeviceState)):
        prev = _last.get(st.apartment_id)
        _last[st.apartment_id] = t
        if prev is None:
            continue                     # premier passage : on n'invente rien
        secs = min(max((t - prev).total_seconds(), 0), MAX_GAP_SECONDS)
        kwh = power_kw(st) * secs / 3600 * config.ENERGY_SPEEDUP
        r = _row(db, st.apartment_id, t.date())
        r.kwh = (r.kwh or 0.0) + kwh
    db.commit()

def summary(db: Session, apartment_id: str, today: date | None = None) -> dict:
    """today + 6 jours précédents (du plus ancien au plus récent), comme le dashboard."""
    today = today or now().date()
    days = [today - timedelta(days=i) for i in range(6, -1, -1)]
    rows = {r.day: r.kwh for r in db.scalars(
        select(EnergyDaily).where(EnergyDaily.apartment_id == apartment_id,
                                  EnergyDaily.day >= days[0], EnergyDaily.day <= today))}
    vals = [round(rows.get(d, 0.0), 2) for d in days]
    return {"apartment_id": apartment_id, "today": vals[-1], "history": vals[:-1],
            "days": [d.isoformat() for d in days], "week_total": round(sum(vals), 2),
            "simulated": True}

async def run_loop():
    """Tâche de fond lancée au démarrage du serveur."""
    while True:
        await asyncio.sleep(config.ENERGY_TICK_SECONDS)
        try:
            def work():
                with SessionLocal() as db: accrue(db)
            await asyncio.to_thread(work)
        except Exception:
            log.exception("calcul de consommation")
