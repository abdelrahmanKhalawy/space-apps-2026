using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SpaceApi.Readings;

namespace SpaceApi.Reports;

// The way back. A report only reaches the doctor after one signal delay (ReportEndpoints); the doctor's answer
// then needs the same delay again before the crew can read it, so a Mars round trip is really 40 minutes.
public static class ReplyEndpoints
{
    public static void EnsureTable(AppDb db) => db.Database.ExecuteSqlRaw("""
        CREATE TABLE IF NOT EXISTS "Replies" (
            "Id" INTEGER NOT NULL CONSTRAINT "PK_Replies" PRIMARY KEY AUTOINCREMENT,
            "ReportId" INTEGER NOT NULL,
            "CrewId" TEXT NOT NULL,
            "Text" TEXT NOT NULL,
            "SentAt" TEXT NOT NULL,
            "DeliverAt" TEXT NOT NULL
        );
        """);

    public static void MapReplies(this WebApplication app)
    {
        // The doctor answers a report they have already received.
        app.MapPost("/api/reports/{reportId}/reply", async (string reportId, JsonElement body, AppDb db, DemoClock clock) =>
        {
            var raw = reportId.StartsWith("r-") ? reportId[2..] : reportId;
            if (!int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var id))
                return Results.BadRequest(new { error = $"'{reportId}' is not a report id like r-12." });

            string? text = body.ValueKind == JsonValueKind.Object && body.TryGetProperty("text", out var t) && t.ValueKind == JsonValueKind.String
                ? t.GetString()?.Trim() : null;
            if (string.IsNullOrWhiteSpace(text)) return Results.BadRequest(new { error = "'text' is required." });
            if (text.Length > 1000) return Results.BadRequest(new { error = "'text' is too long (max 1000 characters)." });

            var report = await db.Reports.FirstOrDefaultAsync(r => r.Id == id);
            if (report is null) return Results.NotFound(new { error = $"No report {reportId}." });

            var now = clock.UtcNow;
            if (report.DeliverAt > now)
                return Results.Conflict(new { error = "That report has not reached Earth yet, so it cannot be answered." });

            var oneWay = TimeSpan.FromSeconds(Missions.OneWaySeconds[report.Mission]);
            var reply = new Reply { ReportId = report.Id, CrewId = report.CrewId, Text = text, SentAt = now, DeliverAt = now + oneWay };
            db.Replies.Add(reply);
            await db.SaveChangesAsync();

            return Results.Created($"/api/replies?crewId={Uri.EscapeDataString(reply.CrewId)}", new
            {
                id = $"a-{reply.Id}", reportId = $"r-{report.Id}", sentAt = Time(reply.SentAt), deliverAt = Time(reply.DeliverAt),
            });
        });

        // The crew's list. A reply still on its way comes back with only a countdown, no text.
        app.MapGet("/api/replies", async (string? crewId, AppDb db, DemoClock clock) =>
        {
            var now = clock.UtcNow;
            var q = db.Replies.AsNoTracking().AsQueryable();
            if (crewId is not null) q = q.Where(r => r.CrewId == crewId);
            var rows = await q.OrderByDescending(r => r.SentAt).ThenByDescending(r => r.Id).ToListAsync();
            return Results.Ok(rows.Select(r => r.DeliverAt <= now
                ? (object)new
                {
                    id = $"a-{r.Id}", reportId = $"r-{r.ReportId}", status = "arrived", text = r.Text,
                    sentAt = Time(r.SentAt), deliverAt = Time(r.DeliverAt),
                }
                : new
                {
                    id = $"a-{r.Id}", reportId = $"r-{r.ReportId}", status = "in_transit",
                    sentAt = Time(r.SentAt), deliverAt = Time(r.DeliverAt),
                    secondsToDeliver = Math.Max(0, Math.Ceiling((r.DeliverAt - now).TotalSeconds)),
                }));
        });
    }

    static string Time(DateTime t) => t.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);
}
