#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Keypad.h>
#include <DHT.h>
#include <ESP32Servo.h>

// ==================================================
// 1. CONFIGURATION WIFI
// ==================================================

const char* WIFI_SSID = "Wokwi-GUEST";
const char* WIFI_PASSWORD = "";

// ==================================================
// 2. CONFIGURATION MQTT
// ==================================================

const char* MQTT_SERVER = "broker.emqx.io";
const int MQTT_PORT = 1883;

const char* TOPIC_TELEMETRY =
  "smartstay-manar/maison3/telemetry";

const char* TOPIC_COMMAND =
  "smartstay-manar/maison3/command";

const char* TOPIC_ACCESS_REQUEST =
  "smartstay-manar/maison3/access/request";

const char* TOPIC_ACCESS_RESPONSE =
  "smartstay-manar/maison3/access/response";

// ==================================================
// 3. CONFIGURATION DES BROCHES
// ==================================================

#define DHT_PIN 15
#define DHT_TYPE DHT22

#define PIR_PIN 27
#define AC_LED_PIN 23

#define SERVO_DOOR_PIN 18
#define SERVO_WINDOW_PIN 19

// ==================================================
// 4. INITIALISATION DES COMPOSANTS
// ==================================================

DHT dht(DHT_PIN, DHT_TYPE);

Servo doorServo;
Servo windowServo;

WiFiClient espClient;
PubSubClient mqtt(espClient);

// ==================================================
// 5. CONFIGURATION DU KEYPAD
// ==================================================

const byte ROWS = 4;
const byte COLS = 4;

char keys[ROWS][COLS] = {
  {'1', '2', '3', 'A'},
  {'4', '5', '6', 'B'},
  {'7', '8', '9', 'C'},
  {'*', '0', '#', 'D'}
};

byte rowPins[ROWS] = {13, 14, 16, 17};
byte colPins[COLS] = {25, 26, 32, 33};

Keypad keypad = Keypad(
  makeKeymap(keys),
  rowPins,
  colPins,
  ROWS,
  COLS
);

// ==================================================
// 6. VARIABLES
// ==================================================

String accessCode = "";

unsigned long lastTelemetry = 0;
unsigned long doorOpenTime = 0;

const unsigned long TELEMETRY_INTERVAL = 5000;
const unsigned long DOOR_OPEN_DURATION = 5000;

bool doorIsOpen = false;

// ==================================================
// 7. ENVOI DE LA DEMANDE D'ACCES
// ==================================================

void sendAccessRequest(String code) {

  JsonDocument doc;

  doc["code"] = code;

  char buffer[100];
  serializeJson(doc, buffer);

  mqtt.publish(TOPIC_ACCESS_REQUEST, buffer);

  Serial.println("Demande d'acces envoyee au serveur.");
  Serial.println(buffer);
}

// ==================================================
// 8. ENVOI DES DONNEES DES CAPTEURS
// ==================================================

void sendTelemetry() {

  float temperature = dht.readTemperature();
  float humidity = dht.readHumidity();

  bool presence = digitalRead(PIR_PIN);

  if (isnan(temperature) || isnan(humidity)) {
    Serial.println("Erreur lecture DHT22");
    return;
  }

  JsonDocument doc;

  doc["temperature"] = temperature;
  doc["humidity"] = humidity;
  doc["presence"] = presence;

  char buffer[150];
  serializeJson(doc, buffer);

  mqtt.publish(TOPIC_TELEMETRY, buffer);

  Serial.println("Mesures envoyees au serveur:");
  Serial.println(buffer);
}

// ==================================================
// 9. CONTROLE DE LA PORTE
// ==================================================

void openDoor() {

  doorServo.write(90);

  doorIsOpen = true;
  doorOpenTime = millis();

  Serial.println("Porte ouverte");
}

void closeDoor() {

  doorServo.write(0);

  doorIsOpen = false;

  Serial.println("Porte fermee");
}

// ==================================================
// 10. CONNEXION WIFI
// ==================================================

void connectWiFi() {

  Serial.print("Connexion au Wi-Fi");

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("Wi-Fi connecte");
  Serial.print("Adresse IP: ");
  Serial.println(WiFi.localIP());
}

// ==================================================
// 11. GESTION DU KEYPAD
// ==================================================

