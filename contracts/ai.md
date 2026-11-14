# عقد خدمة الذكاء الاصطناعي

> الحالة: مسودة مقترحة. شهد أشرف تثبّتها في مهمة "الموديل كخدمة".

السيرفر هو الوحيد اللي بيكلّم الخدمة دي. الشاشات مبتكلمهاش مباشرة.

---

## اكتشاف الانحراف

```
POST /analyze
```

بياخد قراءات رائد فضاء واحد:

```json
{
  "crewId": "crew-1",
  "readings": [ "...قراءات بنفس شكل العقد..." ]
}
```

بيرجّع الطبيعي بتاعه، وأي انحراف عنه:

```json
{
  "crewId": "crew-1",
  "baseline": {
    "heart_rate": { "mean": 64, "std": 4 },
    "sleep_hours": { "mean": 7.2, "std": 0.6 }
  },
  "anomalies": [
    {
      "metric": "sleep_hours",
      "since": "2026-11-08T00:00:00Z",
      "direction": "down",
      "score": 2.7,
      "colorStillGreen": true
    }
  ]
}
```

`colorStillGreen` مهم في الديمو: معناه إن الموديل شاف المشكلة قبل ما الحدود الثابتة تشوفها.

---

## شرح السبب

```
POST /explain
```

بياخد الانحراف، وبيرجّع الخطر الفضائي والشرح:

```json
{
  "metric": "sleep_hours",
  "hazard": "isolation",
  "explanation": "...",
  "steps": ["...", "..."],
  "sources": [{ "title": "...", "url": "https://..." }]
}
```

---

## توقع الاتجاه

```
POST /forecast
```

```json
{
  "metric": "sleep_hours",
  "daysToRed": 3,
  "confidence": "medium"
}
```

---

## النتايج الجاهزة

لو الخدمة وقعت أو اتأخرت، السيرفر بيرجع لملفات محسوبة مسبقًا لسيناريو اليوم 143، بنفس الأشكال اللي فوق بالظبط:

```
data/precomputed/analyze.json
data/precomputed/explain.json
data/precomputed/forecast.json
```

الديمو لازم يشتغل كامل حتى لو الخدمة مش شغالة خالص.
