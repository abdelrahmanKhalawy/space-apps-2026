namespace SpaceApi.Reports;

/// <summary>
/// The clock the report delay runs on. It is the real clock plus an offset, and the demo can move the offset
/// forward so a 20 minute Mars delay passes in seconds. Nothing else in the app uses it.
/// </summary>
public sealed class DemoClock
{
    long _offsetTicks;

    public TimeSpan Offset => TimeSpan.FromTicks(Interlocked.Read(ref _offsetTicks));
    public DateTime UtcNow => DateTime.UtcNow + Offset;

    public void Advance(TimeSpan by) => Interlocked.Add(ref _offsetTicks, by.Ticks);
    public void Reset() => Interlocked.Exchange(ref _offsetTicks, 0);
}

/// <summary>One way message delay by mission place. Same numbers as the table in contracts/api.md.</summary>
public static class Missions
{
    public static readonly Dictionary<string, double> OneWaySeconds = new()
    {
        ["iss"] = 1,
        ["moon"] = 1.25,
        ["mars"] = 20 * 60, // real Mars is 4 to 20 minutes; the demo uses the 20 minute worst case
    };
}
