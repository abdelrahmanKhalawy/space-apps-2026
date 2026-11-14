using System.Net;
using System.Text.Json;
using SpaceApi.SpaceWeather;

namespace SpaceApi.Tests;

public class DonkiTests
{
    // A canned DONKI: answers by endpoint name, like api.nasa.gov/DONKI/FLR, /SEP, /GST.
    sealed class Canned(Func<string, (HttpStatusCode code, string body)> answer) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage req, CancellationToken ct)
        {
            var (code, body) = answer(req.RequestUri!.AbsolutePath);
            return Task.FromResult(new HttpResponseMessage(code) { Content = new StringContent(body) });
        }
    }

    const string Flares = """
        [{"flrID":"2026-11-10T06:27:00-FLR-001","beginTime":"2026-11-10T06:27Z","peakTime":"2026-11-10T06:40Z","classType":"M2.1"},
         {"flrID":"2026-11-12T01:00:00-FLR-001","beginTime":"2026-11-12T01:00Z","peakTime":"2026-11-12T01:12Z","classType":"X1.5"},
         {"flrID":"2026-11-11T01:00:00-FLR-001","beginTime":"2026-11-11T01:00Z","peakTime":"2026-11-11T01:12Z","classType":"C9.9"}]
        """;
    const string Particles = """[{"sepID":"2026-10-20T01:30:00-SEP-001","eventTime":"2026-10-20T01:30Z"},{"sepID":"2026-11-02T10:00:00-SEP-001","eventTime":"2026-11-02T10:00Z"}]""";
    const string Storms = """[{"gstID":"x","startTime":"2026-11-05T12:00Z","allKpIndex":[{"observedTime":"2026-11-05T15:00Z","kpIndex":5.33,"source":"NOAA"},{"observedTime":"2026-11-05T18:00Z","kpIndex":6.67,"source":"NOAA"}]}]""";

    [Fact]
    public async Task ParsesFlaresParticleEventsAndStorms()
    {
        var http = new HttpClient(new Canned(p => p.EndsWith("/FLR") ? (HttpStatusCode.OK, Flares) : p.EndsWith("/SEP") ? (HttpStatusCode.OK, Particles) : (HttpStatusCode.OK, Storms)));
        var n = await DonkiClient.Fetch(http, "KEY", new DateTime(2026, 11, 13, 0, 0, 0, DateTimeKind.Utc));
        Assert.NotNull(n);
        Assert.Equal(3, n!.FlaresLast7Days);
        Assert.Equal("X1.5", n.StrongestFlareClass); // X beats M beats C
        Assert.Equal("2026-11-12T01:12Z", n.StrongestFlarePeak);
        Assert.Equal(2, n.SolarParticleEventsLast30Days);
        Assert.Equal("2026-11-02T10:00Z", n.LastSolarParticleEvent);
        Assert.Equal(1, n.GeomagneticStormsLast30Days);
        Assert.Equal(6.67, n.MaxKpLast30Days);
    }

    [Fact]
    public async Task AnEmptyAnswerMeansZeroEventsNotAFailure()
    {
        var http = new HttpClient(new Canned(_ => (HttpStatusCode.OK, "")));   // DONKI sends an empty body when nothing happened
        var n = await DonkiClient.Fetch(http, "KEY", DateTime.UtcNow);
        Assert.NotNull(n);
        Assert.Equal(0, n!.FlaresLast7Days);
        Assert.Null(n.StrongestFlareClass);
    }

    [Fact]
    public async Task WhenNasaCannotBeReachedThereIsNoNasaLine()
    {
        var http = new HttpClient(new Canned(_ => (HttpStatusCode.TooManyRequests, "rate limited")));
        Assert.Null(await DonkiClient.Fetch(http, "DEMO_KEY", DateTime.UtcNow));
    }

    [Theory]
    [InlineData("X1.0", "M9.9")]
    [InlineData("M1.0", "C9.9")]
    [InlineData("C1.0", "B9.9")]
    [InlineData("M5.0", "M2.0")]
    public void FlareClassOrder(string stronger, string weaker) =>
        Assert.True(DonkiClient.FlareRank(stronger) > DonkiClient.FlareRank(weaker));

    [Fact]
    public void ParseToleratesOddShapes()
    {
        using var odd = JsonDocument.Parse("""{"unexpected":"object"}""");
        var n = DonkiClient.Parse(odd, odd, odd);
        Assert.Equal(0, n.FlaresLast7Days);
    }
}
