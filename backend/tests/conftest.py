import os
# Une seule base de test, créée une seule fois, partagée par tous les fichiers de test.
os.environ["DATABASE_URL"] = "sqlite:///./test.db"
os.environ["MQTT_ENABLED"] = "false"
if os.path.exists("test.db"):
    os.remove("test.db")