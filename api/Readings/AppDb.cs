using Microsoft.EntityFrameworkCore;
using SpaceApi.Reports;

namespace SpaceApi.Readings;

public class AppDb(DbContextOptions<AppDb> options) : DbContext(options)
{
    public DbSet<Reading> Readings => Set<Reading>();
    public DbSet<Report> Reports => Set<Report>();
    public DbSet<Reply> Replies => Set<Reply>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Report>(e =>
        {
            e.HasIndex(r => new { r.CrewId, r.SentAt });
            // Same as readings: SQLite drops the DateTime kind, so put UTC back.
            foreach (var p in new[] { nameof(Report.SentAt), nameof(Report.DeliverAt), nameof(Report.ReplyEarliestAt) })
                e.Property<DateTime>(p).HasConversion(v => v, v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
        });

        b.Entity<Reply>(e =>
        {
            e.HasIndex(r => new { r.CrewId, r.SentAt });
            foreach (var p in new[] { nameof(Reply.SentAt), nameof(Reply.DeliverAt) })
                e.Property<DateTime>(p).HasConversion(v => v, v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
        });

        b.Entity<Reading>(e =>
        {
            e.HasIndex(r => new { r.CrewId, r.Metric, r.TakenAt });
            // SQLite drops the DateTime kind; put it back so JSON ends with Z.
            e.Property(r => r.TakenAt).HasConversion(
                v => v,
                v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
        });
    }
}
