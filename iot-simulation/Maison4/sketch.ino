
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Keypad.h>
#include <DHT.h>
#include <ESP32Servo.h>

// 1. WIFI
const char* WIFI_SSID = "Wokwi-GUEST";
const char* WIFI_PASSWORD = "";

// 2. MQTT
const char* MQTT_SERVER = "broker.emqx.io";
const int MQTT_PORT = 1883;

// 3. TOPICS - MAISON 4
const char* TOPIC_TELEMETRY = "smartstay-manar/maison4/telemetry";
const char* TOPIC_COMMAND = "smartstay-manar/maison4/command";
const char* TOPIC_ACCESS_REQUEST = "smartstay-manar/maison4/access/request";
const char* TOPIC_ACCESS_RESPONSE = "smartstay-manar/maison4/access/response";

// 4. CAPTEURS
#define DHT_PIN 15
#define DHT_TYPE DHT22
#define PIR_PIN 27

DHT dht(DHT_PIN, DHT_TYPE);

// 5. ACTIONNEURS
#define SERVO_DOOR_PIN 18
#define SERVO_WINDOW_PIN 19
#define AC_LED_PIN 23

Servo doorServo;
Servo windowServo;

// 6. KEYPAD
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
  makeKeymap(keys), rowPins, colPins, ROWS, COLS
);

String accessCode = "";

// 7. DELAIS
const unsigned long TELEMETRY_INTERVAL = 5000;
const unsigned long DOOR_OPEN_DURATION = 5000;

unsigned long lastTelemetry = 0;
unsigned long doorOpenTime = 0;

bool doorIsOpen = false;

// 8. CONNEXION
WiFiClient espClient;
PubSubClient mqtt(espClient);

void connectWiFi() {
  Serial.print("Connexion Wi-Fi...");

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("Wi-Fi connecte !");
  Serial.print("Adresse IP : ");
  Serial.println(WiFi.localIP());
}

// 9. PORTE
void openDoor() {
  doorServo.write(90);
  doorIsOpen = true;
  doorOpenTime = millis();

  Serial.println("Porte ouverte.");
}

void closeDoor() {
  doorServo.write(0);
  doorIsOpen = false;

  Serial.println("Porte fermee.");
}

// 10. DEMANDE D'ACCES
void sendAccessRequest(String code) {
  JsonDocument doc;
  doc["code"] = code;

  String payload;
  serializeJson(doc, payload);

  mqtt.publish(TOPIC_ACCESS_REQUEST, payload.c_str());

  Serial.println("Demande envoyee au serveur.");
  Serial.println(payload);
}

// 11. TELEMETRIE
void sendTelemetry() {
  float temperature = dht.readTemperature();
  float humidity = dht.readHumidity();
  bool presence = digitalRead(PIR_PIN);

  if (isnan(temperature) || isnan(humidity)) {
    Serial.println("Erreur lecture DHT22.");
    return;
  }

  JsonDocument doc;
  doc["temperature"] = temperature;
  doc["humidity"] = humidity;
  doc["presence"] = presence;

  String payload;
  serializeJson(doc, payload);

  mqtt.publish(TOPIC_TELEMETRY, payload.c_str());

  Serial.println("Mesures envoyees au serveur :");
  Serial.println(payload);
}

// 12. KEYPAD
void handleKeypad() {
  char key = keypad.getKey();

  if (key) {
    if (key == '*') {
      accessCode = "";
      Serial.println("Code efface.");
    }
    else if (key == '#') {
      if (accessCode.length() > 0) {
        Serial.println("Envoi de la demande au serveur...");
        sendAccessRequest(accessCode);
        accessCode = "";
      } else {
        Serial.println("Veuillez saisir un code.");
      }
    }
    else if (key >= '0' && key <= '9') {
      if (accessCode.length() < 10) {
        accessCode += key;
        Serial.print("*");
      }
    }
  }
}

// 13. RECEPTION MQTT
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String message = "";

  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }

  Serial.println();
  Serial.print("Message recu : ");
  Serial.println(message);

  // REPONSE D'ACCES
  if (String(topic) == TOPIC_ACCESS_RESPONSE) {
    JsonDocument doc;

    DeserializationError error = deserializeJson(doc, message);

    if (error) {
      Serial.println("Erreur JSON - acces.");
      return;
    }

    const char* result = doc["result"] | "";

    if (String(result) == "open") {
      Serial.println("Acces autorise par le serveur.");
      openDoor();
    }
    else if (String(result) == "denied") {
      Serial.println("Acces refuse par le serveur.");
      closeDoor();
    }

    return;
  }

  // COMMANDES DU SERVEUR
  if (String(topic) == TOPIC_COMMAND) {
    JsonDocument doc;

    DeserializationError error = deserializeJson(doc, message);

    if (error) {
      Serial.println("Erreur JSON - commande.");
      return;
    }

    const char* device = doc["device"] | "";
    const char* value = doc["value"] | "";

    String action = value;
    action.toLowerCase();

    if (String(device) == "door") {
      if (action == "open") {
        openDoor();
      }
      else if (action == "close") {
        closeDoor();
      }
    }

    else if (String(device) == "window") {
      if (action == "open") {
        windowServo.write(90);
        Serial.println("Fenetre ouverte.");
      }
      else if (action == "close") {
        windowServo.write(0);
        Serial.println("Fenetre fermee.");
      }
    }

    else if (String(device) == "ac") {
      if (action == "on") {
        digitalWrite(AC_LED_PIN, HIGH);
        Serial.println("Climatisation activee.");
      }
      else if (action == "off") {
        digitalWrite(AC_LED_PIN, LOW);
        Serial.println("Climatisation arretee.");
      }
    }
  }
}

// 14. CONNEXION MQTT
void connectMQTT() {
  while (!mqtt.connected()) {
    Serial.print("Connexion au broker MQTT...");

    String clientId = "SmartStay-Maison4-";
    clientId += String((uint32_t)ESP.getEfuseMac(), HEX);

    if (mqtt.connect(clientId.c_str())) {
      Serial.println("MQTT connecte !");

      mqtt.subscribe(TOPIC_COMMAND);
      mqtt.subscribe(TOPIC_ACCESS_RESPONSE);

      Serial.println("Topics MQTT souscrits.");
    }
    else {
      Serial.print("Echec MQTT. Code : ");
      Serial.println(mqtt.state());
      delay(2000);
    }
  }
}

// 15. SETUP
void setup() {
  Serial.begin(115200);

  Serial.println();
  Serial.println("================================");
  Serial.println("     SMARTSTAY - MAISON 4");
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

  Serial.println("Systeme Maison 4 initialise.");
}

// 16. LOOP
void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  if (!mqtt.connected()) {
    connectMQTT();
  }

  mqtt.loop();
  handleKeypad();

  if (millis() - lastTelemetry >= TELEMETRY_INTERVAL) {
    lastTelemetry = millis();
    sendTelemetry();
  }

  if (doorIsOpen &&
      millis() - doorOpenTime >= DOOR_OPEN_DURATION) {
    closeDoor();
  }
}

