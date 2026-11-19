"""Simule la maison 1 contre un vrai broker pour valider le serveur de bout en bout.
Prérequis : le serveur tourne (uvicorn app.main:app) et `python seed.py` a été lancé.
Usage : python smoke_maison.py [maison1] [code_a_tester]
Ce script joue le rôle de l'ESP32/Wokwi : il publie telemetry + access/request,
et affiche ce qu'il reçoit sur command + access/response."""
import json, sys, time
import paho.mqtt.client as mqtt
from app import config

APT = sys.argv[1] if len(sys.argv) > 1 else "maison1"
CODE = sys.argv[2] if len(sys.argv) > 2 else "000000"   # un faux code -> doit donner "denied"
P = f"{config.MQTT_PREFIX}/{APT}"

def on_connect(c, u, f, rc, p=None):
    print("connecté au broker :", rc)
    c.subscribe(f"{P}/command"); c.subscribe(f"{P}/access/response")

def on_message(c, u, m):
    print(f"<-- {m.topic}  {m.payload.decode()}")

cl = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"smoke-{APT}-{int(time.time())}")
cl.on_connect, cl.on_message = on_connect, on_message
cl.connect(config.MQTT_HOST, config.MQTT_PORT, 30); cl.loop_start(); time.sleep(2)

print("\n1) Télémétrie chaude + présence (doit déclencher la clim si elle est éteinte)")
cl.publish(f"{P}/telemetry", json.dumps({"temperature": 30.0, "humidity": 45.0, "presence": True}), qos=1)
time.sleep(3)   # attendu : un message 'command' {"device":"ac","value":"on"}

print("\n2) Demande d'accès avec le code", CODE)
cl.publish(f"{P}/access/request", json.dumps({"code": CODE}), qos=1)
time.sleep(3)   # attendu : access/response {"result":"denied"} (ou open si code valide)

print("\n3) Maintenant, envoie une commande depuis /docs (ex. {\"door\":\"unlocked\"}) : 10 s d'écoute…")
time.sleep(10)
cl.loop_stop(); cl.disconnect()
