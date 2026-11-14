using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc.Testing;

namespace SpaceApi.Tests;

// The whole app, started in memory against a throwaway SQLite file, called over real HTTP routes.
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    public readonly string Dir = Path.Combine(Path.GetTempPath(), "astropulse-tests-" + Guid.NewGuid().ToString("N"));

    static string Repo(params string[] parts)
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "global.json"))) dir = dir.Parent;
        return Path.Combine([dir!.FullName, .. parts]);
    }

    protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
    {
        Directory.CreateDirectory(Dir);
        builder.UseSetting("Db:Dir", Dir);
        builder.UseSetting("Thresholds:Path", Repo("research", "thresholds.json"));
        builder.UseSetting("Explanations:Path", Repo("research", "explanations.json"));
        builder.UseSetting("Seed:Path", Repo("data", "mock", "day143.json"));
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        try { Directory.Delete(Dir, true); } catch { /* a locked temp file is not a test failure */ }
    }
}

public class ApiIntegrationTests : IClassFixture<ApiFactory>
{
    readonly HttpClient http;
    static readonly Regex Arabic = new(@"[؀-ۿ]");

    public ApiIntegrationTests(ApiFactory f) => http = f.CreateClient();

    static StringContent Json(object o) => new(JsonSerializer.Serialize(o), System.Text.Encoding.UTF8, "application/json");

    // ---- language of the advice
    [Fact]
    public async Task StatusAdviceIsEnglishByDefault()
    {
        var status = await http.GetFromJsonAsync<JsonElement>("/api/status?crewId=crew-1");
        var advice = status.GetProperty("metrics").EnumerateArray().Select(m => m.GetProperty("advice").GetString()!).ToList();
        Assert.NotEmpty(advice);
        Assert.All(advice, a => Assert.False(Arabic.IsMatch(a), $"Arabic text in the default advice: {a}"));
    }

    [Fact]
    public async Task StatusAdviceCanStillBeArabic()
    {
        var status = await http.GetFromJsonAsync<JsonElement>("/api/status?crewId=crew-1&lang=ar");
        Assert.All(status.GetProperty("metrics").EnumerateArray(), m => Assert.Matches(Arabic, m.GetProperty("advice").GetString()!));
    }

