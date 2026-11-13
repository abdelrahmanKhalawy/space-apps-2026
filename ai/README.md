# الذكاء الاصطناعي

الموديل اللي بيتعلم الطبيعي، وخدمته، وشرح السبب، والتوقع، والمساعد.

صاحبه: شهد أشرف ومحمد. (موديل i1 اتعمل مكان شهد أشرف يوم الجمعة، لازم تراجعه لما ترجع.)

## اقرا قبل ما تبدأ

```
contracts/ai.md
```

## تشغيل محلي

```bash
pip install matplotlib
python ai/baseline.py                 # يطبع نتيجة /analyze على data/mock/day143.json
python ai/plot_baseline.py            # يرسم ai/notebooks/baseline.png
```

النوت بوك `ai/notebooks/baseline.ipynb` بينادي نفس الكود.

## المهام اللي بتسلّم هنا

- [موديل الطبيعي بتاعك](../tasks/1-v1-deliverable/i1-baseline-model.md) · شهد أشرف
- [الموديل كخدمة](../tasks/2-v2-space/i2-model-service.md) · شهد أشرف
- [شرح السبب الفضائي](../tasks/2-v2-space/i3-explain-cause.md) · محمد
- [توقع الاتجاه](../tasks/3-v3-wow/i4-trend-forecast.md) · شهد أشرف
- [المساعد الطبي](../tasks/3-v3-wow/i5-medical-assistant.md) · محمد
