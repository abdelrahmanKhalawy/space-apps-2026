using System.Globalization;
using System.Text.Json;

namespace SpaceApi.Readings;

// The rules from contracts/reading.md. Anything not in these tables is rejected.
public static class ReadingRules
{
    public static readonly Dictionary<string, string> UnitByMetric = new()
    {
        ["heart_rate"] = "bpm",
        ["spo2"] = "%",
        ["temperature"] = "C",
        ["bp_systolic"] = "mmHg",
        ["bp_diastolic"] = "mmHg",
        ["glucose"] = "mg/dL",
        ["sleep_hours"] = "h",
        ["mood"] = "score",
    };

    public static readonly HashSet<string> Sources = ["device", "camera", "manual", "mock"];

    public record Problem(int Index, string Field, string Message);

    public static bool TryUtc(string? s, out DateTime t)
    {
        t = default;
        if (s is null || !s.EndsWith('Z')) return false;
        if (!DateTime.TryParse(s, CultureInfo.InvariantCulture,
                DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var parsed)) return false;
        t = DateTime.SpecifyKind(parsed, DateTimeKind.Utc);
        return true;
    }

    /// <summary>Validates one JSON reading. Returns the reading, or adds problems and returns null.</summary>
    public static Reading? Parse(JsonElement el, int index, List<Problem> problems)
    {
        if (el.ValueKind != JsonValueKind.Object)
        {
            problems.Add(new(index, "", "Each reading must be a JSON object."));
            return null;
        }

        var before = problems.Count;

        string? Text(string name)
        {
            if (!el.TryGetProperty(name, out var p))
            {
                problems.Add(new(index, name, $"'{name}' is required."));
                return null;
            }
            if (p.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(p.GetString()))
            {
                problems.Add(new(index, name, $"'{name}' must be a non-empty string."));
                return null;
            }
            return p.GetString();
        }

        var crewId = Text("crewId");
        var metric = Text("metric");
        var unit = Text("unit");
        var takenAtText = Text("takenAt");
        var source = Text("source");

        double value = 0;
        if (!el.TryGetProperty("value", out var v))
            problems.Add(new(index, "value", "'value' is required."));
        else if (v.ValueKind != JsonValueKind.Number)
            problems.Add(new(index, "value", "'value' must be a number, not text."));
        else
            value = v.GetDouble();

        if (metric is not null && !UnitByMetric.ContainsKey(metric))
            problems.Add(new(index, "metric",
                $"Unknown metric '{metric}'. Allowed: {string.Join(", ", UnitByMetric.Keys)}."));
        else if (metric is not null && unit is not null && UnitByMetric[metric] != unit)
            problems.Add(new(index, "unit", $"Unit for '{metric}' must be '{UnitByMetric[metric]}', got '{unit}'."));

        if (source is not null && !Sources.Contains(source))
            problems.Add(new(index, "source", $"Unknown source '{source}'. Allowed: {string.Join(", ", Sources)}."));

        DateTime takenAt = default;
        if (takenAtText is not null && !TryUtc(takenAtText, out takenAt))
            problems.Add(new(index, "takenAt", "'takenAt' must be UTC and end with Z, e.g. 2026-11-13T10:15:00Z."));

        if (problems.Count > before) return null;

        return new Reading
        {
            CrewId = crewId!, Metric = metric!, Value = value, Unit = unit!,
            TakenAt = takenAt, Source = source!,
        };
    }
}
