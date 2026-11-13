using Microsoft.EntityFrameworkCore;
using SpaceApi.Insights;
using SpaceApi.Live;
using SpaceApi.Readings;
using SpaceApi.Reports;

var builder = WebApplication.CreateBuilder(args);

// SQLite file. On Azure only /home survives a restart (WEBSITE_SITE_NAME is set there).
var dataDir = builder.Configuration["Db:Dir"]
    ?? (Environment.GetEnvironmentVariable("WEBSITE_SITE_NAME") is not null
        ? "/home/data"
        : Path.Combine(AppContext.BaseDirectory, "data"));
Directory.CreateDirectory(dataDir);
builder.Services.AddDbContext<AppDb>(o => o.UseSqlite($"Data Source={Path.Combine(dataDir, "space.db")}"));

// Color rules come from research/thresholds.json (copied next to the app on build/publish).
var thresholdsPath = builder.Configuration["Thresholds:Path"]
    ?? Path.Combine(AppContext.BaseDirectory, "SeedData", "thresholds.json");
builder.Services.AddSingleton(sp => Thresholds.Load(thresholdsPath, sp.GetRequiredService<ILoggerFactory>().CreateLogger("Thresholds")));
builder.Services.AddSingleton<DemoClock>(); // the clock report delays run on (the demo can skip ahead)
builder.Services.AddSignalR();

var app = builder.Build();
app.Services.GetRequiredService<Thresholds>(); // load now, so a bad file is logged at startup

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    db.Database.EnsureCreated();
    ReportEndpoints.EnsureTable(db); // older databases do not have the reports table yet
    await SeedMockData.RunAsync(db, app.Configuration, app.Logger);
}

app.MapGet("/api/health", () => Results.Text("ok"));
app.MapReadings();
app.MapReports();
app.MapExplain();
app.MapForecast();
app.MapHub<ReadingsHub>("/hubs/readings");

// The React app is built into wwwroot, so the API serves it from the same link.
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapFallbackToFile("index.html");

app.Run();
