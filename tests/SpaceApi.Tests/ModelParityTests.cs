using System.Globalization;
using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using SpaceApi.Insights;
using SpaceApi.Readings;
using SpaceApi.SpaceWeather;

namespace SpaceApi.Tests;

// The anomaly model exists twice: ai/baseline.py (the original) and api/Insights/AnomalyModel.cs (what runs live).
// These tests run the C# one on the same Day-143 readings and compare it with the Python result the team
// checked in (data/precomputed/analyze.json), so the two can't drift apart without a failing test.
public class ModelParityTests
{
    static string RepoFile(params string[] parts)
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "global.json"))) dir = dir.Parent;
        Assert.NotNull(dir);
        return Path.Combine([dir!.FullName, .. parts]);
    }

    static List<Reading> Day143()
    {
        using var doc = JsonDocument.Parse(File.ReadAllBytes(RepoFile("data", "mock", "day143.json")));
        return doc.RootElement.EnumerateArray()
            .Where(e => e.GetProperty("crewId").GetString() == "crew-1")
            .Select(e => new Reading
            {
                CrewId = "crew-1",
                Metric = e.GetProperty("metric").GetString()!,
                Value = e.GetProperty("value").GetDouble(),
                Unit = e.GetProperty("unit").GetString()!,
                TakenAt = DateTime.Parse(e.GetProperty("takenAt").GetString()!, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal),
                Source = "mock",
            }).ToList();
    }

    static Thresholds Rules() => Thresholds.Load(RepoFile("research", "thresholds.json"), NullLogger.Instance);

    [Fact]
    public void CSharpBaselineMatchesPython()
    {
        var (baseline, _) = AnomalyModel.Analyze(Day143(), Rules());
        using var py = JsonDocument.Parse(File.ReadAllBytes(RepoFile("data", "precomputed", "analyze.json")));
        foreach (var m in py.RootElement.GetProperty("baseline").EnumerateObject())
        {
            Assert.True(baseline.ContainsKey(m.Name), $"C# has no baseline for {m.Name}");
            Assert.Equal(m.Value.GetProperty("mean").GetDouble(), baseline[m.Name].Mean, 2);
            Assert.Equal(m.Value.GetProperty("std").GetDouble(), baseline[m.Name].Std, 2);
        }
        Assert.Equal(py.RootElement.GetProperty("baseline").EnumerateObject().Count(), baseline.Count);
    }

    [Fact]
    public void CSharpAnomaliesMatchPython()
    {
        var (_, anomalies) = AnomalyModel.Analyze(Day143(), Rules());
        using var py = JsonDocument.Parse(File.ReadAllBytes(RepoFile("data", "precomputed", "analyze.json")));
        var expected = py.RootElement.GetProperty("anomalies").EnumerateArray().ToList();
        Assert.Equal(expected.Count, anomalies.Count);
        foreach (var e in expected)
        {
            var metric = e.GetProperty("metric").GetString()!;
            var got = anomalies.Single(a => a.Metric == metric);
            Assert.Equal(e.GetProperty("direction").GetString(), got.Direction);
            Assert.Equal(e.GetProperty("since").GetString(), got.Since.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture));
            Assert.Equal(e.GetProperty("score").GetDouble(), got.Score, 2);
        }
    }

    [Fact]
    public void ModelStaysQuietOnAHealthyCrew()
    {
        // One week of readings with no drift: nothing should be flagged.
        var flat = Day143().Where(r => r.TakenAt < new DateTime(2026, 11, 7, 0, 0, 0, DateTimeKind.Utc)).ToList();
        var (_, anomalies) = AnomalyModel.Analyze(flat, Rules());
        Assert.Empty(anomalies);
    }
}

public class SpaceWeatherLevelTests
{
    [Theory]
    [InlineData(0, "calm")]
    [InlineData(1, "elevated")]
    [InlineData(2, "elevated")]
    [InlineData(3, "storm")]
    [InlineData(5, "storm")]
    public void LevelFollowsTheNoaaSolarRadiationScale(int s, string level)
    {
        Assert.Equal(level, SpaceWeatherEndpoints.Build(s, 0, 0, null, null, null, null, "live", false).Level);
    }

    [Fact]
    public void SnapshotIsNeverPresentedAsRightNow()
    {
        var r = SpaceWeatherEndpoints.Build(0, 0, 0, null, null, null, null, "snapshot", false);
        Assert.Contains("Last recorded", r.Detail);
        Assert.False(r.Simulated);
    }

    [Fact]
    public void SimulatedStormIsMarkedSimulated()
    {
        var r = SpaceWeatherEndpoints.Build(3, 2, 1, 1500, 6.67, 720, null, "simulated", true);
        Assert.True(r.Simulated);
        Assert.Equal("storm", r.Level);
    }
}
