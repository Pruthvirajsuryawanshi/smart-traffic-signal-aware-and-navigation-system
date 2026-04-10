#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ===================== WIFI =====================
const char* WIFI_SSID = "Hackathon-2025";
const char* WIFI_PASS = "20252025";

// ===================== CLOUD ====================
const char* CLOUD_URL = "https://ssvddgrfxqomtonfukew.supabase.co/functions/v1/update-signals";
const char* CLOUD_BEARER = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzdmRkZ3JmeHFvbXRvbmZ1a2V3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MzIwNjAsImV4cCI6MjA5MDIwODA2MH0.J5erIW2KxHprj7ScNOyoEtDj_efDYVQ4oE_6ipe9um4";

// ===================== TIMING ===================
const uint32_t GREEN_TIME_SEC  = 15;
const uint32_t YELLOW_TIME_SEC = 3;

// ===================== INT-2 PINS =====================
#define SIG201_GREEN 13
#define SIG201_YELLOW 4
#define SIG201_RED 14

#define SIG202_GREEN 27
#define SIG202_YELLOW 26
#define SIG202_RED 25

#define SIG203_GREEN 33
#define SIG203_YELLOW 32
#define SIG203_RED 23

#define SIG204_GREEN 22
#define SIG204_YELLOW 21
#define SIG204_RED 19

#define BUZZER_PIN 5

// ONLY SIG-201 to SIG-204 - INT-2 signals
const char* MY_SIGNALS[] = {"SIG-201", "SIG-202", "SIG-203", "SIG-204"};
const int MY_SIGNAL_COUNT = 4;

struct SignalPins {
  const char* id;
  uint8_t g;
  uint8_t y;
  uint8_t r;
};

SignalPins signals[] = {
  {"SIG-201", SIG201_GREEN, SIG201_YELLOW, SIG201_RED},
  {"SIG-202", SIG202_GREEN, SIG202_YELLOW, SIG202_RED},
  {"SIG-203", SIG203_GREEN, SIG203_YELLOW, SIG203_RED},
  {"SIG-204", SIG204_GREEN, SIG204_YELLOW, SIG204_RED}
};

const int SIGNAL_COUNT = sizeof(signals) / sizeof(signals[0]);
const uint32_t SLOT_SEC = GREEN_TIME_SEC + YELLOW_TIME_SEC;
const uint32_t TOTAL_CYCLE_SEC = SIGNAL_COUNT * SLOT_SEC;

WebServer server(80);

// State variables
bool emergencyMode = false;
int emergencyIndex = -1;
unsigned long emergencyStartMs = 0;
const unsigned long EMERGENCY_TIMEOUT = 30000;

uint32_t cycleStartMs = 0;
String lastPublishedStates[SIGNAL_COUNT];
bool forcePublish = false;

void addCorsHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "POST,GET,OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}

void handleOptions() {
  addCorsHeaders();
  server.send(204);
}

int indexBySignalId(const String& signalId) {
  for (int i = 0; i < SIGNAL_COUNT; i++) {
    if (signalId.equalsIgnoreCase(signals[i].id)) return i;
  }
  return -1;
}

void setOneSignalLED(int idx, const String& state) {
  digitalWrite(signals[idx].g, state == "GREEN" ? HIGH : LOW);
  digitalWrite(signals[idx].y, state == "YELLOW" ? HIGH : LOW);
  digitalWrite(signals[idx].r, state == "RED" ? HIGH : LOW);
}

void beepBuzzer() {
  for (int i = 0; i < 5; i++) {
    digitalWrite(BUZZER_PIN, HIGH);
    delay(200);
    digitalWrite(BUZZER_PIN, LOW);
    delay(200);
  }
}

String getSignalState(int idx) {
  if (emergencyMode) {
    return (idx == emergencyIndex) ? "GREEN" : "RED";
  }

  uint32_t elapsedSec = (millis() - cycleStartMs) / 1000;
  uint32_t t = elapsedSec % TOTAL_CYCLE_SEC;
  int activeIdx = t / SLOT_SEC;
  uint32_t inSlot = t % SLOT_SEC;

  if (idx == activeIdx) {
    return (inSlot < GREEN_TIME_SEC) ? "GREEN" : "YELLOW";
  }
  return "RED";
}

void applyAllLEDs() {
  for (int i = 0; i < SIGNAL_COUNT; i++) {
    setOneSignalLED(i, getSignalState(i));
  }
}

