// WifiSender.h — sends readings from the device to the server over Wi-Fi.
//
// !! Written without a board in front of the author: NOT compiled and NOT run on a device. !!
// Written for an ESP32 (Arduino core). On another board (ESP8266, Arduino with a Wi-Fi shield) the
// includes below change. Try the cable way (firmware/serial-bridge/) first if time is short.
//
// How to use, from your own sketch:
//
//   #include "WifiSender.h"
//
//   void setup() {
//     Serial.begin(115200);
//     wifiConnect();            // Wi-Fi (the university network or the phone hotspot, see secrets.h)
//   }
//
//   void loop() {
//     // ... read the sensors here ...
//     Reading batch[] = {
//       {"heart_rate", heartRate, "bpm"},
//       {"spo2", spo2, "%"},
//       {"temperature", skinTemp, "C"},
//     };
//     printReadingLines(batch, 3);  // the same lines go to the Serial port, for the cable way
//     sendReadings(batch, 3);       // and to the server
//     delay(2000);
//   }
//
// Leave a value out (do not send it) when the sensor has no finger on it. NaN values are skipped here too.

#pragma once

#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <math.h>
#include <time.h>

#include "secrets.h"  // WIFI_SSID, WIFI_PASSWORD, SERVER_URL. Copy secrets.example.h and fill it in.

#ifndef CREW_ID
#define CREW_ID "crew-1"
#endif

struct Reading {
  const char* metric;  // "heart_rate", "spo2" or "temperature" (see contracts/reading.md)
  float value;
  const char* unit;  // "bpm", "%" or "C"
};

// Joins the Wi-Fi in secrets.h and syncs the clock (the server wants UTC times). Returns false if either fails.
inline bool wifiConnect(unsigned long timeoutMs = 15000) {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long started = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - started > timeoutMs) {
      Serial.println("wifi: could not connect (wrong name or password? a 5 GHz hotspot? ESP32 only uses 2.4 GHz)");
      return false;
    }
    delay(250);
  }
  Serial.print("wifi: connected, IP ");
  Serial.println(WiFi.localIP());

  configTime(0, 0, "pool.ntp.org", "time.google.com");  // UTC
  started = millis();
  time_t now = time(nullptr);
  while (now < 1700000000) {  // not synced until it is after Nov 2023
    if (millis() - started > timeoutMs) {
      Serial.println("wifi: connected, but the clock did not sync (readings will get the server's idea of now)");
      return false;
    }
    delay(250);
    now = time(nullptr);
  }
  return true;
}

// "2026-11-13T21:15:00Z", or "" if the clock is not synced.
inline String utcNow() {
  time_t now = time(nullptr);
  if (now < 1700000000) return "";
  struct tm t;
  gmtime_r(&now, &t);
  char text[25];
  strftime(text, sizeof(text), "%Y-%m-%dT%H:%M:%SZ", &t);
  return String(text);
}

inline String readingJson(const Reading& r, const String& takenAt, bool withCrew) {
  String json = "{";
  if (withCrew) json += "\"crewId\":\"" CREW_ID "\",";
  json += "\"metric\":\"" + String(r.metric) + "\",\"value\":" + String(r.value, 1);
  json += ",\"unit\":\"" + String(r.unit) + "\"";
  if (takenAt.length() > 0) json += ",\"takenAt\":\"" + takenAt + "\"";
  if (withCrew) json += ",\"source\":\"device\"";
  json += "}";
  return json;
}

// One line per reading on the Serial port, for the cable way (firmware/serial-bridge/bridge.py).
inline void printReadingLines(const Reading* items, size_t count) {
  String now = utcNow();
  for (size_t i = 0; i < count; i++) {
    if (isnan(items[i].value)) continue;
    Serial.println(readingJson(items[i], now, false));
  }
}

// POSTs the readings in one request. Returns true if the server answered 201.
// With no synced clock the readings cannot be sent (the server requires takenAt), so use the cable way then.
inline bool sendReadings(const Reading* items, size_t count) {
  if (WiFi.status() != WL_CONNECTED) return false;
  String now = utcNow();
  if (now.length() == 0) return false;

  String body = "[";
  size_t used = 0;
  for (size_t i = 0; i < count; i++) {
    if (isnan(items[i].value)) continue;
    if (used++ > 0) body += ",";
    body += readingJson(items[i], now, true);
  }
  body += "]";
  if (used == 0) return true;  // nothing to send is not a failure

  String url = String(SERVER_URL) + "/api/readings";
  HTTPClient http;
  WiFiClientSecure secure;
  WiFiClient plain;
  bool ok;
  if (url.startsWith("https://")) {
    secure.setInsecure();  // skips certificate checking: fine for the demo, not for a real product
    ok = http.begin(secure, url);
  } else {
    ok = http.begin(plain, url);
  }
  if (!ok) return false;
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);
  int status = http.POST(body);
  http.end();
  if (status != 201) {
    Serial.print("send: server answered ");
    Serial.println(status);  // negative numbers are connection errors, 400 means a reading was rejected
  }
  return status == 201;
}
