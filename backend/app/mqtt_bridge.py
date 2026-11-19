"""Client MQTT du serveur. Les handlers de messages sont dans logic.py."""
import logging, uuid
import paho.mqtt.client as mqtt
from . import config

log = logging.getLogger("mqtt")

def topic(apartment_id: str, suffix: str) -> str:
    return f"{config.MQTT_PREFIX}/{apartment_id}/{suffix}"

class MqttBridge:
    def __init__(self, on_message):
        # client_id unique : le broker est public, deux clients de même id se chassent
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2,
                                  client_id=f"{config.MQTT_PREFIX}-server-{uuid.uuid4().hex[:8]}")
        self.client.on_connect = self._on_connect
        self.client.on_message = lambda c, u, m: on_message(m.topic, m.payload)
        self.client.on_disconnect = lambda c, u, f, rc, p=None: log.warning("MQTT déconnecté (%s)", rc)
        self.client.reconnect_delay_set(1, 30)

    def _on_connect(self, client, userdata, flags, reason, props=None):
        log.info("MQTT connecté (%s)", reason)
        client.subscribe(f"{config.MQTT_PREFIX}/+/telemetry")
        client.subscribe(f"{config.MQTT_PREFIX}/+/access/request")

    def start(self):
        self.client.connect_async(config.MQTT_HOST, config.MQTT_PORT, keepalive=30)
        self.client.loop_start()

    def stop(self):
        self.client.loop_stop()
        self.client.disconnect()

    def publish(self, t: str, payload: str) -> bool:
        if not self.client.is_connected():
            return False
        return self.client.publish(t, payload, qos=1).rc == mqtt.MQTT_ERR_SUCCESS
