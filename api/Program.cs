using Microsoft.EntityFrameworkCore;
using SpaceApi.Readings;

var builder = WebApplication.CreateBuilder(args);

// SQLite file. On Azure only /home survives a restart (WEBSITE_SITE_NAME is set there).
var dataDir = builder.Configuration["Db:Dir"]
    ?? (Environment.GetEnvironmentVariable("WEBSITE_SITE_NAME") is not null
        ? "/home/data"
        : Path.Combine(AppContext.BaseDirectory, "data"));
Directory.CreateDirectory(dataDir);
builder.Services.AddDbContext<AppDb>(o => o.UseSqlite($"Data Source={Path.Combine(dataDir, "space.db")}"));

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    db.Database.EnsureCreated();
    await SeedMockData.RunAsync(db, app.Configuration, app.Logger);
}

app.MapGet("/api/health", () => Results.Text("ok"));
app.MapReadings();

// The React app is built into wwwroot, so the API serves it from the same link.
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapFallbackToFile("index.html");

app.Run();
