import asyncio, logging
from contextlib import asynccontextmanager
from datetime import timedelta
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from . import config, logic, schemas, energy
from .db import Base, engine, get_db, now
from .models import (User, Apartment, DeviceState, Measurement, Reservation,
                     AccessCode, CommandLog, Rule)
from .mqtt_bridge import MqttBridge
from .security import verify_password, create_token, current_user

logging.basicConfig(level=logging.INFO)

def commit_or_409(db: Session, message: str):
    """Une contrainte de la base (ex. no_overlap sur PostgreSQL) peut refuser l'écriture
    même si la vérification Python est passée (deux requêtes simultanées) : 409, pas 500."""
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, message)

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    bridge = None
    if config.MQTT_ENABLED:
        bridge = MqttBridge(logic.on_mqtt_message)
        logic.set_bridge(bridge)
        bridge.start()
    task = asyncio.create_task(energy.run_loop()) if config.ENERGY_ENABLED else None
    yield
    if task: task.cancel()
    if bridge: bridge.stop()

app = FastAPI(title="SmartStay IoT API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS,
                   allow_methods=["*"], allow_headers=["*"])

# ---------- auth ----------
@app.post("/auth/login")
def login(body: schemas.LoginIn, db: Session = Depends(get_db)):
    u = db.scalar(select(User).where(User.email == body.email))
    if not u or not verify_password(body.password, u.password_hash):
        raise HTTPException(401, "Email ou mot de passe incorrect")
    if u.role != "owner":
        raise HTTPException(403, "Seul le compte Owner peut se connecter")
    return {"token": create_token(u), "role": u.role, "name": u.full_name, "email": u.email}

# ---------- logements ----------
def _status(db: Session, a: Apartment) -> str:
    """F8 : statut calculé depuis réservations + nettoyage (jamais depuis la présence)."""
    if a.cleaning: return "cleaning"
    t = now()
    res = db.scalars(select(Reservation).where(Reservation.apartment_id == a.id,
                                               Reservation.status == "confirmed",
                                               Reservation.check_out > t)).all()
    if any(r.check_in <= t for r in res): return "occupied"
    return "reserved" if res else "available"

@app.get("/apartments")
def list_apartments(db: Session = Depends(get_db), user: User = Depends(current_user)):
    out = []
    for a in db.scalars(select(Apartment).order_by(Apartment.id)):
        m = db.scalar(select(Measurement).where(Measurement.apartment_id == a.id)
                      .order_by(Measurement.id.desc()).limit(1))
        s = a.state
        out.append({
            "id": a.id, "name": a.name, "city": a.city, "status": _status(db, a),
            "cleaning": a.cleaning,
            "measurement": None if not m else {
                "temperature": m.temperature, "humidity": m.humidity,
                "presence": m.presence, "recorded_at": m.recorded_at},
            "devices": {"door": s.door, "window": s.window,
                        "ac": {"on": s.ac_on, "target": s.ac_target, "mode": s.ac_mode}},
            "alerts": (["Climatisation en marche, fenêtre ouverte"]
                       if s.ac_on and s.window == "open" else []),
            "energy": energy.summary(db, a.id),
            "simulated": True})     # le dashboard affiche « Simulated data »
    return out

@app.post("/apartments/{apartment_id}/commands")
def send_command(apartment_id: str, cmd: schemas.CommandIn,
                 db: Session = Depends(get_db), user: User = Depends(current_user)):
    if not db.get(Apartment, apartment_id):
        raise HTTPException(404, "Logement inconnu")
    try:
        st = logic.apply_command(db, apartment_id, user.email, cmd.model_dump())
    except logic.CommandError as e:
        raise HTTPException(e.status, e.msg)
    return {"door": st.door, "window": st.window,
            "ac": {"on": st.ac_on, "target": st.ac_target, "mode": st.ac_mode}}

@app.post("/apartments/{apartment_id}/cleaning")
def set_cleaning(apartment_id: str, body: schemas.CleaningIn, db: Session = Depends(get_db),
                 user: User = Depends(current_user)):
    a = db.get(Apartment, apartment_id)
    if not a: raise HTTPException(404, "Logement inconnu")
    a.cleaning = body.cleaning; db.commit()
    logic.journal(db, apartment_id, user.email, f"cleaning={body.cleaning}", "accepted")
    return {"status": _status(db, a)}

