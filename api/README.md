# السيرفر

السيرفر اللي كل الأجزاء بتتكلم معاه، وهو اللي بيعرض الشاشات.

صاحبه: عبدالرحمن.

## اقرا قبل ما تبدأ

```
contracts/api.md
contracts/reading.md
```

## تشغيل محلي

محتاج .NET SDK 8 وNode.

```bash
cd web && npm install && npm run build   # بيبني الشاشات جوه api/wwwroot
cd ../api && dotnet run --urls http://localhost:5080
```

افتح `http://localhost:5080` والصحة على `http://localhost:5080/api/health` (بترد `ok`).

أثناء تطوير الشاشات: `cd web && npm run dev` وهيوصّل نفسه بالسيرفر على 5080.

## النشر على Azure App Service

المرة الأولى (في بوابة Azure، بحساب Azure for Students):

1. Create a resource > Web App.
2. Publish: Code. Runtime stack: .NET 8 (LTS). OS: Linux أو Windows (الاتنين تمام). Region: أقرب واحدة.
3. Pricing plan: F1 Free أو B1.
4. بعد ما يتعمل: Settings > Configuration > General settings > فعّل Web sockets (مطلوب للـ SignalR بعدين).

كل مرة تنشر:

```bash
cd web && npm install && npm run build
cd ../api && dotnet publish -c Release -o publish
cd publish && zip -r ../publish.zip .      # أو Compress-Archive في PowerShell
az login
az webapp deploy --resource-group <RG> --name <APP_NAME> --src-path ../publish.zip --type zip
```

بديل من غير az: في بوابة Azure افتح Advanced Tools (Kudu) > Tools > Zip Push Deploy، واسحب publish.zip.

بعد النشر جرّب:

```
https://<APP_NAME>.azurewebsites.net/
https://<APP_NAME>.azurewebsites.net/api/health
```

> ملاحظة: قاعدة البيانات SQLite هتتحط بعدين (مهمة a1). على Azure لازم يكون مسارها في `/home` عشان تفضل بعد إعادة التشغيل.

## المهام اللي بتسلّم هنا

- [لينك فاضي شغال](../tasks/0-kickoff/k4-empty-deploy.md) · عبدالرحمن
- [السيرفر وحفظ القراءات](../tasks/1-v1-deliverable/a1-readings-api.md) · عبدالرحمن
- [قواعد الألوان](../tasks/1-v1-deliverable/a2-color-rules.md) · عبدالرحمن
- [استقبال القراءات لايف](../tasks/2-v2-space/a5-live-readings.md) · عبدالرحمن
- [شاشة طبيب الأرض](../tasks/2-v2-space/a6-ground-doctor-screen.md) · عبدالرحمن