void handleKeypad() {

  char key = keypad.getKey();

  if (key) {

    if (key == '*') {

      accessCode = "";
      Serial.println("Code efface");

    }

    else if (key == '#') {

      if (accessCode.length() > 0) {

        sendAccessRequest(accessCode);

        accessCode = "";

      } else {

        Serial.println("Veuillez saisir un code");

      }

    }

    else if (key >= '0' && key <= '9') {

      accessCode += key;

      Serial.print("*");

    }
  }
}

// ==================================================
// 12. RECEPTION DES MESSAGES MQTT
// ==================================================

void mqttCallback(
  char* topic,
  byte* payload,
  unsigned int length
) {

  String message = "";

  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }

  Serial.print("Message recu sur: ");
  Serial.println(topic);

  Serial.println(message);

  JsonDocument doc;

  DeserializationError error =
    deserializeJson(doc, message);

  if (error) {
    Serial.println("Erreur JSON");
    return;
  }

  String receivedTopic = String(topic);

  // ----------------------------------------------
  // REPONSE D'AUTORISATION D'ACCES
  // ----------------------------------------------

  if (receivedTopic == TOPIC_ACCESS_RESPONSE) {

    String result = doc["result"] | "";

    if (result == "open") {

      Serial.println("Acces autorise par le serveur");

      openDoor();

    }

    else if (result == "denied") {

      Serial.println("Acces refuse par le serveur");

      closeDoor();

    }
  }

  // ----------------------------------------------
  // COMMANDES DES EQUIPEMENTS
  // ----------------------------------------------

  else if (receivedTopic == TOPIC_COMMAND) {

    String device = doc["device"] | "";
    String value = doc["value"] | "";

    value.toLowerCase();

    if (device == "window") {

      if (value == "open") {

        windowServo.write(90);
        Serial.println("Fenetre ouverte");

      }

      else if (value == "close") {

        windowServo.write(0);
        Serial.println("Fenetre fermee");

      }
    }

    else if (device == "ac") {

      if (value == "on") {

        digitalWrite(AC_LED_PIN, HIGH);
        Serial.println("Climatisation activee");

      }

      else if (value == "off") {

        digitalWrite(AC_LED_PIN, LOW);
        Serial.println("Climatisation arretee");

      }
    }
  }
}

// ==================================================
// 13. CONNEXION MQTT
// ==================================================

void connectMQTT() {

  while (!mqtt.connected()) {

    Serial.print("Connexion au MQTT...");

    String clientId =
      "SmartStay-Maison3-" +
      String((uint32_t)ESP.getEfuseMac(), HEX);

    if (mqtt.connect(clientId.c_str())) {

      Serial.println("MQTT connecte");

      mqtt.subscribe(TOPIC_COMMAND);
      mqtt.subscribe(TOPIC_ACCESS_RESPONSE);

      Serial.println("Topics MQTT souscrits");

    }

    else {

      Serial.print("Echec MQTT, code: ");
      Serial.println(mqtt.state());

      delay(3000);

    }
  }
}

// ==================================================
// 14. SETUP
// ==================================================

void setup() {

  Serial.begin(115200);

  Serial.println();
  Serial.println("================================");
  Serial.println("SMARTSTAY - MAISON 3");
  Serial.println("================================");

  pinMode(PIR_PIN, INPUT);
  pinMode(AC_LED_PIN, OUTPUT);

  digitalWrite(AC_LED_PIN, LOW);

  dht.begin();

  doorServo.attach(SERVO_DOOR_PIN);
  windowServo.attach(SERVO_WINDOW_PIN);

  closeDoor();
  windowServo.write(0);

  connectWiFi();

  mqtt.setServer(MQTT_SERVER, MQTT_PORT);
  mqtt.setCallback(mqttCallback);

  connectMQTT();
}

// ==================================================
// 15. LOOP
// ==================================================

void loop() {

  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  if (!mqtt.connected()) {
    connectMQTT();
  }

  mqtt.loop();

  handleKeypad();

  // Envoi periodique des mesures

  if (millis() - lastTelemetry >= TELEMETRY_INTERVAL) {

    lastTelemetry = millis();

    sendTelemetry();
  }

  // Fermeture automatique apres 5 secondes

  if (doorIsOpen &&
      millis() - doorOpenTime >= DOOR_OPEN_DURATION) {

    closeDoor();
  }
}

