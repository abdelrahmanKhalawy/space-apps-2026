using Microsoft.EntityFrameworkCore;
using SpaceApi.Readings;

namespace SpaceApi.Reports;

// The public link has ONE crew member and ONE database, so everything a judge does (simulated readings, camera
// readings, reports, doctor replies) is seen by the next judge. This puts the demo back to its starting state:
// only the Day-143 sample data stays, and the report clock goes back to real time. It is safe to leave public:
// the worst anyone can do with it is reset the demo.
public static class DemoRestoreEndpoint
{
    public static void MapDemoRestore(this WebApplication app)
    {
        app.MapPost("/api/demo/restore", async (AppDb db, DemoClock clock) =>
        {
            var readings = await db.Readings.Where(r => r.Source != "mock").ExecuteDeleteAsync();
            var reports = await db.Reports.ExecuteDeleteAsync();
            var replies = await db.Replies.ExecuteDeleteAsync();
            clock.Reset();
            return Results.Ok(new { removedReadings = readings, removedReports = reports, removedReplies = replies });
        });
    }
}
