using System.Text.Json;

namespace SpaceApi.Insights;

// Serves the precomputed anomaly explanations (i3, data/precomputed/explain.json).
// The AI service's own POST /explain (ai/service/main.py) is untested — see its README
// warning — so the server reads the file ai/precompute.py already verified instead,
// the same demo-safe pattern i2 used for /analyze.
public static class ExplainEndpoints
{
    public static void MapExplain(this WebApplication app)
    {
        var path = Path.Combine(AppContext.BaseDirectory, "SeedData", "explain.json");
        var all = File.Exists(path)
            ? JsonSerializer.Deserialize<List<JsonElement>>(File.ReadAllText(path)) ?? []
            : [];

        if (all.Count == 0)
            app.Logger.LogWarning("No explain.json at {Path}. GET /api/explain will return an empty list.", path);

        // crewId is accepted for symmetry with the other endpoints; the precomputed
        // scenario only ever covers crew-1, so it's not used to filter yet.
        app.MapGet("/api/explain", (string? crewId, string? metric) =>
        {
            var items = metric is null
                ? all
                : all.Where(e => e.GetProperty("metric").GetString() == metric).ToList();
            return Results.Ok(items);
        });
    }
}
