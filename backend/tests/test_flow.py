import json, os, time
os.environ["DATABASE_URL"] = "sqlite:///./test.db"
os.environ["MQTT_ENABLED"] = "false"

import pytest
from fastapi.testclient import TestClient
from app import logic, config
from app.main import app
import seed  # noqa  (crée logements + comptes)

config.DOOR_AUTOLOCK_SECONDS = 1   # accélère le test (au lieu de 5 s)

class FakeBridge:
    def __init__(self): self.sent = []; self.up = True
    def publish(self, t, p):
        if not self.up: return False
        self.sent.append((t, json.loads(p))); return True
bridge = FakeBridge(); logic.set_bridge(bridge)
client = TestClient(app)

def login(email):
    r = client.post("/auth/login", json={"email": email, "password": "demo1234"})
    assert r.status_code == 200, (f"Login failed for {email}: {r.status_code} - {r.text}")
    return {"Authorization": f"Bearer {r.json()['token']}"}
OWNER = login("owner@smartstay.test")

def dev(apt="maison1"):
    return next(a for a in client.get("/apartments", headers=OWNER).json() if a["id"] == apt)["devices"]

def test_commands_and_state():
    bridge.sent.clear()
    assert client.post("/apartments/maison1/commands", json={"on": True}, headers=OWNER).status_code == 200
    assert bridge.sent[-1] == ("smartstay-manar/maison1/command", {"device": "ac", "value": "on"})
    client.post("/apartments/maison1/commands", json={"window": "open"}, headers=OWNER)
    assert bridge.sent[-1][1] == {"device": "window", "value": "open"}
    n = len(bridge.sent)
    client.post("/apartments/maison1/commands", json={"target": 22}, headers=OWNER)
    client.post("/apartments/maison1/commands", json={"mode": "dry"}, headers=OWNER)
    assert len(bridge.sent) == n            # cible/mode : jamais envoyés à la simulation
    d = dev(); assert d["ac"] == {"on": True, "target": 22, "mode": "dry"} and d["window"] == "open"
    assert client.post("/apartments/maison1/commands", json={"target": 40}, headers=OWNER).status_code == 422

def test_door_autolock():
    client.post("/apartments/maison2/commands", json={"door": "unlocked"}, headers=OWNER)
    assert bridge.sent[-1][1] == {"device": "door", "value": "open"}
    assert dev("maison2")["door"] == "unlocked"
    time.sleep(1.5); assert dev("maison2")["door"] == "locked"

def _apt(apt):
    return next(a for a in client.get("/apartments", headers=OWNER).json() if a["id"] == apt)

def test_owner_controls_cleaning_status():
    r = client.post("/apartments/maison5/cleaning", json={"cleaning": True}, headers=OWNER)
    assert r.status_code == 200 and r.json()["status"] == "cleaning"
    assert _apt("maison5")["cleaning"] is True and _apt("maison5")["status"] == "cleaning"
    r = client.post("/apartments/maison5/cleaning", json={"cleaning": False}, headers=OWNER)
    assert r.json()["status"] != "cleaning"
    assert any(l["action"] == "cleaning=True" for l in client.get("/logs", headers=OWNER).json())

def test_owner_is_the_only_account_and_auth_required():
    assert client.get("/apartments").status_code == 401                      # sans jeton
    assert client.post("/apartments/maison1/commands", json={"on": True}).status_code == 401
    assert client.get("/reservations", headers=OWNER).status_code == 200      # l'Owner a tous les droits
    assert client.get("/rules", headers=OWNER).status_code == 200
    from app.db import SessionLocal
    from app.models import User
    with SessionLocal() as db:
        assert [u.role for u in db.query(User).all()] == ["owner"]

def test_telemetry_and_ac_automation():
    bridge.sent.clear()
    p = lambda t, pr: logic.on_mqtt_message("smartstay-manar/maison3/telemetry",
                        json.dumps({"temperature": t, "humidity": 40, "presence": pr}).encode())
    p(30, False); p(27.9, True); assert not bridge.sent          # pas de présence / trop froid
    p(28, True)                                                   # >= 28 + présence
    assert bridge.sent == [("smartstay-manar/maison3/command", {"device": "ac", "value": "on"})]
    p(29, True); assert len(bridge.sent) == 1                     # déjà allumée : pas de répétition
    a = next(a for a in client.get("/apartments", headers=OWNER).json() if a["id"] == "maison3")
    assert a["measurement"]["temperature"] == 29 and a["measurement"]["recorded_at"]
    logic.on_mqtt_message("smartstay-manar/maison3/telemetry", b"pas du json")  # ne plante pas

