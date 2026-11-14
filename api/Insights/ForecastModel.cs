using SpaceApi.Readings;

namespace SpaceApi.Insights;

// Port of ai/forecast.py: a straight line through the declining stretch,
// extrapolated to the nearest red boundary. None (not a wrong number) when the
// metric isn't trending toward red — the brief is explicit about that.
public record ForecastResult(string Metric, double DaysToRed, string Confidence);

public static class ForecastModel
{
    const int WindowDays = 7;
    const int MaxDays = 60;

    public static ForecastResult? ForecastOne(
        string metric, List<(DateTime Day, double Value)> daily, MetricThreshold? rules,
        DateTime? since = null, DateTime? asOf = null)
    {
        if (rules is null) return null;

        var ordered = daily.OrderBy(d => d.Day).AsEnumerable();
        if (asOf is not null) ordered = ordered.Where(d => d.Day <= asOf.Value);
        var all = ordered.ToList();

        var days = since is not null ? all.Where(d => d.Day >= since.Value).ToList() : all.TakeLast(WindowDays).ToList();
        if (days.Count < 3) return null; // not enough history for a trend line to mean anything

        var xs = Enumerable.Range(0, days.Count).Select(i => (double)i).ToList();
        var ys = days.Select(d => d.Value).ToList();
        var (slope, r2) = FitLine(xs, ys);
        if (Math.Abs(slope) < 1e-9) return null; // flat — nothing to forecast

        var current = ys[^1];
        var boundary = NearestRedBoundary(rules.Bands, current, slope);
        if (boundary is null) return null; // already as bad as it gets, or moving the safe way

        var daysToRed = (boundary.Value - current) / slope;
        if (daysToRed <= 0 || daysToRed > MaxDays) return null; // already past it, or too far out to call

        return new ForecastResult(metric, Math.Round(daysToRed, 1), Confidence(r2, days.Count));
    }

    static (double Slope, double R2) FitLine(List<double> xs, List<double> ys)
    {
        var mx = xs.Average();
        var my = ys.Average();
        var sxx = xs.Sum(x => (x - mx) * (x - mx));
        var sxy = xs.Zip(ys, (x, y) => (x - mx) * (y - my)).Sum();
        var slope = sxx == 0 ? 0 : sxy / sxx;
        var intercept = my - slope * mx;
        var ssTot = ys.Sum(y => (y - my) * (y - my));
        var ssRes = xs.Zip(ys, (x, y) => (y - (slope * x + intercept)) * (y - (slope * x + intercept))).Sum();
        var r2 = ssTot == 0 ? 1.0 : 1 - ssRes / ssTot;
        return (slope, r2);
    }

    static double? NearestRedBoundary(List<Band> bands, double current, double slope)
    {
        var up = slope > 0;
        var candidates = new List<double>();
        foreach (var b in bands)
        {
            if (b.Color != "red") continue;
            if (up && b.Min is not null && b.Min >= current) candidates.Add(b.Min.Value);
            if (!up && b.Max is not null && b.Max <= current) candidates.Add(b.Max.Value);
        }
        if (candidates.Count == 0) return null;
        return up ? candidates.Min() : candidates.Max();
    }

    static string Confidence(double r2, int n)
    {
        if (n < 4) return "low";
        if (r2 >= 0.8) return "high";
        if (r2 >= 0.5) return "medium";
        return "low";
    }
}
