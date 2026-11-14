namespace SpaceApi.Reports;

/// <summary>The ground doctor's answer to a crew report. It crosses the same signal delay going back. Times are UTC.</summary>
public class Reply
{
    public int Id { get; set; }
    public int ReportId { get; set; }
    public string CrewId { get; set; } = "";
    public string Text { get; set; } = "";
    public DateTime SentAt { get; set; }    // when the doctor sent it
    public DateTime DeliverAt { get; set; } // when it reaches the crew
}
