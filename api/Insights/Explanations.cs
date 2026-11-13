using System.Text;
using System.Text.Json;

namespace SpaceApi.Insights;

// Port of ai/explain.py: research/explanations.json (n2), word for word — never
// anything invented. Loaded once; this file only changes when Nada edits it.
public record SourceRef(string Title, string Url);
public record ExplanationEntry(string Hazard, string Explanation, List<string> Steps, List<SourceRef> Sources);

public class Explanations
{
    readonly Dictionary<string, ExplanationEntry> _byMetric;
    Explanations(Dictionary<string, ExplanationEntry> byMetric) => _byMetric = byMetric;

    public static Explanations Load(string path, ILogger log)
    {
        var map = new Dictionary<string, ExplanationEntry>();
        if (!File.Exists(path))
        {
            log.LogWarning("No explanations file at {Path}. /api/explain will have no text to show.", path);
            return new Explanations(map);
        }

        // Parse UTF-8 bytes directly rather than going through a string — this file has
        // no BOM, and File.ReadAllText(string) has been seen to pick the wrong encoding
        // for it on this host, mangling the em dashes in the English text.
        using var doc = JsonDocument.Parse(File.ReadAllBytes(path));
        foreach (var prop in doc.RootElement.EnumerateObject())
        {
            if (prop.Name.StartsWith('_')) continue; // notes, not metrics
            var el = prop.Value;
            var sources = el.GetProperty("sources").EnumerateArray()
                .Select(s => new SourceRef(s.GetProperty("title").GetString() ?? "", s.GetProperty("url").GetString() ?? ""))
                .ToList();
            var steps = el.GetProperty("steps").EnumerateArray().Select(s => s.GetString() ?? "").ToList();
            map[prop.Name] = new ExplanationEntry(
                el.GetProperty("hazard").GetString() ?? "",
                el.GetProperty("explanation").GetString() ?? "",
                steps, sources);
        }
        return new Explanations(map);
    }

    public object? ExplainOne(Anomaly a)
    {
        if (!_byMetric.TryGetValue(a.Metric, out var e)) return null;
        return new { metric = a.Metric, hazard = e.Hazard, explanation = e.Explanation, steps = e.Steps, sources = e.Sources };
    }

    /// <summary>Every anomaly, explained, with each entry's relatedMetrics listing the
    /// others that share its hazard — the brief's "link them together" step, done
    /// without inventing a combined sentence (ai/explain.py's explain_all).</summary>
    public List<object> ExplainAll(List<Anomaly> anomalies)
    {
        var withHazard = new List<(Anomaly A, ExplanationEntry E)>();
        foreach (var a in anomalies)
            if (_byMetric.TryGetValue(a.Metric, out var e))
                withHazard.Add((a, e));

        var byHazard = withHazard.GroupBy(x => x.E.Hazard).ToDictionary(g => g.Key, g => g.Select(x => x.A.Metric).ToList());

        return withHazard.Select(x => (object)new
        {
            metric = x.A.Metric,
            hazard = x.E.Hazard,
            explanation = x.E.Explanation,
            steps = x.E.Steps,
            sources = x.E.Sources,
            relatedMetrics = byHazard[x.E.Hazard].Where(m => m != x.A.Metric).ToList(),
        }).ToList();
    }
}
