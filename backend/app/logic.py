"""Toute la logique métier : commandes, états, automatisation, accès."""
import json, logging, random, threading
from datetime import datetime
from sqlalchemy import select
from sqlalchemy.orm import Session
from . import config
from .db import SessionLocal, now
from .models import (Rule, Apartment, DeviceState, Measurement, Reservation,
                     AccessCode, CommandLog)
from .mqtt_bridge import topic

log = logging.getLogger("logic")

# ----- pont MQTT injectable (remplacé par un faux dans les tests) -----
_bridge = None
def set_bridge(b): 
    global _bridge; _bridge = b
def publish(apartment_id: str, suffix: str, payload: dict) -> bool:
    return bool(_bridge and _bridge.publish(topic(apartment_id, suffix), json.dumps(payload)))

def journal(db: Session, apartment_id, actor, action, result, detail=""):
    db.add(CommandLog(apartment_id=apartment_id, actor=actor, action=action,
                      result=result, detail=detail))
    db.commit()

# ----- vocabulaire dashboard <-> simulation (contrat §4) -----
DOOR_TO_MQTT = {"locked": "close", "unlocked": "open"}
WINDOW_TO_MQTT = {"open": "open", "closed": "close"}

# ----- minuteur de la porte (contrat §6.4) -----
_timers: dict[str, threading.Timer] = {}
_timers_lock = threading.Lock()

def _autolock(apartment_id: str):
    with SessionLocal() as db:
        st = db.get(DeviceState, apartment_id)
        if st and st.door == "unlocked":
            st.door = "locked"
            db.commit()
    with _timers_lock:
        _timers.pop(apartment_id, None)

def _schedule_autolock(apartment_id: str):
    with _timers_lock:
        old = _timers.pop(apartment_id, None)
        if old: old.cancel()
        t = threading.Timer(config.DOOR_AUTOLOCK_SECONDS, _autolock, args=(apartment_id,))
        t.daemon = True
        _timers[apartment_id] = t
        t.start()

def _cancel_autolock(apartment_id: str):
    with _timers_lock:
        old = _timers.pop(apartment_id, None)
        if old: old.cancel()

# ----- commandes -----
class CommandError(Exception):
    def __init__(self, status, msg): self.status, self.msg = status, msg

def apply_command(db: Session, apartment_id: str, actor: str, cmd: dict):
    """cmd = un seul champ parmi : door, window, on, target, mode.
    Retourne l'état à jour. Lève CommandError si invalide / MQTT indisponible."""
    st = db.get(DeviceState, apartment_id)
    keys = [k for k in ("door", "window", "on", "target", "mode") if cmd.get(k) is not None]
    if len(keys) != 1:
        raise CommandError(422, "Envoyer exactement un champ : door, window, on, target ou mode")
    key = keys[0]; val = cmd[key]
    label = f"{key}={val}"

    if key == "target":                      # stocké seulement, rien n'est envoyé
        if not (16 <= val <= 32):
            journal(db, apartment_id, actor, label, "refused", "cible hors 16-32")
            raise CommandError(422, "La température cible doit être entre 16 et 32 °C")
        st.ac_target = int(val)
        db.commit(); journal(db, apartment_id, actor, label, "accepted", "stocké côté serveur")
        return st
    if key == "mode":
        if val not in ("cool", "auto", "dry"):
            journal(db, apartment_id, actor, label, "refused", "mode inconnu")
            raise CommandError(422, "Mode attendu : cool, auto ou dry")
        st.ac_mode = val
        db.commit(); journal(db, apartment_id, actor, label, "accepted", "stocké côté serveur")
        return st

    if key == "door":
        if val not in DOOR_TO_MQTT: raise CommandError(422, "door : locked ou unlocked")
        msg = {"device": "door", "value": DOOR_TO_MQTT[val]}
    elif key == "window":
        if val not in WINDOW_TO_MQTT: raise CommandError(422, "window : open ou closed")
        msg = {"device": "window", "value": WINDOW_TO_MQTT[val]}
    else:  # on
        if not isinstance(val, bool): raise CommandError(422, "on : true ou false")
        msg = {"device": "ac", "value": "on" if val else "off"}

    if not publish(apartment_id, "command", msg):
        journal(db, apartment_id, actor, label, "refused", "MQTT indisponible")
        raise CommandError(503, "Broker MQTT indisponible : commande non envoyée")

    # État déduit du dernier ordre envoyé
    if key == "door":
        st.door = val
        _schedule_autolock(apartment_id) if val == "unlocked" else _cancel_autolock(apartment_id)
    elif key == "window":
        st.window = val
    else:
        st.ac_on = val
    db.commit()
    journal(db, apartment_id, actor, label, "accepted", json.dumps(msg))
    return st

