using SpaceApi.Readings;

namespace SpaceApi.Insights;

// Port of ai/baseline.py + ai/colorize.py: week-1 mean/std per metric, then a
// 2-day sustained z-score to flag a real drift in week 2+. Lets the server compute
// this live, from whatever a crew has actually logged, instead of only ever
// replaying the precomputed day143 story (contracts/ai.md's /analyze).
public record BaselineStat(double Mean, double Std);

public record Anomaly(string Metric, DateTime Since, string Direction, double Score, bool? ColorStillGreen);

public static class AnomalyModel
{
    const double ZThreshold = 1.3;
    const int SustainedDays = 2;
    const int BaselineDays = 7;

    public static Dictionary<string, List<(DateTime Day, double Value)>> DailyMeansByMetric(IEnumerable<Reading> readings)
    {
        var byMetric = new Dictionary<string, Dictionary<DateTime, List<double>>>();
        foreach (var r in readings)
        {
            var day = r.TakenAt.Date;
            if (!byMetric.TryGetValue(r.Metric, out var byDay)) byMetric[r.Metric] = byDay = [];
            if (!byDay.TryGetValue(day, out var list)) byDay[day] = list = [];
            list.Add(r.Value);
        }
        return byMetric.ToDictionary(
            kv => kv.Key,
            kv => kv.Value.OrderBy(d => d.Key).Select(d => (d.Key, d.Value.Average())).ToList());
    }

    public static (Dictionary<string, BaselineStat> Baseline, List<Anomaly> Anomalies) Analyze(
        List<Reading> readings, Thresholds thresholds)
    {
        var baseline = new Dictionary<string, BaselineStat>();
        var anomalies = new List<Anomaly>();

        foreach (var (metric, daily) in DailyMeansByMetric(readings))
        {
            if (daily.Count < BaselineDays + SustainedDays) continue; // not enough history for a trend yet

            var baseValues = daily.Take(BaselineDays).Select(d => d.Value).ToList();
            var mean = baseValues.Average();
            var variance = baseValues.Sum(v => (v - mean) * (v - mean)) / baseValues.Count;
            var std = Math.Sqrt(variance);
            if (std == 0) std = 0.05; // a silent metric still gets a tiny, non-zero std

            baseline[metric] = new BaselineStat(Math.Round(mean, 2), Math.Round(std, 2));

            var checkDays = daily.Skip(BaselineDays).ToList();
            var zByDay = checkDays.ToDictionary(d => d.Day, d => (d.Value - mean) / std);

            for (var i = 0; i <= checkDays.Count - SustainedDays; i++)
            {
                var window = checkDays.Skip(i).Take(SustainedDays).ToList();
                var zs = window.Select(d => zByDay[d.Day]).ToList();
                var allUp = zs.All(z => z >= ZThreshold);
                var allDown = zs.All(z => z <= -ZThreshold);
                if (!allUp && !allDown) continue;

                var since = window[0].Day;
                var direction = allUp ? "up" : "down";
                var peak = zByDay.Values.Where(z => (z > 0) == allUp).Select(Math.Abs).DefaultIfEmpty(0).Max();
                var color = thresholds.ColorOf(metric, daily.First(d => d.Day == since).Value);
                var colorStillGreen = color is null ? (bool?)null : color == "green";

                anomalies.Add(new Anomaly(metric, since, direction, Math.Round(peak, 2), colorStillGreen));
                break; // first qualifying run only, same as the Python model
            }
        }

        return (baseline, anomalies);
    }
}
