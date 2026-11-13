using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace SpaceApi.Readings;

public static class ReadingEndpoints
{
    public static void MapReadings(this WebApplication app)
    {
        // Accepts one reading or an array. All-or-nothing: if any is bad, nothing is saved.
        app.MapPost("/api/readings", async (JsonElement body, AppDb db) =>
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
            return Results.Created("/api/readings", readings.Select(Shape));
        });

        app.MapGet("/api/readings", async (string? crewId, string? metric, string? from, string? to, AppDb db) =>
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
            return Results.Ok(rows.Select(Shape));
        });
    }

    // The shape callers see. a2 adds color and advice here.
    static object Shape(Reading r) => new
    {
        r.Id, r.CrewId, r.Metric, r.Value, r.Unit,
        TakenAt = r.TakenAt.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture),
        r.Source,
    };
}
