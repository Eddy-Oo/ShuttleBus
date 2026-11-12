# ESP32 GPS to ShuttleTrack Backend

This firmware example sends GPS readings from an ESP32 + UART GPS module to the ShuttleTrack Render API over Wi-Fi. The ESP32 does not connect directly to Neon; the backend writes readings to PostgreSQL.

## 1. Hardware

- GPS module TX -> ESP32 GPIO 16 (UART2 RX)
- GPS module RX -> ESP32 GPIO 17 (UART2 TX), if the module needs configuration
- GPS GND -> ESP32 GND
- GPS power -> use the voltage specified by the GPS module
- Power the ESP32 from USB or a suitable power bank after uploading

## 2. Arduino IDE libraries

Install these libraries using Library Manager:

- TinyGPSPlus
- ArduinoJson

Select your ESP32 board and the correct USB port. Upload the sketch once. After upload, the ESP32 can run from a power bank and does not need to remain connected to the laptop.

## 3. Configure the sketch

Replace the Wi-Fi name/password, vehicle ID, and one-time device token. Generate/rotate the vehicle device token from the ShuttleTrack Admin Dashboard. The vehicle must be active.

The device token is a secret. Do not commit real Wi-Fi credentials or real device tokens to GitHub. Keep them in a private local copy of the sketch.

## 4. API flow

1. POST `/api/auth/vehicle/login` with `vehicleId` and `deviceToken`.
2. The API returns a short-lived vehicle JWT in `data.token`.
3. POST GPS updates to `/api/vehicle/location` with `Authorization: Bearer <JWT>`.
4. The backend validates the vehicle, saves the reading to `VehicleLocation`, updates the vehicle's latest coordinates, and broadcasts `vehicle:location:update` to connected web clients.

Location payload:
```json
{
  "vehicleId": "YOUR_VEHICLE_ID",
  "latitude": 13.7563,
  "longitude": 100.5018,
  "speed": 12.5,
  "recordedAt": "2026-11-10T05:00:00.000Z"
}
```

The API accepts optional `heading` and `tripId` fields too. If `tripId` is omitted, the backend associates the update with the vehicle's active trip, if one exists.

## 5. Important notes

- This endpoint uses the existing `VehicleLocation` table and the same live map event as the mobile sender.
- The current database model does not yet store a GPS source label (ESP32 vs Mobile vs LoRaWAN). A separate source-aware reading model/migration is still required before the three-source comparison feature can be implemented accurately.
- The sample below uses `setInsecure()` to simplify HTTPS testing. For production, replace it with Render's trusted root CA certificate using `client.setCACert(...)`.
- GPS must have a valid fix. Test outdoors with the antenna facing the sky.
- The firmware retries login after an expired/invalid session. Do not print the device token or JWT to Serial Monitor.

## 6. Example firmware

```cpp
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <TinyGPSPlus.h>

HardwareSerial GPS(2);
TinyGPSPlus gps;

const char* WIFI_NAME = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

const char* API_BASE = "https://shuttletrack-api-f0sv.onrender.com";
const char* VEHICLE_ID = "YOUR_VEHICLE_ID";
const char* DEVICE_TOKEN = "YOUR_ONE_TIME_DEVICE_TOKEN";

String vehicleJwt;
unsigned long lastSend = 0;
const unsigned long SEND_INTERVAL_MS = 3000;

WiFiClientSecure secureClient;

bool loginVehicle() {
  HTTPClient http;
  String url = String(API_BASE) + "/api/auth/vehicle/login";

  http.begin(secureClient, url);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<256> request;
  request["vehicleId"] = VEHICLE_ID;
  request["deviceToken"] = DEVICE_TOKEN;

  String body;
  serializeJson(request, body);
  int status = http.POST(body);
  String response = http.getString();
  http.end();

  if (status < 200 || status >= 300) {
    Serial.printf("Vehicle login failed: HTTP %d\n", status);
    return false;
  }

  StaticJsonDocument<1024> result;
  DeserializationError error = deserializeJson(result, response);
  if (error || !result["success"].as<bool>()) {
    Serial.println("Could not read login response");
    return false;
  }

  vehicleJwt = result["data"]["token"].as<String>();
  return vehicleJwt.length() > 0;
}

bool sendLocation(double latitude, double longitude, double speedKmh) {
  if (vehicleJwt.length() == 0 && !loginVehicle()) return false;

  HTTPClient http;
  String url = String(API_BASE) + "/api/vehicle/location";
  http.begin(secureClient, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", "Bearer " + vehicleJwt);

  StaticJsonDocument<256> request;
  request["vehicleId"] = VEHICLE_ID;
  request["latitude"] = latitude;
  request["longitude"] = longitude;
  request["speed"] = speedKmh;
  request["recordedAt"] = ""; // omit this field; backend timestamps receipt

  request.remove("recordedAt");

  String body;
  serializeJson(request, body);
  int status = http.POST(body);
  String response = http.getString();
  http.end();

  if (status == 401 || status == 403) {
    vehicleJwt = "";
    Serial.println("Vehicle session rejected; will log in again");
    return false;
  }

  if (status < 200 || status >= 300) {
    Serial.printf("GPS upload failed: HTTP %d\n", status);
    Serial.println(response);
    return false;
  }

  Serial.println("GPS uploaded to ShuttleTrack");
  return true;
}

void setup() {
  Serial.begin(115200);
  GPS.begin(9600, SERIAL_8N1, 16, 17);

  // Demo/testing only. For production, install Render's trusted CA certificate.
  secureClient.setInsecure();

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_NAME, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("Wi-Fi connected. IP: ");
  Serial.println(WiFi.localIP());

  if (loginVehicle()) Serial.println("Vehicle authenticated with backend");
  else Serial.println("Vehicle login will be retried when GPS is ready");
}

void loop() {
  while (GPS.available()) {
    gps.encode(GPS.read());
  }

  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    delay(100);
    return;
  }

  if (millis() - lastSend >= SEND_INTERVAL_MS) {
    lastSend = millis();

    if (gps.location.isValid() && gps.location.age() < 5000) {
      double latitude = gps.location.lat();
      double longitude = gps.location.lng();
      double speedKmh = gps.speed.isValid() ? gps.speed.kmph() : 0.0;

      Serial.printf("GPS: %.6f, %.6f | %.1f km/h\n", latitude, longitude, speedKmh);
      sendLocation(latitude, longitude, speedKmh);
    } else {
      Serial.println("Waiting for a fresh GPS fix...");
    }
  }
}
```
