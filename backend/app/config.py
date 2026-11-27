import os
from dotenv import load_dotenv

load_dotenv()   # lit backend/.env (avant tout os.getenv)

def _bool(name: str, default: str) -> bool:
    return os.getenv(name, default).lower() in ("1", "true", "yes")

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./smartstay.db")
MQTT_ENABLED = _bool("MQTT_ENABLED", "true")
MQTT_HOST = os.getenv("MQTT_HOST", "broker.emqx.io")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_PREFIX = os.getenv("MQTT_PREFIX", "smartstay-manar")
_DEV_SECRET = "dev-secret-change-me-please-use-a-long-random-value"
JWT_SECRET = os.getenv("JWT_SECRET", _DEV_SECRET)
# Base locale SQLite = développement : le secret par défaut est toléré.
# Base PostgreSQL (Neon, déploiement) : un secret absent ou d'exemple permettrait de forger des jetons.
if not DATABASE_URL.startswith("sqlite") and (JWT_SECRET in (_DEV_SECRET, "change-me") or len(JWT_SECRET) < 24):
    raise RuntimeError("JWT_SECRET manquant ou trop faible : définis une valeur aléatoire d'au moins "
                       "24 caractères (ex. python -c \"import secrets; print(secrets.token_urlsafe(48))\")")
JWT_HOURS = 8
# Origines autorisées pour le dashboard (séparées par des virgules ; ajouter l'URL déployée)
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]

# Contrat §5 / §6
DOOR_AUTOLOCK_SECONDS = 5
AC_TEMP_THRESHOLD = 28.0          # automatisation clim : température >= 28
WINDOW_RULE_ENABLED = _bool("WINDOW_RULE_ENABLED", "false")  # décision ouverte

# Consommation électrique SIMULÉE (F6) : puissance estimée selon l'état des équipements
ENERGY_ENABLED = _bool("ENERGY_ENABLED", "true")
ENERGY_TICK_SECONDS = int(os.getenv("ENERGY_TICK_SECONDS", "30"))
ENERGY_SPEEDUP = float(os.getenv("ENERGY_SPEEDUP", "1"))   # démo : 60 => 1 min réelle = 1 h simulée
ENERGY_BASE_KW = 0.05                                        # veille : frigo, box, etc.
ENERGY_AC_KW = {"cool": 1.2, "auto": 0.9, "dry": 0.7}        # clim allumée, selon le mode
ENERGY_WINDOW_OPEN_FACTOR = 1.25                             # clim + fenêtre ouverte : +25 %
# Serrure Tuya (désactivée par défaut : rien ne change tant que TUYA_ENABLED=false)
TUYA_ENABLED = _bool("TUYA_ENABLED", "false")
TUYA_ACCESS_ID = os.getenv("TUYA_ACCESS_ID", "")
TUYA_ACCESS_SECRET = os.getenv("TUYA_ACCESS_SECRET", "")
TUYA_BASE_URL = os.getenv("TUYA_BASE_URL", "https://openapi.tuyaeu.com")
if TUYA_ENABLED and not (TUYA_ACCESS_ID and TUYA_ACCESS_SECRET):
    raise RuntimeError("TUYA_ENABLED=true mais TUYA_ACCESS_ID / TUYA_ACCESS_SECRET sont manquants")
