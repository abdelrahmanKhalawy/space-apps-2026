using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace SpaceApi.Readings;

public static class SeedMockData
{
    // Loads data/mock/day143.json on startup. If mock readings are already there it does nothing, UNLESS the sample
    // file has changed since they were loaded (a hash kept next to the database says which version is in there):
    // then the old mock rows are replaced by the new ones. Only mock rows are touched, never camera or manual readings.
    // (Checking for mock rows, not any rows, so a test reading can't block the seed.)
    public static async Task RunAsync(AppDb db, IConfiguration config, ILogger log, string? dataDir = null)
    {
        var path = config["Seed:Path"] ?? Path.Combine(AppContext.BaseDirectory, "SeedData", "day143.json");
        if (!File.Exists(path))
        {
            if (!await db.Readings.AnyAsync(r => r.Source == "mock"))
                log.LogWarning("No mock data at {Path}. Starting with an empty readings table.", path);
            return;
        }

        var hash = Convert.ToHexString(SHA256.HashData(await File.ReadAllBytesAsync(path)));
        var marker = dataDir is null ? null : Path.Combine(dataDir, "seed.sha256");
        var storedHash = marker is not null && File.Exists(marker) ? (await File.ReadAllTextAsync(marker)).Trim() : null;

        if (await db.Readings.AnyAsync(r => r.Source == "mock"))
        {
            if (marker is null || storedHash == hash) return; // already loaded, and it is the current version
            var replaced = await db.Readings.Where(r => r.Source == "mock").ExecuteDeleteAsync();
            log.LogInformation("The sample data changed: replacing {Count} old mock readings.", replaced);
        }

        using var doc = JsonDocument.Parse(await File.ReadAllBytesAsync(path));
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
        if (marker is not null) await File.WriteAllTextAsync(marker, hash);
    }
}
