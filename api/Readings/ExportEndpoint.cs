using System.Globalization;
using System.Text;
using Microsoft.EntityFrameworkCore;

namespace SpaceApi.Readings;

// Open data: everything a crew member has logged, as CSV or JSON, in the shape of contracts/reading.md, so it can be
// analyzed elsewhere (a spreadsheet, a notebook, another tool). Sample readings are labeled source=mock.
public static class ExportEndpoint
{
    public static void MapExport(this WebApplication app)
    {
        app.MapGet("/api/export", async (string? crewId, string? format, AppDb db) =>
        {
            var crew = string.IsNullOrWhiteSpace(crewId) ? "crew-1" : crewId;
            var rows = await db.Readings.AsNoTracking().Where(r => r.CrewId == crew)
                .OrderBy(r => r.TakenAt).ThenBy(r => r.Id).ToListAsync();

            if (string.Equals(format, "json", StringComparison.OrdinalIgnoreCase))
                return Results.Json(rows.Select(r => new { r.CrewId, r.Metric, r.Value, r.Unit, TakenAt = Time(r.TakenAt), r.Source }),
                    new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web) { WriteIndented = true });

            var csv = new StringBuilder("crewId,metric,value,unit,takenAt,source\n");
            foreach (var r in rows)
                csv.Append(Cell(r.CrewId)).Append(',').Append(Cell(r.Metric)).Append(',')
                   .Append(r.Value.ToString("R", CultureInfo.InvariantCulture)).Append(',').Append(Cell(r.Unit)).Append(',')
                   .Append(Time(r.TakenAt)).Append(',').Append(Cell(r.Source)).Append('\n');
            return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", $"astropulse-{crew}.csv");
        })
        .WithSummary("Download a crew member's readings as CSV (default) or JSON (?format=json).");
    }

    static string Time(DateTime t) => t.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);

    // A cell with a comma, quote or newline is quoted; a leading = + - @ is prefixed so a spreadsheet never runs it as a formula.
    static string Cell(string s)
    {
        if (s.Length > 0 && "=+-@".Contains(s[0])) s = "'" + s;
        return s.IndexOfAny([',', '"', '\n', '\r']) >= 0 ? "\"" + s.Replace("\"", "\"\"") + "\"" : s;
    }
}
