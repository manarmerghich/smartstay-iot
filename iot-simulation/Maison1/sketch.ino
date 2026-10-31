#include <DHT.h>
#include <ESP32Servo.h>

// Configuration des broches ESP32
#define DHT_PIN 15
#define DHT_TYPE DHT22
#define PIR_PIN 27
#define SERVO_DOOR 18
#define SERVO_WINDOW 19
#define LED_PIN 23

// Initialisation des composants
DHT dht(DHT_PIN, DHT_TYPE);
Servo doorServo;
Servo windowServo;

void setup() {
  Serial.begin(115200);

  dht.begin();

  pinMode(PIR_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);

  doorServo.attach(SERVO_DOOR);
  windowServo.attach(SERVO_WINDOW);

  doorServo.write(0);
  windowServo.write(0);

  digitalWrite(LED_PIN, LOW);

  Serial.println("SmartStay IoT - Maison 1");
  Serial.println("Systeme demarre !");
}

void loop() {
  // Lecture des capteurs
  float temperature = dht.readTemperature();
  float humidity = dht.readHumidity();
  int presence = digitalRead(PIR_PIN);

  if (isnan(temperature) || isnan(humidity)) {
    Serial.println("Erreur de lecture du DHT22");
    delay(2000);
    return;
  }

  // Affichage des mesures
  Serial.println("-------------------------");
  Serial.print("Temperature : ");
  Serial.print(temperature);
  Serial.println(" C");

  Serial.print("Humidite : ");
  Serial.print(humidity);
  Serial.println(" %");

  // Detection de presence
  if (presence == HIGH) {
  Serial.println("Presence detectee");
  doorServo.write(90);
  Serial.println("Porte ouverte");
  } else {
  Serial.println("Aucune presence");
  doorServo.write(0);
  Serial.println("Porte fermee");
  }

  // Gestion de la climatisation par LED
  if (temperature > 28) {
    digitalWrite(LED_PIN, HIGH);
    Serial.println("Climatisation activee");
  } else {
    digitalWrite(LED_PIN, LOW);
    Serial.println("Climatisation arretee");
  }

  // Ouverture automatique de la fenetre
  if (temperature > 30) {
    windowServo.write(90);
    Serial.println("Fenetre ouverte");
  } else {
    windowServo.write(0);
    Serial.println("Fenetre fermee");
  }

  delay(2000);
}

