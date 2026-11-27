"""Client Tuya Cloud pour la serrure. Module indépendant : il n'importe ni FastAPI ni les modèles.
Signature et appel repris de tuya_offline.py (testé avec succès sur la serrure réelle)."""
import hashlib, hmac, json, logging, threading, time
import requests
from . import config

log = logging.getLogger("tuya")
TIMEOUT_SECONDS = 10
TOKEN_MAX_AGE = 1800          # on renouvelle le token au plus tard toutes les 30 min (prudence)

class TuyaError(Exception):
    """Erreur Tuya (réseau, refus de l'API, réponse inattendue). Ne contient jamais de secret."""

_token = {"value": "", "until": 0.0}
_lock = threading.Lock()

def _sign(token: str, t: str, method: str, path: str, body: str) -> str:
    body_hash = hashlib.sha256(body.encode()).hexdigest()
    to_sign = f"{method}\n{body_hash}\n\n{path}"
    msg = config.TUYA_ACCESS_ID + token + t + to_sign
    return hmac.new(config.TUYA_ACCESS_SECRET.encode(), msg.encode(), hashlib.sha256).hexdigest().upper()

def _call(method: str, path: str, body: str = "", token: str = "") -> dict:
    t = str(int(time.time() * 1000))
    headers = {"client_id": config.TUYA_ACCESS_ID, "sign": _sign(token, t, method, path, body),
               "t": t, "sign_method": "HMAC-SHA256", "Content-Type": "application/json"}
    if token:
        headers["access_token"] = token
    try:
        r = requests.request(method, config.TUYA_BASE_URL + path, headers=headers,
                             data=body.encode() if body else None, timeout=TIMEOUT_SECONDS)
        data = r.json()
    except (requests.RequestException, ValueError) as e:
        raise TuyaError("Tuya injoignable ou réponse illisible") from e
    if not data.get("success"):
        raise TuyaError(f"Tuya a refusé la requête (code {data.get('code')}) : {data.get('msg')}")
    return data.get("result") or {}

def _get_token() -> str:
    with _lock:
        if _token["value"] and time.time() < _token["until"]:
            return _token["value"]
        result = _call("GET", "/v1.0/token?grant_type=1")
        if "access_token" not in result:
            raise TuyaError("Tuya n'a pas renvoyé de token")
        _token["value"] = result["access_token"]
        _token["until"] = time.time() + TOKEN_MAX_AGE
        return _token["value"]

def create_offline_password(device_id: str, name: str, start_ts: int, end_ts: int) -> dict:
    """Crée un mot de passe temporaire hors ligne (type 'multiple'). Horodatages en secondes.
    Retourne le champ 'result' de Tuya ; le code est dans result['offline_temp_password']."""
    body = json.dumps({"name": name, "type": "multiple",
                       "effective_time": int(start_ts), "invalid_time": int(end_ts)})
    result = _call("POST", f"/v1.1/devices/{device_id}/door-lock/offline-temp-password",
                   body=body, token=_get_token())
    if "offline_temp_password" not in result:
        raise TuyaError("Réponse Tuya sans code")
    return result
