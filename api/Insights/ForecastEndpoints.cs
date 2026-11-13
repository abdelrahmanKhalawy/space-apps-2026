using System.Text.Json;

namespace SpaceApi.Insights;

// Serves the precomputed trend forecast (i4, data/precomputed/forecast.json).
// Same demo-safe pattern as /api/explain: the AI service's own POST /forecast
// isn't built yet, so the server reads the file ai/precompute.py already verified.
public static class ForecastEndpoints
{
    public static void MapForecast(this WebApplication app)
    {
        var path = Path.Combine(AppContext.BaseDirectory, "SeedData", "forecast.json");
        var all = File.Exists(path)
            ? JsonSerializer.Deserialize<List<JsonElement>>(File.ReadAllText(path)) ?? []
            : [];

        if (all.Count == 0)
            app.Logger.LogWarning("No forecast.json at {Path}. GET /api/forecast will return an empty list.", path);

        app.MapGet("/api/forecast", (string? crewId, string? metric) =>
        {
            var items = metric is null
                ? all
                : all.Where(e => e.GetProperty("metric").GetString() == metric).ToList();
            return Results.Ok(items);
        });
    }
}
