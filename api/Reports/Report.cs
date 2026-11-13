namespace SpaceApi.Reports;

/// <summary>A health report the crew sent to the ground. Times are always UTC.</summary>
public class Report
{
    public int Id { get; set; }
    public string CrewId { get; set; } = "";
    public string Mission { get; set; } = "";
    public string Severity { get; set; } = "";
    public string Summary { get; set; } = "";
    public string Metrics { get; set; } = ""; // metric names, comma separated
    public DateTime SentAt { get; set; }
    public DateTime DeliverAt { get; set; }      // when it reaches Earth
    public DateTime ReplyEarliestAt { get; set; } // the soonest an answer could be back
}
