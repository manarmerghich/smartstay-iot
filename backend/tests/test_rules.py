import json
from fastapi.testclient import TestClient
from app import logic
from app.main import app
import seed  # noqa: F401

client = TestClient(app)

def _h(email):
    response = client.post(
        "/auth/login",
        json={"email": email, "password": "demo1234"}
    )

    assert response.status_code == 200, (
        f"Login failed for {email}: "
        f"{response.status_code} - {response.text}"
    )

    token = response.json()["token"]
    return {"Authorization": f"Bearer {token}"}


OWNER = _h("owner@smartstay.test")


class Fake:
    def __init__(self):
        self.sent = []

    def publish(self, topic, payload):
        self.sent.append((topic, json.loads(payload)))
        return True


def test_rules_listed_and_toggled():
    response = client.get("/rules", headers=OWNER)

    assert response.status_code == 200, (
        f"GET /rules failed: {response.status_code} - {response.text}"
    )

    rules = {r["id"]: r for r in response.json()}

    assert set(rules) == {"comfort-guard", "save-energy"}
    assert rules["comfort-guard"]["enabled"] is True
    assert rules["save-energy"]["enabled"] is False

    # The Owner should be able to activate a rule.
    response = client.put(
        "/rules/save-energy",
        json={"enabled": True},
        headers=OWNER
    )

    assert response.status_code == 200, (
        f"Owner could not enable save-energy: "
        f"{response.status_code} - {response.text}"
    )

    # An unknown rule should return 404.
    response = client.put(
        "/rules/inconnue",
        json={"enabled": True},
        headers=OWNER
    )

    assert response.status_code == 404, (
        f"Expected 404 for unknown rule, got "
        f"{response.status_code} - {response.text}"
    )

    # Restore the initial state.
    response = client.put(
        "/rules/save-energy",
        json={"enabled": False},
        headers=OWNER
    )

    assert response.status_code == 200, (
        f"Could not restore save-energy: "
        f"{response.status_code} - {response.text}"
    )


def test_disabled_rule_does_not_fire_and_enabled_one_is_counted():
    logic.set_bridge(Fake())

    topic = "smartstay-manar/maison5/telemetry"

    def send_telemetry():
        logic.on_mqtt_message(
            topic,
            json.dumps({
                "temperature": 31,
                "humidity": 40,
                "presence": True
            }).encode()
        )

    # First, make sure the AC is OFF.
    response = client.post(
        "/apartments/maison5/commands",
        json={"on": False},
        headers=OWNER
    )

    assert response.status_code == 200, (
        f"Could not turn off AC: {response.status_code} - {response.text}"
    )

    # Disable the comfort rule.
    response = client.put(
        "/rules/comfort-guard",
        json={"enabled": False},
        headers=OWNER
    )

    assert response.status_code == 200, (
        f"Could not disable comfort-guard: "
        f"{response.status_code} - {response.text}"
    )

    send_telemetry()

    apartments = client.get("/apartments", headers=OWNER)

    assert apartments.status_code == 200, apartments.text

    maison5 = next(
        a for a in apartments.json()
        if a["id"] == "maison5"
    )

    assert maison5["devices"]["ac"]["on"] is False

    # Enable the rule again.
    response = client.put(
        "/rules/comfort-guard",
        json={"enabled": True},
        headers=OWNER
    )

    assert response.status_code == 200, (
        f"Could not enable comfort-guard: "
        f"{response.status_code} - {response.text}"
    )

    send_telemetry()

    rules_response = client.get("/rules", headers=OWNER)

    assert rules_response.status_code == 200, rules_response.text

    rules = {
        r["id"]: r for r in rules_response.json()
    }

    comfort_rule = rules["comfort-guard"]

    assert comfort_rule["triggers"] >= 1
    assert comfort_rule["last_trigger"]["apartment_id"] == "maison5"


def test_logs_filter_and_fields():
    # Generate an event so that we have a log to retrieve.
    logic.set_bridge(Fake())

    logic.on_mqtt_message(
        "smartstay-manar/maison5/telemetry",
        json.dumps({
            "temperature": 31,
            "humidity": 40,
            "presence": True
        }).encode()
    )

    response = client.get(
        "/logs?apartment_id=maison5",
        headers=OWNER
    )

    assert response.status_code == 200, (
        f"GET /logs failed: {response.status_code} - {response.text}"
    )

    logs = response.json()

    assert isinstance(logs, list), (
        f"Expected a list of logs, received: {logs}"
    )

    assert logs
    assert all(
        log["apartment_id"] == "maison5"
        for log in logs
    )

    automatic_logs = [
        log for log in logs
        if log["actor_type"] == "automation"
    ]

    assert automatic_logs
    assert automatic_logs[0]["rule"] == "comfort-guard"


