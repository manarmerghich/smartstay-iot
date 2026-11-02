#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Keypad.h>
#include <DHT.h>
#include <ESP32Servo.h>

// =====================================
// 1. CONFIGURATION WIFI
// =====================================

const char* WIFI_SSID = "Wokwi-GUEST";
const char* WIFI_PASSWORD = "";

// =====================================
// 2. CONFIGURATION MQTT
// =====================================

const char* MQTT_SERVER = "broker.emqx.io";
const int MQTT_PORT = 1883;

const char* TOPIC_TELEMETRY =
  "smartstay-manar/maison1/telemetry";

const char* TOPIC_COMMAND =
  "smartstay-manar/maison1/command";

const char* TOPIC_ACCESS_REQUEST =
  "smartstay-manar/maison1/access/request";

const char* TOPIC_ACCESS_RESPONSE =
  "smartstay-manar/maison1/access/response";

WiFiClient espClient;
PubSubClient mqtt(espClient);

// =====================================
// 3. CAPTEURS
// =====================================

#define DHT_PIN 15
#define DHT_TYPE DHT22
#define PIR_PIN 27

DHT dht(DHT_PIN, DHT_TYPE);

// =====================================
// 4. ACTIONNEURS
// =====================================

#define SERVO_DOOR_PIN 18
#define SERVO_WINDOW_PIN 19
#define AC_LED_PIN 23

Servo doorServo;
Servo windowServo;

// =====================================
// 5. KEYPAD 4x4
// =====================================

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

// =====================================
// 6. VARIABLES
// =====================================

String accessCode = "";

unsigned long lastTelemetry = 0;
const unsigned long TELEMETRY_INTERVAL = 5000;

bool doorIsOpen = false;
unsigned long doorOpenTime = 0;

const unsigned long DOOR_OPEN_DURATION = 5000;

// =====================================
// 7. CONNEXION WIFI
// =====================================