void publishToCloud() {
  String nowStates[SIGNAL_COUNT];
  bool changed = forcePublish;

  for (int i = 0; i < SIGNAL_COUNT; i++) {
    nowStates[i] = getSignalState(i);
    if (nowStates[i] != lastPublishedStates[i]) changed = true;
  }
  
  if (!changed) return;
  forcePublish = false;

  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(CLOUD_URL);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", String("Bearer ") + CLOUD_BEARER);

    // Build JSON with ONLY my signals
    StaticJsonDocument<512> doc;
    for (int i = 0; i < SIGNAL_COUNT; i++) {
      doc[signals[i].id] = nowStates[i];
    }

    String body;
    serializeJson(doc, body);
    int code = http.POST(body);
    
    Serial.println("========================================");
    Serial.println("[INT-2 PUBLISH]");
    Serial.print("HTTP Code: ");
    Serial.println(code);
    Serial.print("Payload: ");
    Serial.println(body);
    Serial.println("========================================");
    
    http.end();
  }

  for (int i = 0; i < SIGNAL_COUNT; i++) lastPublishedStates[i] = nowStates[i];
}

void handleEmergency() {
  addCorsHeaders();

  String signalId = server.arg("signal");
  Serial.print("[Emergency] ");
  Serial.println(signalId);

  int idx = indexBySignalId(signalId);
  if (idx < 0) {
    server.send(400, "application/json", "{\"ok\":false}");
    return;
  }

  emergencyMode = true;
  emergencyIndex = idx;
  emergencyStartMs = millis();
  beepBuzzer();
  forcePublish = true;

  applyAllLEDs();
  publishToCloud();

  server.send(200, "application/json", "{\"ok\":true}");
  Serial.println("[Emergency] ACTIVATED");
}

void handleNormal() {
  addCorsHeaders();
  Serial.println("[Normal] Restoring...");

  emergencyMode = false;
  emergencyIndex = -1;
  cycleStartMs = millis();
  forcePublish = true;

  applyAllLEDs();
  publishToCloud();

  server.send(200, "application/json", "{\"ok\":true}");
  Serial.println("[Normal] RESTORED");
}

void handleStatus() {
  addCorsHeaders();
  StaticJsonDocument<512> doc;
  doc["emergency"] = emergencyMode;
  doc["ip"] = WiFi.localIP().toString();
  JsonObject sigs = doc.createNestedObject("signals");
  for (int i = 0; i < SIGNAL_COUNT; i++) {
    sigs[signals[i].id] = getSignalState(i);
  }
  String out;
  serializeJson(doc, out);
  server.send(200, "application/json", out);
}

void setupPins() {
  for (int i = 0; i < SIGNAL_COUNT; i++) {
    pinMode(signals[i].g, OUTPUT);
    pinMode(signals[i].y, OUTPUT);
    pinMode(signals[i].r, OUTPUT);
    setOneSignalLED(i, "RED");
  }
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
}

void setupWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("WiFi connecting");
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("=== IP ADDRESS: ");
  Serial.print(WiFi.localIP());
  Serial.println(" ===");
}

void setup() {
  Serial.begin(115200);
  setupPins();
  setupWiFi();

  cycleStartMs = millis();
  for (int i = 0; i < SIGNAL_COUNT; i++) lastPublishedStates[i] = "";

  server.on("/emergency", HTTP_POST, handleEmergency);
  server.on("/emergency", HTTP_GET, handleEmergency);
  server.on("/normal", HTTP_POST, handleNormal);
  server.on("/normal", HTTP_GET, handleNormal);
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/emergency", HTTP_OPTIONS, handleOptions);
  server.on("/normal", HTTP_OPTIONS, handleOptions);
  server.on("/status", HTTP_OPTIONS, handleOptions);
  
  server.begin();
  Serial.println("INT-2 ISOLATED MODE - Ready");
  Serial.println("This ESP32 ONLY controls SIG-201 to SIG-204");
}

void loop() {
  server.handleClient();

  // Emergency timeout
  if (emergencyMode && (millis() - emergencyStartMs > EMERGENCY_TIMEOUT)) {
    Serial.println("[Emergency] TIMEOUT");
    emergencyMode = false;
    emergencyIndex = -1;
    cycleStartMs = millis();
    forcePublish = true;
  }

  applyAllLEDs();
  publishToCloud();
}