def test_list_access_codes_of_a_reservation():
    response = client.post(
        "/reservations",
        json={
            "apartment_id": "maison6",
            "reference": "CODES-1",
            "check_in": "2026-01-01T15:00:00+01:00",
            "check_out": "2099-01-01T11:00:00+01:00"
        },
        headers=OWNER
    )

    assert response.status_code in (200, 201), (
        f"Could not create reservation: "
        f"{response.status_code} - {response.text}"
    )

    reservation_id = response.json()["id"]

    # Initially, the reservation should have no access codes.
    response = client.get(
        f"/reservations/{reservation_id}/access-codes",
        headers=OWNER
    )

    assert response.status_code == 200, (
        f"Could not list access codes: "
        f"{response.status_code} - {response.text}"
    )

    assert response.json() == []

    # Generate an access code.
    response = client.post(
        f"/reservations/{reservation_id}/access-code",
        headers=OWNER
    )

    assert response.status_code in (200, 201), (
        f"Could not generate access code: "
        f"{response.status_code} - {response.text}"
    )

    created_code = response.json()["code"]

    # Retrieve the generated code.
    response = client.get(
        f"/reservations/{reservation_id}/access-codes",
        headers=OWNER
    )

    assert response.status_code == 200, (
        f"Could not retrieve access codes: "
        f"{response.status_code} - {response.text}"
    )

    codes = response.json()

    assert codes
    assert codes[0]["code"] == created_code
    assert len(codes[0]["code"]) == 6

    # A reservation that does not exist should return 404.
    response = client.get(
        "/reservations/99999/access-codes",
        headers=OWNER
    )

    assert response.status_code == 404, (
        f"Expected 404 for nonexistent reservation, got "
        f"{response.status_code} - {response.text}"
    )


def test_alert_ac_on_window_open_and_measurement_history():
    logic.set_bridge(Fake())

    # Turn the AC ON.
    response = client.post(
        "/apartments/maison2/commands",
        json={"on": True},
        headers=OWNER
    )

    assert response.status_code == 200, response.text

    # Open the window.
    response = client.post(
        "/apartments/maison2/commands",
        json={"window": "open"},
        headers=OWNER
    )

    assert response.status_code == 200, response.text

    alerts_response = client.get("/alerts", headers=OWNER)

    assert alerts_response.status_code == 200, alerts_response.text

    alerts = alerts_response.json()

    assert any(
        alert["apartment_id"] == "maison2"
        and alert["type"] == "ac_on_window_open"
        for alert in alerts
    )

    # Close the window.
    response = client.post(
        "/apartments/maison2/commands",
        json={"window": "closed"},
        headers=OWNER
    )

    assert response.status_code == 200, response.text

    alerts_response = client.get("/alerts", headers=OWNER)

    assert alerts_response.status_code == 200, alerts_response.text

    assert not any(
        alert["apartment_id"] == "maison2"
        for alert in alerts_response.json()
    )

    # Send a new measurement.
    logic.on_mqtt_message(
        "smartstay-manar/maison2/telemetry",
        json.dumps({
            "temperature": 22,
            "humidity": 40,
            "presence": False
        }).encode()
    )

    response = client.get(
        "/apartments/maison2/measurements?limit=5",
        headers=OWNER
    )

    assert response.status_code == 200, response.text

    measurements = response.json()

    assert measurements
    assert measurements[0]["temperature"] == 22
    assert measurements[0]["recorded_at"]

    # An unknown apartment should return 404.
    response = client.get(
        "/apartments/inconnu/measurements",
        headers=OWNER
    )

    assert response.status_code == 404


def test_out_of_range_humidity_is_ignored():
    response = client.get(
        "/apartments/maison4/measurements",
        headers=OWNER
    )

    assert response.status_code == 200, response.text

    initial_count = len(response.json())

    # Invalid humidity values should be ignored.
    for bad_humidity in (140, -5):
        logic.on_mqtt_message(
            "smartstay-manar/maison4/telemetry",
            json.dumps({
                "temperature": 22,
                "humidity": bad_humidity,
                "presence": False
            }).encode()
        )

    response = client.get(
        "/apartments/maison4/measurements",
        headers=OWNER
    )

    assert response.status_code == 200, response.text
    assert len(response.json()) == initial_count

    # A valid humidity value should be recorded.
    logic.on_mqtt_message(
        "smartstay-manar/maison4/telemetry",
        json.dumps({
            "temperature": 22,
            "humidity": 55,
            "presence": False
        }).encode()
    )

    response = client.get(
        "/apartments/maison4/measurements",
        headers=OWNER
    )

    assert response.status_code == 200, response.text
    assert len(response.json()) == initial_count + 1
