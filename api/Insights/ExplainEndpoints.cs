using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SpaceApi.Readings;

namespace SpaceApi.Insights;

// i3, now live: runs the baseline model (AnomalyModel) against whatever a crew has
// actually logged, then explains each real anomaly from research/explanations.json.
// Falls back to the precomputed file (data/precomputed/explain.json, i3's original
// demo-safe path) only if the live computation itself throws — a genuinely empty
// result (not enough history yet, or nothing wrong) is not an error and is returned as-is.
public static class ExplainEndpoints
{
    public static void MapExplain(this WebApplication app)
    {
        var fallbackPath = Path.Combine(AppContext.BaseDirectory, "SeedData", "explain.json");
        var fallback = File.Exists(fallbackPath)
            ? JsonSerializer.Deserialize<List<JsonElement>>(File.ReadAllBytes(fallbackPath)) ?? []
            : [];
        if (fallback.Count == 0)
            app.Logger.LogWarning("No explain.json fallback at {Path}.", fallbackPath);

        app.MapGet("/api/explain", async (string? crewId, string? metric, AppDb db, Thresholds th, Explanations ex, ILogger<Program> log) =>
        {
            var crew = string.IsNullOrWhiteSpace(crewId) ? "crew-1" : crewId;
            try
            {
                var readings = await db.Readings.AsNoTracking().Where(r => r.CrewId == crew).ToListAsync();
                var (_, anomalies) = AnomalyModel.Analyze(readings, th);
                var items = ex.ExplainAll(anomalies);
                return Results.Ok(Filter(items, metric));
            }
            catch (Exception e)
            {
                log.LogError(e, "Live /api/explain failed for '{Crew}'; serving the precomputed fallback instead.", crew);
                return Results.Ok(Filter(fallback, metric));
            }
        });
    }

    static IEnumerable<object> Filter(List<object> items, string? metric) =>
        metric is null ? items : items.Where(i => MetricOf(i) == metric);

    static IEnumerable<JsonElement> Filter(List<JsonElement> items, string? metric) =>
        metric is null ? items : items.Where(i => i.GetProperty("metric").GetString() == metric);

    static string? MetricOf(object o) => o.GetType().GetProperty("metric")?.GetValue(o) as string;
}
