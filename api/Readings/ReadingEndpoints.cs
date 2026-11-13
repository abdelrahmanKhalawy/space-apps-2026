using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace SpaceApi.Readings;

public static class ReadingEndpoints
{
    public static void MapReadings(this WebApplication app)
    {
        // Accepts one reading or an array. All-or-nothing: if any is bad, nothing is saved.
        app.MapPost("/api/readings", async (JsonElement body, AppDb db, Thresholds th) =>
        {
            var items = body.ValueKind == JsonValueKind.Array
                ? body.EnumerateArray().ToList()
                : [body];

            if (items.Count == 0)
                return Results.BadRequest(new { error = "Send at least one reading.", errors = Array.Empty<object>() });

            var problems = new List<ReadingRules.Problem>();
            var readings = new List<Reading>();
            for (var i = 0; i < items.Count; i++)
            {
                var r = ReadingRules.Parse(items[i], i, problems);
                if (r is not null) readings.Add(r);
            }

            if (problems.Count > 0)
                return Results.BadRequest(new { error = "Some readings are invalid. Nothing was saved.", errors = problems });

            db.Readings.AddRange(readings);
            await db.SaveChangesAsync();
            return Results.Created("/api/readings", readings.Select(r => Shape(r, th)));
        });

        app.MapGet("/api/readings", async (string? crewId, string? metric, string? from, string? to, AppDb db, Thresholds th) =>
        {
            DateTime fromT = default, toT = default;
            if ((from is not null && !ReadingRules.TryUtc(from, out fromT)) ||
                (to is not null && !ReadingRules.TryUtc(to, out toT)))
                return Results.BadRequest(new { error = "'from' and 'to' must be UTC times ending with Z, e.g. 2026-11-13T10:15:00Z." });
            if (metric is not null && !ReadingRules.UnitByMetric.ContainsKey(metric))
                return Results.BadRequest(new { error = $"Unknown metric '{metric}'." });

            var q = db.Readings.AsNoTracking().AsQueryable();
            if (crewId is not null) q = q.Where(r => r.CrewId == crewId);
            if (metric is not null) q = q.Where(r => r.Metric == metric);
            if (from is not null) q = q.Where(r => r.TakenAt >= fromT);
            if (to is not null) q = q.Where(r => r.TakenAt <= toT);

            var rows = await q.OrderBy(r => r.TakenAt).ThenBy(r => r.Id).ToListAsync();
            return Results.Ok(rows.Select(r => Shape(r, th)));
        });

        // Latest reading per metric, with its color, advice and hazard. overall = the worst color.
        app.MapGet("/api/status", async (string? crewId, AppDb db, Thresholds th) =>
        {
            if (string.IsNullOrWhiteSpace(crewId))
                return Results.BadRequest(new { error = "'crewId' is required, e.g. /api/status?crewId=crew-1." });

            var metrics = new List<object>();
            var colors = new List<string?>();
            foreach (var metric in ReadingRules.UnitByMetric.Keys)
            {
                var r = await db.Readings.AsNoTracking()
                    .Where(x => x.CrewId == crewId && x.Metric == metric)
                    .OrderByDescending(x => x.TakenAt).ThenByDescending(x => x.Id)
                    .FirstOrDefaultAsync();
                if (r is null) continue;

                var color = th.ColorOf(metric, r.Value);
                var t = th.For(metric);
                colors.Add(color);
                metrics.Add(new
                {
                    metric,
                    r.Value,
                    color,
                    TakenAt = Time(r.TakenAt),
                    Advice = color is not null && t is not null ? t.Advice.GetValueOrDefault(color) : null,
                    Hazard = t?.Hazard,
                });
            }

            return Results.Ok(new { crewId, overall = Thresholds.Worst(colors), metrics });
        });
    }

    static string Time(DateTime t) => t.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);

    // The shape callers see.
    static object Shape(Reading r, Thresholds th) => new
    {
        r.Id, r.CrewId, r.Metric, r.Value, r.Unit,
        TakenAt = Time(r.TakenAt),
        r.Source,
        Color = th.ColorOf(r.Metric, r.Value),
    };
}
