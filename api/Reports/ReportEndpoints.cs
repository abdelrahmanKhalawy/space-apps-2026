using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SpaceApi.Readings;

namespace SpaceApi.Reports;

public static class ReportEndpoints
{
    static readonly HashSet<string> Severities = ["green", "yellow", "red"];

    // Older databases (for example the one already on Azure) do not have this table, and EnsureCreated
    // does not add tables to an existing file, so make it here. Safe to run every start.
    public static void EnsureTable(AppDb db) => db.Database.ExecuteSqlRaw("""
        CREATE TABLE IF NOT EXISTS "Reports" (
            "Id" INTEGER NOT NULL CONSTRAINT "PK_Reports" PRIMARY KEY AUTOINCREMENT,
            "CrewId" TEXT NOT NULL,
            "Mission" TEXT NOT NULL,
            "Severity" TEXT NOT NULL,
            "Summary" TEXT NOT NULL,
            "Metrics" TEXT NOT NULL,
            "SentAt" TEXT NOT NULL,
            "DeliverAt" TEXT NOT NULL,
            "ReplyEarliestAt" TEXT NOT NULL
        );
        """);

    public static void MapReports(this WebApplication app)
    {
        // The crew sends a report. The server works out when it reaches Earth and when an answer could be back.
        app.MapPost("/api/reports", async (JsonElement body, AppDb db, DemoClock clock) =>
        {
            var problems = new List<object>();

            string? Text(string name, int max)
            {
                if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty(name, out var p))
                {
                    problems.Add(new { field = name, message = $"'{name}' is required." });
                    return null;
                }
                if (p.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(p.GetString()))
                {
                    problems.Add(new { field = name, message = $"'{name}' must be a non-empty string." });
                    return null;
                }
                var s = p.GetString()!.Trim();
                if (s.Length > max)
                {
                    problems.Add(new { field = name, message = $"'{name}' is too long (max {max} characters)." });
                    return null;
                }
                return s;
            }

            var crewId = Text("crewId", 64);
            var mission = Text("mission", 16);
            var severity = Text("severity", 16);
            var summary = Text("summary", 1000);

            if (mission is not null && !Missions.OneWaySeconds.ContainsKey(mission))
                problems.Add(new { field = "mission", message = $"Unknown mission '{mission}'. Allowed: {string.Join(", ", Missions.OneWaySeconds.Keys)}." });
            if (severity is not null && !Severities.Contains(severity))
                problems.Add(new { field = "severity", message = $"Unknown severity '{severity}'. Allowed: {string.Join(", ", Severities)}." });

            var metrics = new List<string>();
            if (body.ValueKind == JsonValueKind.Object && body.TryGetProperty("metrics", out var m))
            {
                if (m.ValueKind != JsonValueKind.Array)
                    problems.Add(new { field = "metrics", message = "'metrics' must be a list of metric names." });
                else
                    foreach (var item in m.EnumerateArray())
                    {
                        var name = item.ValueKind == JsonValueKind.String ? item.GetString() : null;
                        if (name is null || !ReadingRules.UnitByMetric.ContainsKey(name))
                            problems.Add(new { field = "metrics", message = $"Unknown metric '{item}'. Allowed: {string.Join(", ", ReadingRules.UnitByMetric.Keys)}." });
                        else metrics.Add(name);
                    }
            }
            else if (body.ValueKind == JsonValueKind.Object)
                problems.Add(new { field = "metrics", message = "'metrics' is required (it can be an empty list)." });

            if (problems.Count > 0)
                return Results.BadRequest(new { error = "The report is invalid. Nothing was sent.", errors = problems });

            var oneWay = TimeSpan.FromSeconds(Missions.OneWaySeconds[mission!]);
            var now = clock.UtcNow;
            var report = new Report
            {
                CrewId = crewId!, Mission = mission!, Severity = severity!, Summary = summary!,
                Metrics = string.Join(',', metrics.Distinct()),
                SentAt = now, DeliverAt = now + oneWay, ReplyEarliestAt = now + oneWay + oneWay,
            };
            db.Reports.Add(report);
            await db.SaveChangesAsync();

            return Results.Created($"/api/reports?crewId={Uri.EscapeDataString(report.CrewId)}", new
            {
                id = Id(report),
                sentAt = Time(report.SentAt),
                deliverAt = Time(report.DeliverAt),
                replyEarliestAt = Time(report.ReplyEarliestAt),
            });
        });

        // The ground doctor's list. Reports that already reached Earth come back in full.
        // Reports still on their way come back with only their status and a countdown.
        app.MapGet("/api/reports", async (string? crewId, AppDb db, DemoClock clock) =>
        {
            var now = clock.UtcNow;
            var q = db.Reports.AsNoTracking().AsQueryable();
            if (crewId is not null) q = q.Where(r => r.CrewId == crewId);

            var rows = await q.OrderByDescending(r => r.SentAt).ThenByDescending(r => r.Id).ToListAsync();
            return Results.Ok(rows.Select(r => r.DeliverAt <= now ? Arrived(r) : InTransit(r, now)));
        });

        // Demo only: jump the report clock forward. With no body it skips to the moment the next report arrives.
        app.MapPost("/api/demo/fast-forward", async (HttpRequest req, AppDb db, DemoClock clock) =>
        {
            double? seconds = null;
            if (req.ContentLength is > 0)
            {
                try
                {
                    using var doc = await JsonDocument.ParseAsync(req.Body);
                    if (doc.RootElement.ValueKind == JsonValueKind.Object &&
                        doc.RootElement.TryGetProperty("seconds", out var s) && s.ValueKind == JsonValueKind.Number)
                        seconds = s.GetDouble();
                }
                catch (JsonException)
                {
                    return Results.BadRequest(new { error = "Send JSON like { \"seconds\": 600 }, or no body to skip to the next arrival." });
                }
            }

            var now = clock.UtcNow;
            double advance;
            if (seconds is not null) advance = Math.Max(0, seconds.Value);
            else
            {
                var pending = await db.Reports.AsNoTracking().Where(r => r.DeliverAt > now).Select(r => r.DeliverAt).ToListAsync();
                advance = pending.Count == 0 ? 0 : (pending.Max() - now).TotalSeconds + 0.5;
            }

            clock.Advance(TimeSpan.FromSeconds(advance));
            return Results.Ok(new { advancedSeconds = Math.Round(advance, 1), offsetSeconds = Math.Round(clock.Offset.TotalSeconds, 1) });
        });

        app.MapPost("/api/demo/reset", (DemoClock clock) =>
        {
            clock.Reset();
            return Results.Ok(new { offsetSeconds = 0 });
        });
    }

    static string Id(Report r) => $"r-{r.Id}";

    static string Time(DateTime t) => t.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);

    static object Arrived(Report r) => new
    {
        id = Id(r), crewId = r.CrewId, mission = r.Mission, severity = r.Severity, summary = r.Summary,
        metrics = r.Metrics.Length == 0 ? Array.Empty<string>() : r.Metrics.Split(','),
        sentAt = Time(r.SentAt), deliverAt = Time(r.DeliverAt), replyEarliestAt = Time(r.ReplyEarliestAt),
        status = "arrived",
    };

    static object InTransit(Report r, DateTime now) => new
    {
        id = Id(r), crewId = r.CrewId, mission = r.Mission,
        sentAt = Time(r.SentAt), deliverAt = Time(r.DeliverAt),
        status = "in_transit",
        secondsToDeliver = Math.Max(0, Math.Ceiling((r.DeliverAt - now).TotalSeconds)),
    };
}