void connectWiFi() {

  Serial.print("Connexion au Wi-Fi...");

  WiFi.mode(WIFI_STA);
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

// =====================================
// 8. CONTROLE DE LA PORTE
// =====================================

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

// =====================================
// 9. ENVOI DES MESURES
// =====================================

void sendTelemetry() {

  float temperature = dht.readTemperature();
  float humidity = dht.readHumidity();

  int presence = digitalRead(PIR_PIN);

  if (isnan(temperature) || isnan(humidity)) {
    Serial.println("Erreur de lecture DHT22.");
    return;
  }

  JsonDocument doc;

  doc["temperature"] = temperature;
  doc["humidity"] = humidity;
  doc["presence"] = (presence == HIGH);

  char buffer[200];

  serializeJson(doc, buffer);

  if (mqtt.publish(TOPIC_TELEMETRY, buffer)) {

    Serial.println("Mesures envoyees au serveur :");
    Serial.println(buffer);

  } else {

    Serial.println("Erreur d'envoi des mesures.");
  }
}

// =====================================
// 10. ENVOI DU CODE D'ACCES
// =====================================

void sendAccessRequest(String code) {

  JsonDocument doc;

  doc["code"] = code;

  char buffer[100];

  serializeJson(doc, buffer);

  if (mqtt.publish(TOPIC_ACCESS_REQUEST, buffer)) {

    Serial.println();
    Serial.println("Demande d'acces envoyee au serveur.");
    Serial.println(buffer);

  } else {

    Serial.println("Erreur d'envoi du code.");
  }
}

// =====================================
// 11. GESTION DU KEYPAD
// =====================================

void handleKeypad() {

  char key = keypad.getKey();

  if (key) {

    // Effacer le code
    if (key == '*') {

      accessCode = "";

      Serial.println();
      Serial.println("Code efface.");
    }

    // Envoyer le code avec #
    else if (key == '#') {

      if (accessCode.length() > 0) {

        Serial.println();
        Serial.println("Envoi de la demande au serveur...");

        sendAccessRequest(accessCode);

        accessCode = "";

      } else {

        Serial.println("Veuillez saisir un code.");
      }
    }

    // Saisie des chiffres
    else if (key >= '0' && key <= '9') {

      if (accessCode.length() < 10) {

        accessCode += key;

        Serial.print("*");
      }
    }
  }
}

// =====================================
// 12. RECEPTION DES REPONSES ET COMMANDES
// =====================================

void mqttCallback(
  char* topic,
  byte* payload,
  unsigned int length
) {

  String message = "";

  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }

  Serial.println();
  Serial.print("Message recu : ");
  Serial.println(message);

  // ---------------------------------
  // REPONSE A LA DEMANDE D'ACCES
  // ---------------------------------

  if (String(topic) == TOPIC_ACCESS_RESPONSE) {

    JsonDocument doc;

    DeserializationError error =
      deserializeJson(doc, message);

    if (error) {
      Serial.println("Erreur JSON - acces.");
      return;
    }

    const char* result = doc["result"] | "";

    if (String(result) == "open") {

      Serial.println("Acces autorise par le serveur.");

      openDoor();

    } else {

      Serial.println("Acces refuse par le serveur.");

      closeDoor();
    }

    return;
  }

  // ---------------------------------
  // COMMANDES DU SERVEUR
  // ---------------------------------

  if (String(topic) == TOPIC_COMMAND) {

    JsonDocument doc;

    DeserializationError error =
      deserializeJson(doc, message);

    if (error) {
      Serial.println("Erreur JSON - commande.");
      return;
    }

    const char* device = doc["device"] | "";
    const char* value = doc["value"] | "";

    String action = value;
    action.toLowerCase();

    // Commande porte
    if (String(device) == "door") {

      if (action == "open") {
        openDoor();
      }

      else if (action == "close") {
        closeDoor();
      }
    }

    // Commande fenetre
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

    // Commande climatisation
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

// =====================================
// 13. CONNEXION MQTT
// =====================================

void connectMQTT() {

  while (!mqtt.connected()) {

    Serial.print("Connexion au broker MQTT...");

    String clientId = "SmartStay-Maison1-";
    clientId += String(
      (uint32_t)ESP.getEfuseMac(),
      HEX
    );

    if (mqtt.connect(clientId.c_str())) {

      Serial.println("MQTT connecte !");

      mqtt.subscribe(TOPIC_COMMAND);
      mqtt.subscribe(TOPIC_ACCESS_RESPONSE);

      Serial.println("Topics MQTT souscrits.");

    } else {

      Serial.print("Echec MQTT. Code : ");
      Serial.println(mqtt.state());

      delay(2000);
    }
  }
}

// =====================================
// 14. SETUP
// =====================================

void setup() {

  Serial.begin(115200);

  Serial.println();
  Serial.println("================================");
  Serial.println("     SMARTSTAY - MAISON 1");
  Serial.println("================================");

  // Capteurs
  pinMode(PIR_PIN, INPUT);

  // LED
  pinMode(AC_LED_PIN, OUTPUT);
  digitalWrite(AC_LED_PIN, LOW);

  // DHT22
  dht.begin();

  // Servomoteurs
  doorServo.attach(SERVO_DOOR_PIN);
  windowServo.attach(SERVO_WINDOW_PIN);

  closeDoor();
  windowServo.write(0);

  // Wi-Fi
  connectWiFi();

  // MQTT
  mqtt.setServer(MQTT_SERVER, MQTT_PORT);
  mqtt.setCallback(mqttCallback);

  Serial.println("Systeme Maison 1 initialise.");
}

// =====================================
// 15. LOOP
// =====================================

void loop() {

  // Reconnexion Wi-Fi
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  // Reconnexion MQTT
  if (!mqtt.connected()) {
    connectMQTT();
  }

  // Reception des messages MQTT
  mqtt.loop();

  // Lecture du Keypad
  handleKeypad();

  // Envoi periodique des mesures
  if (millis() - lastTelemetry >= TELEMETRY_INTERVAL) {

    lastTelemetry = millis();

    sendTelemetry();
  }

  // Fermeture de la porte apres 5 secondes
  // si une ouverture a ete autorisee

  if (
    doorIsOpen &&
    millis() - doorOpenTime >= DOOR_OPEN_DURATION
  ) {

    closeDoor();
  }
}

