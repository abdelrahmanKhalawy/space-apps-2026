using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SpaceApi.Readings;

namespace SpaceApi.Insights;

// i4, now live: fits the trend line (ForecastModel) on whatever a crew has actually
// logged, from the day its own anomaly started. Falls back to the precomputed file
// (data/precomputed/forecast.json) only if the live computation throws.
public static class ForecastEndpoints
{
    public static void MapForecast(this WebApplication app)
    {
        var fallbackPath = Path.Combine(AppContext.BaseDirectory, "SeedData", "forecast.json");
        var fallback = File.Exists(fallbackPath)
            ? JsonSerializer.Deserialize<List<JsonElement>>(File.ReadAllBytes(fallbackPath)) ?? []
            : [];
        if (fallback.Count == 0)
            app.Logger.LogWarning("No forecast.json fallback at {Path}.", fallbackPath);

        app.MapGet("/api/forecast", async (string? crewId, string? metric, AppDb db, Thresholds th, ILogger<Program> log) =>
        {
            var crew = string.IsNullOrWhiteSpace(crewId) ? "crew-1" : crewId;
            try
            {
                var readings = await db.Readings.AsNoTracking().Where(r => r.CrewId == crew).ToListAsync();
                var (_, anomalies) = AnomalyModel.Analyze(readings, th);
                var daily = AnomalyModel.DailyMeansByMetric(readings);

                var items = new List<object>();
                foreach (var a in anomalies)
                {
                    if (!daily.TryGetValue(a.Metric, out var series)) continue;
                    var f = ForecastModel.ForecastOne(a.Metric, series, th.For(a.Metric), since: a.Since);
                    if (f is not null) items.Add(new { metric = f.Metric, daysToRed = f.DaysToRed, confidence = f.Confidence });
                }

                return Results.Ok(metric is null ? items : items.Where(i => MetricOf(i) == metric));
            }
            catch (Exception e)
            {
                log.LogError(e, "Live /api/forecast failed for '{Crew}'; serving the precomputed fallback instead.", crew);
                var items = metric is null ? fallback : fallback.Where(i => i.GetProperty("metric").GetString() == metric);
                return Results.Ok(items);
            }
        });
    }

    static string? MetricOf(object o) => o.GetType().GetProperty("metric")?.GetValue(o) as string;
}