def test_reservation_overlap_and_access():
    base = {"apartment_id": "maison4", "reference": "R1",
            "check_in": "2026-01-01T00:00:00Z", "check_out": "2099-01-01T00:00:00Z"}
    r = client.post("/reservations", json=base, headers=OWNER); assert r.status_code == 201
    rid = r.json()["id"]
    assert client.post("/reservations", json={**base, "reference": "R2"}, headers=OWNER).status_code == 409
    code = client.post(f"/reservations/{rid}/access-code", headers=OWNER).json()
    assert len(code["code"]) == 6
    ask = lambda apt, c: logic.on_mqtt_message(f"smartstay-manar/{apt}/access/request",
                                               json.dumps({"code": c}).encode())
    bridge.sent.clear(); ask("maison4", code["code"])
    assert bridge.sent[-1] == ("smartstay-manar/maison4/access/response", {"result": "open"})
    assert dev("maison4")["door"] == "unlocked"
    ask("maison4", "000000x"); assert bridge.sent[-1][1] == {"result": "denied"}      # erroné
    ask("maison5", code["code"]); assert bridge.sent[-1][1] == {"result": "denied"}   # autre logement
    client.post(f"/access-codes/{code['id']}/cancel", headers=OWNER)
    ask("maison4", code["code"]); assert bridge.sent[-1][1] == {"result": "denied"}   # annulé
    logs = client.get("/logs", headers=OWNER).json()
    assert any(l["actor"] == "keypad" and l["result"] == "refused" for l in logs)
    leaks = [l for l in logs if code["code"] in (l["actor"] + l["action"] + (l["detail"] or ""))]
    assert not leaks, leaks                                                         # code jamais journalisé

def test_expired_code_and_mqtt_down():
    base = {"apartment_id": "maison6", "reference": "R3",
            "check_in": "2020-01-01T00:00:00Z", "check_out": "2020-01-05T00:00:00Z"}
    rid = client.post("/reservations", json=base, headers=OWNER).json()["id"]
    c = client.post(f"/reservations/{rid}/access-code", headers=OWNER).json()["code"]
    logic.on_mqtt_message("smartstay-manar/maison6/access/request", json.dumps({"code": c}).encode())
    assert bridge.sent[-1][1] == {"result": "denied"}                                 # expiré
    bridge.up = False
    assert client.post("/apartments/maison6/commands", json={"on": True}, headers=OWNER).status_code == 503
    assert dev("maison6")["ac"]["on"] is False        # état non modifié si l'envoi échoue
    bridge.up = True

def test_update_reservation_rules():
    mk = lambda ref, a, b, apt="maison2": client.post("/reservations", json={
        "apartment_id": apt, "reference": ref, "check_in": a, "check_out": b}, headers=OWNER)
    r1 = mk("U1", "2095-01-01T13:00:00Z", "2095-01-05T10:00:00Z").json()["id"]
    r2 = mk("U2", "2095-02-01T13:00:00Z", "2095-02-05T10:00:00Z").json()["id"]
    put = lambda rid, apt, a, b: client.put(f"/reservations/{rid}", headers=OWNER, json={
        "apartment_id": apt, "reference": "U", "check_in": a, "check_out": b})
    assert put(r2, "maison2", "2095-01-03T13:00:00Z", "2095-02-05T10:00:00Z").status_code == 409   # chevauche U1
    client.post(f"/reservations/{r1}/access-code", headers=OWNER)
    assert put(r1, "maison3", "2095-01-01T13:00:00Z", "2095-01-05T10:00:00Z").status_code == 409   # logement changé, code existant
    assert put(r2, "maison3", "2095-02-01T13:00:00Z", "2095-02-05T10:00:00Z").status_code == 200   # sans code : autorisé
    client.delete(f"/reservations/{r1}", headers=OWNER)
    assert put(r1, "maison2", "2095-01-01T13:00:00Z", "2095-01-05T10:00:00Z").status_code == 409   # annulée