    [Fact]
    public void EveryMetricHasEnglishAdviceForEveryColor()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "../../../../..", "research", "thresholds.json");
        using var doc = JsonDocument.Parse(File.ReadAllBytes(Path.GetFullPath(path)));
        foreach (var metric in doc.RootElement.EnumerateObject().Where(p => !p.Name.StartsWith('_')))
        {
            var en = metric.Value.GetProperty("advice_en");
            foreach (var color in new[] { "green", "yellow", "red" })
            {
                var text = en.GetProperty(color).GetString()!;
                Assert.False(string.IsNullOrWhiteSpace(text), $"{metric.Name}.{color} is empty");
                Assert.False(Arabic.IsMatch(text), $"{metric.Name}.{color} advice_en contains Arabic");
            }
        }
    }

    // ---- reading sources
    [Fact]
    public async Task CameraIsAnAllowedSourceAndUnknownSourcesAreRejected()
    {
        object Body(string source) => new[] { new { crewId = "crew-9", metric = "heart_rate", value = 71, unit = "bpm", takenAt = "2026-11-14T10:00:00Z", source } };
        Assert.Equal(HttpStatusCode.Created, (await http.PostAsync("/api/readings", Json(Body("camera")))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await http.PostAsync("/api/readings", Json(Body("laser")))).StatusCode);
    }


    // ---- open data and API docs
    [Fact]
    public async Task ExportGivesCsvAndJsonOfTheReadings()
    {
        var csv = await http.GetAsync("/api/export?crewId=crew-1");
        Assert.Equal(HttpStatusCode.OK, csv.StatusCode);
        Assert.StartsWith("text/csv", csv.Content.Headers.ContentType!.ToString());
        var text = await csv.Content.ReadAsStringAsync();
        var lines = text.Split((char)10, StringSplitOptions.RemoveEmptyEntries);
        Assert.Equal("crewId,metric,value,unit,takenAt,source", lines[0]);
        Assert.True(lines.Length > 1000, "the Day-143 sample should be in the export");
        Assert.Contains("crew-1,heart_rate,", text);

        var json = await http.GetFromJsonAsync<JsonElement>("/api/export?crewId=crew-1&format=json");
        Assert.True(json.GetArrayLength() == lines.Length - 1);
        Assert.Equal("crew-1", json[0].GetProperty("crewId").GetString());
    }

    [Fact]
    public async Task ApiDocumentationListsTheMainEndpoints()
    {
        var doc = await http.GetStringAsync("/swagger/v1/swagger.json");
        foreach (var path in new[] { "/api/status", "/api/readings", "/api/reports", "/api/space-weather", "/api/export", "/api/explain" })
            Assert.Contains(path, doc);
        Assert.Equal(HttpStatusCode.OK, (await http.GetAsync("/swagger/index.html")).StatusCode);
    }

    // ---- space weather without the network
    [Fact]
    public async Task SimulatedSolarStormIsMarkedSimulated()
    {
        var w = await http.GetFromJsonAsync<JsonElement>("/api/space-weather?scenario=storm");
        Assert.Equal("storm", w.GetProperty("level").GetString());
        Assert.True(w.GetProperty("simulated").GetBoolean());
    }

    // ---- the way back from Earth, and the demo restore
    [Fact]
    public async Task DoctorReplyCrossesTheDelayBackAndRestoreClearsTheDemo()
    {
        await http.PostAsync("/api/demo/restore", null); // start clean
        var sent = await (await http.PostAsync("/api/reports", Json(new { crewId = "crew-7", mission = "mars", severity = "red", summary = "Sleep is red.", metrics = new[] { "sleep_hours" } })))
            .Content.ReadFromJsonAsync<JsonElement>();
        var id = sent.GetProperty("id").GetString()!;

        // still on its way to Earth: the doctor cannot answer yet
        Assert.Equal(HttpStatusCode.Conflict, (await http.PostAsync($"/api/reports/{id}/reply", Json(new { text = "hello" }))).StatusCode);

        await http.PostAsync("/api/demo/fast-forward", null); // the report reaches Earth
        Assert.Equal(HttpStatusCode.Created, (await http.PostAsync($"/api/reports/{id}/reply", Json(new { text = "Rest and measure again." }))).StatusCode);

        var waiting = await http.GetFromJsonAsync<JsonElement>("/api/replies?crewId=crew-7");
        Assert.Equal("in_transit", waiting[0].GetProperty("status").GetString());
        Assert.False(waiting[0].TryGetProperty("text", out _), "the text must not leak before it arrives");

        await http.PostAsync("/api/demo/fast-forward", null); // the reply reaches the crew
        var arrived = await http.GetFromJsonAsync<JsonElement>("/api/replies?crewId=crew-7");
        Assert.Equal("arrived", arrived[0].GetProperty("status").GetString());
        Assert.Equal("Rest and measure again.", arrived[0].GetProperty("text").GetString());

        // restore: the report and reply are gone, the Day-143 sample data stays, non-sample readings are removed
        await http.PostAsync("/api/readings", Json(new[] { new { crewId = "crew-1", metric = "heart_rate", value = 70, unit = "bpm", takenAt = "2030-01-01T00:00:00Z", source = "camera" } }));
        var restored = await (await http.PostAsync("/api/demo/restore", null)).Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(restored.GetProperty("removedReadings").GetInt32() >= 1);
        Assert.Empty((await http.GetFromJsonAsync<JsonElement>("/api/reports?crewId=crew-7")).EnumerateArray());
        Assert.Empty((await http.GetFromJsonAsync<JsonElement>("/api/replies?crewId=crew-7")).EnumerateArray());
        var heart = await http.GetFromJsonAsync<JsonElement>("/api/readings?crewId=crew-1&metric=heart_rate");
        Assert.NotEmpty(heart.EnumerateArray());
        Assert.All(heart.EnumerateArray(), r => Assert.Equal("mock", r.GetProperty("source").GetString()));
    }
}
