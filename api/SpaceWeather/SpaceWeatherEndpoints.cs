using System.Globalization;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;

namespace SpaceApi.SpaceWeather;

// Radiation is the first of NASA's five spaceflight hazards, and nothing a crew member
// logs shows it. This endpoint reads the real, public space-weather feeds from NOAA's
// Space Weather Prediction Center (services.swpc.noaa.gov) and reduces them to a level the
// app can show. Cached for 5 minutes. If NOAA can't be reached it serves a recorded real
// snapshot (data/precomputed/space-weather.json), marked as such. ?scenario=storm returns a
// clearly SIMULATED solar radiation storm, so the demo can show what the app does in one.
public record SpaceWeatherReport(
    string Level, int SScale, int GScale, int RScale,
    double? ProtonFlux10MeV, double? Kp, double? SolarWindKmS,
    string? ObservedAt, string Source, bool Simulated, string Headline, string Detail,
    NasaDonki? Nasa = null);

public static class SpaceWeatherEndpoints
{
    const string Base = "https://services.swpc.noaa.gov";
    static readonly TimeSpan CacheFor = TimeSpan.FromMinutes(5);

    public static void MapSpaceWeather(this WebApplication app)
    {
        var snapshotPath = Path.Combine(AppContext.BaseDirectory, "SeedData", "space-weather.json");

        app.MapGet("/api/space-weather", async (string? scenario, IHttpClientFactory http, IMemoryCache cache, IConfiguration config, ILogger<Program> log) =>
        {
            if (scenario == "storm") return Results.Ok(Storm());

            if (cache.TryGetValue("space-weather", out SpaceWeatherReport? hit) && hit is not null) return Results.Ok(hit);

            try
            {
                var report = await Fetch(http.CreateClient("noaa"));
                // NASA DONKI adds what happened recently (flares, particle events, storms). Cached longer: it changes slowly and
                // the free key is rate-limited. Any failure just leaves the NASA line out.
                var nasa = await cache.GetOrCreateAsync("donki", async e =>
                {
                    var found = await DonkiClient.Fetch(http.CreateClient("noaa"), config["Nasa:ApiKey"] ?? "DEMO_KEY", DateTime.UtcNow);
                    e.AbsoluteExpirationRelativeToNow = found is null ? TimeSpan.FromMinutes(5) : TimeSpan.FromHours(1); // retry a failure soon
                    return found;
                });
                report = report with { Nasa = nasa };
                cache.Set("space-weather", report, CacheFor);
                return Results.Ok(report);
            }
            catch (Exception e)
            {
                log.LogWarning(e, "NOAA space weather unreachable; serving the recorded snapshot.");
                return Results.Ok(Snapshot(snapshotPath));
            }
        });
    }

    static async Task<SpaceWeatherReport> Fetch(HttpClient client)
    {
        var scalesTask = Get(client, "/products/noaa-scales.json");
        var kpTask = TryGet(client, "/json/planetary_k_index_1m.json");
        var protonTask = TryGet(client, "/json/goes/primary/integral-protons-1-day.json");
        var windTask = TryGet(client, "/products/summary/solar-wind-speed.json");

        // The scales are the official level, so they must work; the rest only add detail.
        using var scales = await scalesTask;
        var now = scales.RootElement.GetProperty("0");
        int Scale(string letter) =>
            int.TryParse(now.GetProperty(letter).GetProperty("Scale").GetString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var n) ? n : 0;
        var s = Scale("S");
        var g = Scale("G");
        var r = Scale("R");
        var observed = $"{now.GetProperty("DateStamp").GetString()}T{now.GetProperty("TimeStamp").GetString()}Z";

        double? kp = null, flux = null, wind = null;
        using (var doc = await kpTask)
            if (doc is not null && doc.RootElement.GetArrayLength() > 0)
                kp = doc.RootElement[doc.RootElement.GetArrayLength() - 1].GetProperty("estimated_kp").GetDouble();
        using (var doc = await protonTask)
            if (doc is not null)
                for (var i = doc.RootElement.GetArrayLength() - 1; i >= 0; i--)
                {
                    var row = doc.RootElement[i];
                    if (row.GetProperty("energy").GetString() == ">=10 MeV") { flux = row.GetProperty("flux").GetDouble(); break; }
                }
        using (var doc = await windTask)
            if (doc is not null && doc.RootElement.GetArrayLength() > 0)
                wind = doc.RootElement[0].GetProperty("proton_speed").GetDouble();

        return Build(s, g, r, flux, kp, wind, observed, "live", simulated: false);
    }

    static async Task<JsonDocument> Get(HttpClient c, string path)
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(8));
        await using var stream = await c.GetStreamAsync(Base + path, cts.Token);
        return await JsonDocument.ParseAsync(stream, cancellationToken: cts.Token);
    }

    static async Task<JsonDocument?> TryGet(HttpClient c, string path)
    {
        try { return await Get(c, path); } catch { return null; }
    }

    public static SpaceWeatherReport Build(int s, int g, int r, double? flux, double? kp, double? wind, string? observed, string source, bool simulated)
    {
        var level = s >= 3 ? "storm" : s >= 1 ? "elevated" : "calm";
        var headline = level switch
        {
            "storm" => $"Solar radiation storm (S{s})",
            "elevated" => $"Minor solar radiation storm (S{s})",
            _ => "Radiation environment: calm",
        };
        var detail = level switch
        {
            "storm" => "NOAA's scale for this level: radiation hazard avoidance is recommended for astronauts on EVA. Move to the most shielded part of the vehicle and follow the mission's radiation procedure.",
            "elevated" => "Elevated particle flux. NOAA lists no direct biological effect at this level, but keep watching the trend and skip optional EVA.",
            _ when source == "snapshot" => $"Last recorded NOAA reading (the live feed could not be reached): no solar radiation storm. Geomagnetic activity G{g}, radio blackouts R{r}.",
            _ => $"NOAA reports no solar radiation storm right now. Geomagnetic activity G{g}, radio blackouts R{r}.",
        };
        return new SpaceWeatherReport(level, s, g, r, flux, kp, wind, observed, source, simulated, headline, detail);
    }

    // A SIMULATED storm for the demo. Never presented as real: Simulated is true and the UI says so.
    static SpaceWeatherReport Storm() =>
        Build(3, 2, 1, 1500, 6.67, 720, DateTime.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture), "simulated", simulated: true);

    static SpaceWeatherReport Snapshot(string path)
    {
        if (!File.Exists(path))
            return Build(0, 0, 0, null, null, null, null, "snapshot", simulated: false);
        var j = JsonSerializer.Deserialize<JsonElement>(File.ReadAllBytes(path));
        double? D(string k) => j.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDouble() : null;
        int I(string k) => j.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetInt32() : 0;
        var observed = j.TryGetProperty("observedAt", out var o) ? o.GetString() : null;
        return Build(I("sScale"), I("gScale"), I("rScale"), D("protonFlux10MeV"), D("kp"), D("solarWindKmS"), observed, "snapshot", simulated: false);
    }
}
