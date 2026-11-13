using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace SpaceApi.Readings;

public static class SeedMockData
{
    // Loads data/mock/day143.json on startup unless mock readings are already there.
    // (Checking for mock rows, not any rows, so a test reading can't block the seed.)
    public static async Task RunAsync(AppDb db, IConfiguration config, ILogger log)
    {
        if (await db.Readings.AnyAsync(r => r.Source == "mock")) return;

        var path = config["Seed:Path"] ?? Path.Combine(AppContext.BaseDirectory, "SeedData", "day143.json");
        if (!File.Exists(path))
        {
            log.LogWarning("No mock data at {Path}. Starting with an empty readings table.", path);
            return;
        }

        using var doc = JsonDocument.Parse(await File.ReadAllTextAsync(path));
        var items = doc.RootElement.ValueKind == JsonValueKind.Array
            ? doc.RootElement.EnumerateArray().ToList()
            : [doc.RootElement];

        var problems = new List<ReadingRules.Problem>();
        var readings = new List<Reading>();
        for (var i = 0; i < items.Count; i++)
        {
            var r = ReadingRules.Parse(items[i], i, problems);
            if (r is not null) readings.Add(r);
        }

        foreach (var p in problems.Take(10))
            log.LogWarning("Mock data item {Index} skipped: {Message}", p.Index, p.Message);

        db.Readings.AddRange(readings);
        await db.SaveChangesAsync();
        log.LogInformation("Loaded {Count} mock readings, {Skipped} skipped.",
            readings.Count, problems.Select(p => p.Index).Distinct().Count());
    }
}
