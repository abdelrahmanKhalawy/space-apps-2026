using Microsoft.EntityFrameworkCore;

namespace SpaceApi.Readings;

public class AppDb(DbContextOptions<AppDb> options) : DbContext(options)
{
    public DbSet<Reading> Readings => Set<Reading>();

    protected override void OnModelCreating(ModelBuilder b)
    {
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
