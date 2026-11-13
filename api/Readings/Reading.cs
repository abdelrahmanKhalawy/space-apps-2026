namespace SpaceApi.Readings;

public class Reading
{
    public int Id { get; set; }
    public string CrewId { get; set; } = "";
    public string Metric { get; set; } = "";
    public double Value { get; set; }
    public string Unit { get; set; } = "";
    public DateTime TakenAt { get; set; } // always UTC
    public string Source { get; set; } = "";
}