# ----- télémétrie + automatisation -----
def handle_telemetry(apartment_id: str, payload: bytes):
    try:
        data = json.loads(payload)
        temp = float(data["temperature"]); hum = float(data["humidity"])
        pres = data["presence"]
        if not isinstance(pres, bool) or temp != temp or hum != hum:  # NaN (DHT22 en erreur)
            raise ValueError("valeurs invalides")
        if not 0 <= hum <= 100:       # la base refuse l'humidité hors 0-100 (chk_humidity)
            raise ValueError(f"humidité hors plage ({hum})")
    except (ValueError, KeyError, TypeError) as e:
        log.warning("telemetry invalide %s: %s", apartment_id, e); return
    with SessionLocal() as db:
        if not db.get(Apartment, apartment_id): return
        db.add(Measurement(apartment_id=apartment_id, temperature=temp,
                           humidity=hum, presence=pres))   # date/heure = serveur
        db.commit()
        evaluate_rules(db, apartment_id, temp, pres)

DEFAULT_RULES = [
    ("comfort-guard", "Comfort guard",
     "Température ≥ 28 °C + présence + clim éteinte → allumer la clim", True),
    ("save-energy", "Save energy",
     "Clim allumée + fenêtre ouverte → fermer la fenêtre (proposition, décision d'équipe ouverte)",
     config.WINDOW_RULE_ENABLED),
]

def ensure_rules(db: Session) -> None:
    for rid, name, desc, enabled in DEFAULT_RULES:
        if not db.get(Rule, rid):
            db.add(Rule(id=rid, name=name, description=desc, enabled=enabled))
    db.commit()

def rule_enabled(db: Session, rule_id: str) -> bool:
    ensure_rules(db)
    return bool(db.get(Rule, rule_id).enabled)

def evaluate_rules(db: Session, apartment_id: str, temp: float, presence: bool):
    st = db.get(DeviceState, apartment_id)
    # Comfort guard : température >= 28, présence, clim éteinte
    if (temp >= config.AC_TEMP_THRESHOLD and presence and not st.ac_on
            and rule_enabled(db, "comfort-guard")):
        try: apply_command(db, apartment_id, "automation:comfort-guard", {"on": True})
        except CommandError: pass
    # Save energy (fenêtre) : activable depuis le dashboard / PUT /rules/save-energy
    if st.ac_on and st.window == "open" and rule_enabled(db, "save-energy"):
        try: apply_command(db, apartment_id, "automation:save-energy", {"window": "closed"})
        except CommandError: pass

# ----- codes d'accès -----
def verify_access(db: Session, apartment_id: str, code: str):
    """Retourne (result, raison). 'open' seulement si les 5 vérifications passent."""
    t = now()
    ac = db.scalar(select(AccessCode).where(AccessCode.code == str(code),
                                            AccessCode.apartment_id == apartment_id))
    if ac is None:
        other = db.scalar(select(AccessCode).where(AccessCode.code == str(code)))
        reason = "mauvais logement" if other else "code inconnu"
    elif ac.status != "active":
        reason = "code annulé"
    elif not (ac.valid_from <= t <= ac.valid_until):
        reason = "hors période de validité"
    elif ac.reservation.status != "confirmed":
        reason = "réservation non valide"
    else:
        return "open", "ok"
    return "denied", reason

def handle_access_request(apartment_id: str, payload: bytes):
    try:
        code = str(json.loads(payload)["code"])
    except (ValueError, KeyError, TypeError):
        return
    with SessionLocal() as db:
        if not db.get(Apartment, apartment_id): return
        result, reason = verify_access(db, apartment_id, code)
        publish(apartment_id, "access/response", {"result": result})
        if result == "open":          # la simulation se referme seule après 5 s
            db.get(DeviceState, apartment_id).door = "unlocked"; db.commit()
            _schedule_autolock(apartment_id)
        # on ne journalise jamais le code saisi en clair
        journal(db, apartment_id, "keypad", "access_attempt",
                "accepted" if result == "open" else "refused", reason)

def on_mqtt_message(t: str, payload: bytes):
    """Routage : <prefix>/<maisonN>/telemetry | access/request"""
    try:
        parts = t.split("/")
        apt, suffix = parts[1], "/".join(parts[2:])
        if suffix == "telemetry": handle_telemetry(apt, payload)
        elif suffix == "access/request": handle_access_request(apt, payload)
    except Exception:
        log.exception("erreur sur %s", t)   # un message cassé ne doit pas tuer le client

def generate_code(db: Session) -> str:
    active = set(db.scalars(select(AccessCode.code).where(AccessCode.status == "active")))
    rng = random.SystemRandom()
    while True:
        c = f"{rng.randrange(10**6):06d}"     # 6 chiffres (le clavier en accepte 10 max)
        if c not in active: return c

def overlaps(db: Session, apartment_id: str, ci: datetime, co: datetime, ignore_id=None) -> bool:
    q = select(Reservation).where(Reservation.apartment_id == apartment_id,
                                  Reservation.status != "cancelled",
                                  Reservation.check_in < co, Reservation.check_out > ci)
    if ignore_id: q = q.where(Reservation.id != ignore_id)
    return db.scalar(q) is not None
