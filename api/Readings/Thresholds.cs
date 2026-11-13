using System.Text.Json;

namespace SpaceApi.Readings;

public record Band(string Color, double? Min, double? Max);

public record MetricThreshold(
    string Metric, string Unit, List<Band> Bands,
    Dictionary<string, string> Advice, string Hazard);

// Reads research/thresholds.json (shape: contracts/thresholds.md) and turns a value into a color.
// Change a number in the file and the color changes; no code involved.
public class Thresholds
{
    static readonly HashSet<string> Hazards = ["radiation", "isolation", "distance", "gravity", "environment"];
    static readonly Dictionary<string, int> Rank = new() { ["green"] = 1, ["yellow"] = 2, ["red"] = 3 };

    readonly Dictionary<string, MetricThreshold> _byMetric;
    Thresholds(Dictionary<string, MetricThreshold> byMetric) => _byMetric = byMetric;

    public MetricThreshold? For(string metric) => _byMetric.GetValueOrDefault(metric);

    /// <summary>The band is [min, max): min included, max excluded. A missing limit is unbounded.</summary>
    public string? ColorOf(string metric, double value)
    {
        if (!_byMetric.TryGetValue(metric, out var t)) return null;
        foreach (var b in t.Bands)
            if ((b.Min is null || value >= b.Min) && (b.Max is null || value < b.Max))
                return b.Color;
        return null;
    }

    public static string? Worst(IEnumerable<string?> colors) =>
        colors.Where(c => c is not null).OrderByDescending(c => Rank.GetValueOrDefault(c!, 0)).FirstOrDefault();

    public static Thresholds Load(string path, ILogger log)
    {
        var map = new Dictionary<string, MetricThreshold>();
        if (!File.Exists(path))
        {
            log.LogError("Thresholds file not found at {Path}. Readings will have no color.", path);
            return new Thresholds(map);
        }

        // Bytes, not a string: avoids relying on File.ReadAllText's encoding guess for a
        // BOM-less file (seen to mangle non-ASCII text in Explanations.cs on this host).
        using var doc = JsonDocument.Parse(File.ReadAllBytes(path));
        foreach (var prop in doc.RootElement.EnumerateObject())
        {
            if (prop.Name.StartsWith('_')) continue; // notes, not metrics
            try
            {
                var t = ParseMetric(prop.Name, prop.Value);
                Check(t, prop.Value, log);
                map[prop.Name] = t;
            }
            catch (Exception e)
            {
                log.LogError("Thresholds for '{Metric}' are broken and were skipped: {Message}", prop.Name, e.Message);
            }
        }

        foreach (var m in ReadingRules.UnitByMetric.Keys.Where(m => !map.ContainsKey(m)))
            log.LogWarning("No thresholds for '{Metric}'. Its readings will have no color.", m);

        log.LogInformation("Loaded thresholds for {Count} metrics from {Path}.", map.Count, path);
        return new Thresholds(map);
    }

    static MetricThreshold ParseMetric(string metric, JsonElement el)
    {
        var bands = el.GetProperty("bands").EnumerateArray().Select(b => new Band(
            b.GetProperty("color").GetString()!,
            b.TryGetProperty("min", out var mn) ? mn.GetDouble() : null,
            b.TryGetProperty("max", out var mx) ? mx.GetDouble() : null)).ToList();

        var advice = el.GetProperty("advice").EnumerateObject().ToDictionary(a => a.Name, a => a.Value.GetString() ?? "");
        return new MetricThreshold(metric, el.GetProperty("unit").GetString()!, bands, advice,
            el.GetProperty("hazard").GetString()!);
    }

    // Rules from contracts/thresholds.md. Problems are logged, not fatal: a typo shouldn't take the site down.
    static void Check(MetricThreshold t, JsonElement el, ILogger log)
    {
        void Warn(string msg) => log.LogWarning("Thresholds '{Metric}': {Msg}", t.Metric, msg);

        if (!ReadingRules.UnitByMetric.TryGetValue(t.Metric, out var unit)) Warn("not a metric in contracts/reading.md.");
        else if (unit != t.Unit) Warn($"unit is '{t.Unit}' but the reading contract says '{unit}'.");
        if (!Hazards.Contains(t.Hazard)) Warn($"hazard '{t.Hazard}' is not one of the five.");
        foreach (var c in new[] { "green", "yellow", "red" })
            if (!t.Advice.ContainsKey(c)) Warn($"no advice for {c}.");
        if (!el.TryGetProperty("sources", out var s) || s.GetArrayLength() == 0) Warn("no source.");
        foreach (var b in t.Bands)
            if (!Rank.ContainsKey(b.Color)) Warn($"unknown color '{b.Color}'.");

        var sorted = t.Bands.OrderBy(b => b.Min ?? double.NegativeInfinity).ToList();
        if (sorted.Count == 0) { Warn("no bands."); return; }
        if (sorted[0].Min is not null) Warn("gap: nothing covers values below " + sorted[0].Min + ".");
        if (sorted[^1].Max is not null) Warn("gap: nothing covers values from " + sorted[^1].Max + " up.");
        for (var i = 1; i < sorted.Count; i++)
            if (sorted[i - 1].Max != sorted[i].Min)
                Warn($"gap or overlap between {sorted[i - 1].Max} and {sorted[i].Min}.");
    }
}
