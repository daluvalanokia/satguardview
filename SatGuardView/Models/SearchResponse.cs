using System.Text.Json.Serialization;

namespace SatGuardView.Models;

/// <summary>
/// Search response matching the Base44 backend function format.
/// Uses "total" (not "totalCount") to match the original app.
/// </summary>
public class SearchResponse
{
    [JsonPropertyName("items")]
    public List<SatelliteImageryItem> Items { get; set; } = new();

    [JsonPropertyName("total")]
    public int Total { get; set; }

    [JsonPropertyName("error")]
    public string? Error { get; set; }
}
