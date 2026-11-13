using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using SpaceApi.Insights;
using SpaceApi.Readings;

namespace SpaceApi.Tests;

public class SeedAndModelTests
{
    static string Repo(params string[] parts)
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "global.json"))) dir = dir.Parent;
        return Path.Combine([dir!.FullName, .. parts]);
    }

    static AppDb NewDb(string dir)
    {
        var db = new AppDb(new DbContextOptionsBuilder<AppDb>().UseSqlite($"Data Source={Path.Combine(dir, "t.db")}").Options);
        db.Database.EnsureCreated();
        return db;
    }

    static IConfiguration Config() =>
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Seed:Path"] = Repo("data", "mock", "day143.json") }).Build();

    static Reading Row(string source, double value) => new()
    {
        CrewId = "crew-1", Metric = "heart_rate", Value = value, Unit = "bpm",
        TakenAt = new DateTime(2026, 11, 1, 3, 0, 0, DateTimeKind.Utc), Source = source,
    };

    [Fact]
    public async Task ChangedSampleDataReplacesOnlyTheOldMockRows()
    {
        var dir = Path.Combine(Path.GetTempPath(), "astropulse-seed-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            await using var db = NewDb(dir);
            // an older database: stale mock rows (no hash marker yet) plus a real camera reading
            db.Readings.AddRange(Row("mock", 11), Row("mock", 12), Row("camera", 71));
            await db.SaveChangesAsync();

            await SeedMockData.RunAsync(db, Config(), NullLogger.Instance, dir);

            Assert.DoesNotContain(await db.Readings.Where(r => r.Source == "mock").ToListAsync(), r => r.Value == 11 || r.Value == 12);
            Assert.Equal(1, await db.Readings.CountAsync(r => r.Source == "camera"));
            var mock = await db.Readings.CountAsync(r => r.Source == "mock");
            Assert.True(mock > 1000, $"expected the full Day-143 sample, got {mock}");
            Assert.True(File.Exists(Path.Combine(dir, "seed.sha256")));

            // a second start with the same file changes nothing
            await SeedMockData.RunAsync(db, Config(), NullLogger.Instance, dir);
            Assert.Equal(mock, await db.Readings.CountAsync(r => r.Source == "mock"));
        }
        finally { try { Directory.Delete(dir, true); } catch { /* temp file locked: not a failure */ } }
    }

    // The live model is the calibrated one: it must still catch the Day-143 drift in time for the demo.
    static List<Reading> Day143()
    {
        using var doc = JsonDocument.Parse(File.ReadAllBytes(Repo("data", "mock", "day143.json")));
        return doc.RootElement.EnumerateArray().Where(e => e.GetProperty("crewId").GetString() == "crew-1").Select(e => new Reading
        {
            CrewId = "crew-1", Metric = e.GetProperty("metric").GetString()!, Value = e.GetProperty("value").GetDouble(), Unit = "x",
            TakenAt = DateTime.Parse(e.GetProperty("takenAt").GetString()!, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal),
            Source = "mock",
        }).ToList();
    }

    [Fact]
    public void ModelCatchesTheDay143DriftBeforeHeartRateAndMoodLeaveGreen()
    {
        var rules = Thresholds.Load(Repo("research", "thresholds.json"), NullLogger.Instance);
        var (_, anomalies) = AnomalyModel.Analyze(Day143(), rules);
        var hr = anomalies.Single(a => a.Metric == "heart_rate");
        Assert.Equal("up", hr.Direction);
        Assert.True(hr.ColorStillGreen);
        Assert.True(anomalies.Single(a => a.Metric == "mood").ColorStillGreen);
        Assert.Contains(anomalies, a => a.Metric == "sleep_hours" && a.Direction == "down");
    }

    [Fact]
    public void ModelWaitsForFourDaysOfEvidence()
    {
        // Only 3 days past the baseline week: even a big shift must not be called yet.
        var rules = Thresholds.Load(Repo("research", "thresholds.json"), NullLogger.Instance);
        var early = Day143().Where(r => r.TakenAt < new DateTime(2026, 11, 10, 0, 0, 0, DateTimeKind.Utc)).ToList();
        var (_, anomalies) = AnomalyModel.Analyze(early, rules);
        Assert.DoesNotContain(anomalies, a => a.Metric == "heart_rate");
    }
}
