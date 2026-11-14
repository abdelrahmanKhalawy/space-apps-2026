using System.Globalization;
using System.Text.Json;

namespace SpaceApi.SpaceWeather;

/// <summary>Recent space-weather events from NASA's DONKI database (Space Weather Database Of Notifications, Knowledge, Information).</summary>
public record NasaDonki(
    int FlaresLast7Days, string? StrongestFlareClass, string? StrongestFlarePeak,
    int SolarParticleEventsLast30Days, string? LastSolarParticleEvent,
    int GeomagneticStormsLast30Days, double? MaxKpLast30Days);

// NOAA's feeds (SpaceWeatherEndpoints) say what the sun is doing right now; NASA's DONKI says what has happened recently:
// solar flares, solar energetic particle events (the radiation storms that matter to crews) and geomagnetic storms.
// Free key from api.nasa.gov; without one the shared DEMO_KEY works but is rate-limited, so results are cached for an hour
// by the caller and every call is failure-tolerant: no answer just means no NASA line on the card.
public static class DonkiClient
{
    const string Base = "https://api.nasa.gov/DONKI";

    public static async Task<NasaDonki?> Fetch(HttpClient client, string apiKey, DateTime utcNow)
    {
        string Day(DateTime d) => d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var end = Day(utcNow);
        var flr = TryGet(client, $"{Base}/FLR?startDate={Day(utcNow.AddDays(-7))}&endDate={end}&api_key={Uri.EscapeDataString(apiKey)}");
        var sep = TryGet(client, $"{Base}/SEP?startDate={Day(utcNow.AddDays(-30))}&endDate={end}&api_key={Uri.EscapeDataString(apiKey)}");
        var gst = TryGet(client, $"{Base}/GST?startDate={Day(utcNow.AddDays(-30))}&endDate={end}&api_key={Uri.EscapeDataString(apiKey)}");

        using var flares = await flr;
        using var particles = await sep;
        using var storms = await gst;
        if (flares is null && particles is null && storms is null) return null; // DONKI not reachable: no NASA line

        return Parse(flares, particles, storms);
    }

    /// <summary>Public so the tests can feed it canned DONKI answers.</summary>
    public static NasaDonki Parse(JsonDocument? flares, JsonDocument? particles, JsonDocument? storms)
    {
        var flareList = Items(flares).ToList();
        var strongest = flareList
            .Select(e => (cls: Str(e, "classType"), peak: Str(e, "peakTime")))
            .Where(x => x.cls is not null)
            .OrderByDescending(x => FlareRank(x.cls!))
            .FirstOrDefault();

        var particleList = Items(particles).ToList();
        var lastParticle = particleList.Select(e => Str(e, "eventTime")).Where(t => t is not null).OrderByDescending(t => t, StringComparer.Ordinal).FirstOrDefault();

        var stormList = Items(storms).ToList();
        double? maxKp = null;
        foreach (var s in stormList)
            if (s.TryGetProperty("allKpIndex", out var kps) && kps.ValueKind == JsonValueKind.Array)
                foreach (var k in kps.EnumerateArray())
                    if (k.TryGetProperty("kpIndex", out var v) && v.ValueKind == JsonValueKind.Number)
                        maxKp = Math.Max(maxKp ?? 0, v.GetDouble());

        return new NasaDonki(flareList.Count, strongest.cls, strongest.peak, particleList.Count, lastParticle, stormList.Count, maxKp);
    }

    /// <summary>X beats M beats C beats B beats A, then the number: X2.1 &gt; M9.9 &gt; C1.0.</summary>
    public static double FlareRank(string cls)
    {
        if (string.IsNullOrEmpty(cls)) return -1;
        var letter = char.ToUpperInvariant(cls[0]);
        var order = "ABCMX".IndexOf(letter);
        var number = double.TryParse(cls.AsSpan(1), NumberStyles.Float, CultureInfo.InvariantCulture, out var n) ? n : 0;
        return (order < 0 ? -1 : order) * 1000 + number;
    }

    static IEnumerable<JsonElement> Items(JsonDocument? doc) =>
        doc is not null && doc.RootElement.ValueKind == JsonValueKind.Array ? doc.RootElement.EnumerateArray() : [];

    static string? Str(JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    static async Task<JsonDocument?> TryGet(HttpClient c, string url)
    {
        try
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(8));
            using var res = await c.GetAsync(url, cts.Token);
            if (!res.IsSuccessStatusCode) return null;
            var text = await res.Content.ReadAsStringAsync(cts.Token);
            // DONKI answers an empty body (not "[]") when nothing happened in the range: that is "zero events", not a failure
            return string.IsNullOrWhiteSpace(text) ? JsonDocument.Parse("[]") : JsonDocument.Parse(text);
        }
        catch { return null; }
    }
}
