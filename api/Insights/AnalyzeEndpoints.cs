using System.Globalization;
using Microsoft.EntityFrameworkCore;
using SpaceApi.Readings;

namespace SpaceApi.Insights;

// contracts/ai.md's POST /analyze, as a live GET the server itself can answer —
// the raw baseline + anomalies AnomalyModel computes, with the shape /explain's
// "Model flagged this" and /forecast's "red in N days" panels are both built from.
// Mostly for transparency/debugging: the dashboard gets this already via /api/explain
// and /api/forecast, which call the same model.
public static class AnalyzeEndpoints
{
    public static void MapAnalyze(this WebApplication app)
    {
        app.MapGet("/api/analyze", async (string? crewId, AppDb db, Thresholds th) =>
        {
            var crew = string.IsNullOrWhiteSpace(crewId) ? "crew-1" : crewId;
            var readings = await db.Readings.AsNoTracking().Where(r => r.CrewId == crew).ToListAsync();
            var (baseline, anomalies) = AnomalyModel.Analyze(readings, th);

            return Results.Ok(new
            {
                crewId = crew,
                baseline = baseline.ToDictionary(kv => kv.Key, kv => new { mean = kv.Value.Mean, std = kv.Value.Std }),
                anomalies = anomalies.Select(a => new
                {
                    metric = a.Metric,
                    since = a.Since.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture),
                    direction = a.Direction,
                    score = a.Score,
                    colorStillGreen = a.ColorStillGreen,
                }),
            });
        });
    }
}