# ---------- réservations ----------
@app.get("/reservations", response_model=list[schemas.ReservationOut])
def list_reservations(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return db.scalars(select(Reservation).order_by(Reservation.check_in)).all()

@app.post("/reservations", response_model=schemas.ReservationOut, status_code=201)
def create_reservation(body: schemas.ReservationIn, db: Session = Depends(get_db),
                       user: User = Depends(current_user)):
    if not db.get(Apartment, body.apartment_id): raise HTTPException(404, "Logement inconnu")
    if logic.overlaps(db, body.apartment_id, body.check_in, body.check_out):
        logic.journal(db, body.apartment_id, user.email, "create_reservation", "refused", "chevauchement")
        raise HTTPException(409, "Cette période chevauche une autre réservation")
    r = Reservation(**body.model_dump()); db.add(r)
    commit_or_409(db, "Cette période chevauche une autre réservation")
    logic.journal(db, r.apartment_id, user.email, f"create_reservation #{r.id}", "accepted")
    return r

@app.put("/reservations/{rid}", response_model=schemas.ReservationOut)
def update_reservation(rid: int, body: schemas.ReservationIn, db: Session = Depends(get_db),
                       user: User = Depends(current_user)):
    r = db.get(Reservation, rid)
    if not r: raise HTTPException(404, "Réservation inconnue")
    if r.status != "confirmed":
        raise HTTPException(409, "Réservation annulée : elle ne peut plus être modifiée")
    if not db.get(Apartment, body.apartment_id): raise HTTPException(404, "Logement inconnu")
    codes = db.scalars(select(AccessCode).where(AccessCode.reservation_id == rid)).all()
    if body.apartment_id != r.apartment_id and codes:
        # Un code est lié au logement de sa réservation (clé étrangère composite en base).
        logic.journal(db, r.apartment_id, user.email, f"update_reservation #{rid}", "refused",
                      "changement de logement avec codes existants")
        raise HTTPException(409, "Cette réservation a déjà des codes d'accès : supprime-la et "
                                 "recrée-la sur l'autre logement")
    if logic.overlaps(db, body.apartment_id, body.check_in, body.check_out, ignore_id=rid):
        logic.journal(db, body.apartment_id, user.email, f"update_reservation #{rid}", "refused", "chevauchement")
        raise HTTPException(409, "Cette période chevauche une autre réservation")
    r.apartment_id, r.reference = body.apartment_id, body.reference
    r.check_in, r.check_out = body.check_in, body.check_out
    # les codes suivent les dates du séjour
    for c in codes:
        c.valid_from, c.valid_until = r.check_in, r.check_out
    commit_or_409(db, "Cette période chevauche une autre réservation")
    logic.journal(db, r.apartment_id, user.email, f"update_reservation #{rid}", "accepted")
    return r

@app.delete("/reservations/{rid}", status_code=204)
def delete_reservation(rid: int, db: Session = Depends(get_db),
                       user: User = Depends(current_user)):
    """Suppression logique : la réservation passe à 'cancelled' et ses codes sont annulés."""
    r = db.get(Reservation, rid)
    if not r: raise HTTPException(404, "Réservation inconnue")
    r.status = "cancelled"
    for c in db.scalars(select(AccessCode).where(AccessCode.reservation_id == rid)):
        c.status = "cancelled"
    db.commit()
    logic.journal(db, r.apartment_id, user.email, f"delete_reservation #{rid}", "accepted")

# ---------- codes d'accès ----------
@app.post("/reservations/{rid}/access-code", response_model=schemas.AccessCodeOut, status_code=201)
def create_access_code(rid: int, db: Session = Depends(get_db),
                       user: User = Depends(current_user)):
    r = db.get(Reservation, rid)
    if not r or r.status != "confirmed": raise HTTPException(404, "Réservation introuvable ou annulée")
    for old in db.scalars(select(AccessCode).where(AccessCode.reservation_id == rid,
                                                   AccessCode.status == "active")):
        old.status = "cancelled"       # un seul code actif par réservation
    ac = AccessCode(code=logic.generate_code(db), reservation_id=rid, apartment_id=r.apartment_id,
                    valid_from=r.check_in, valid_until=r.check_out)
    db.add(ac); db.commit()
    logic.journal(db, r.apartment_id, user.email, f"create_access_code res#{rid}", "accepted")
    return ac

@app.get("/reservations/{rid}/access-codes", response_model=list[schemas.AccessCodeOut])
def list_access_codes(rid: int, db: Session = Depends(get_db),
                      user: User = Depends(current_user)):
    """Relire les codes déjà créés pour une réservation (le dashboard peut les réafficher)."""
    if not db.get(Reservation, rid):
        raise HTTPException(404, "Réservation inconnue")
    return db.scalars(select(AccessCode).where(AccessCode.reservation_id == rid)
                      .order_by(AccessCode.id.desc())).all()

@app.post("/access-codes/{cid}/cancel", response_model=schemas.AccessCodeOut)
def cancel_access_code(cid: int, db: Session = Depends(get_db),
                       user: User = Depends(current_user)):
    ac = db.get(AccessCode, cid)
    if not ac: raise HTTPException(404, "Code introuvable")
    ac.status = "cancelled"; db.commit()
    logic.journal(db, ac.apartment_id, user.email, f"cancel_access_code #{cid}", "accepted")
    return ac

@app.post("/access/verify")
def verify(body: schemas.VerifyIn, db: Session = Depends(get_db),
           user: User = Depends(current_user)):
    """Vérification manuelle (tests/démo). Le clavier passe, lui, par MQTT."""
    result, reason = logic.verify_access(db, body.apartment_id, body.code)
    logic.journal(db, body.apartment_id, user.email, "verify_code",
                  "accepted" if result == "open" else "refused", reason)
    return {"result": result, "reason": reason}

# ---------- journal ----------
@app.get("/logs")
def logs(limit: int = 100, apartment_id: str | None = None, db: Session = Depends(get_db),
         user: User = Depends(current_user)):
    q = select(CommandLog).order_by(CommandLog.id.desc())
    if apartment_id:
        q = q.where(CommandLog.apartment_id == apartment_id)
    users = {u.email: u for u in db.scalars(select(User))}
    out = []
    for l in db.scalars(q.limit(min(limit, 500))):
        kind = "automation" if l.actor.startswith("automation") else "keypad" if l.actor == "keypad" else "user"
        u = users.get(l.actor)
        out.append({"id": l.id, "ts": l.ts, "apartment_id": l.apartment_id, "actor": l.actor,
                    "actor_type": kind,
                    "rule": l.actor.split(":", 1)[1] if ":" in l.actor else None,
                    "actor_name": u.full_name if u else None,
                    "action": l.action, "result": l.result, "detail": l.detail})
    return out

# ---------- règles d'automatisation (page Automation du dashboard) ----------
@app.get("/rules")
def list_rules(db: Session = Depends(get_db), user: User = Depends(current_user)):
    logic.ensure_rules(db)
    out = []
    for r in db.scalars(select(Rule).order_by(Rule.id)):
        base = (CommandLog.actor == f"automation:{r.id}") & (CommandLog.result == "accepted")
        count = db.scalar(select(func.count()).select_from(CommandLog).where(base))
        last = db.scalar(select(CommandLog).where(base).order_by(CommandLog.id.desc()).limit(1))
        out.append({"id": r.id, "name": r.name, "description": r.description,
                    "enabled": r.enabled, "triggers": count,
                    "last_trigger": {"ts": last.ts, "apartment_id": last.apartment_id} if last else None})
    return out

@app.put("/rules/{rule_id}")
def set_rule(rule_id: str, body: schemas.RuleIn, db: Session = Depends(get_db),
             user: User = Depends(current_user)):
    logic.ensure_rules(db)
    r = db.get(Rule, rule_id)
    if not r:
        raise HTTPException(404, "Règle inconnue")
    r.enabled = body.enabled
    db.commit()
    logic.journal(db, None, user.email, f"rule {rule_id} {'on' if body.enabled else 'off'}", "accepted")
    return {"id": r.id, "enabled": r.enabled}

# ---------- alertes (F12) et historique des mesures (F16) ----------
@app.get("/alerts")
def alerts(db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Alerte du PRD : climatisation en marche alors que la fenêtre est ouverte."""
    out = []
    for st in db.scalars(select(DeviceState).order_by(DeviceState.apartment_id)):
        if st.ac_on and st.window == "open":
            out.append({"apartment_id": st.apartment_id, "type": "ac_on_window_open",
                        "message": "Climatisation en marche alors que la fenêtre est ouverte"})
    return out

@app.get("/apartments/{apartment_id}/measurements")
def measurement_history(apartment_id: str, limit: int = 100, db: Session = Depends(get_db),
                        user: User = Depends(current_user)):
    if not db.get(Apartment, apartment_id):
        raise HTTPException(404, "Logement inconnu")
    rows = db.scalars(select(Measurement).where(Measurement.apartment_id == apartment_id)
                      .order_by(Measurement.id.desc()).limit(min(limit, 1000)))
    return [{"recorded_at": m.recorded_at, "temperature": m.temperature,
             "humidity": m.humidity, "presence": m.presence} for m in rows]

@app.get("/health")
def health():
    return {"ok": True}


# ---------- consommation électrique simulée (F6) ----------
@app.get("/energy")
def energy_all(db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Consommation de tous les logements : aujourd'hui + 6 jours + totaux."""
    items = [energy.summary(db, a.id) for a in db.scalars(select(Apartment).order_by(Apartment.id))]
    return {"apartments": items,
            "today_total": round(sum(i["today"] for i in items), 2),
            "week_total": round(sum(i["week_total"] for i in items), 2),
            "unit": "kWh", "simulated": True}

@app.get("/apartments/{apartment_id}/energy")
def energy_one(apartment_id: str, db: Session = Depends(get_db),
               user: User = Depends(current_user)):
    if not db.get(Apartment, apartment_id):
        raise HTTPException(404, "Logement inconnu")
    return energy.summary(db, apartment_id)