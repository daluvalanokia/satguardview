using System.Text.Json.Serialization;

namespace SatGuardView.Models;

public class SearchRequest
{
    [JsonPropertyName("bbox")]
    public double[]? Bbox { get; set; }

    [JsonPropertyName("satelliteSource")]
    public string? SatelliteSource { get; set; }

    [JsonPropertyName("startDate")]
    public string? StartDate { get; set; }

    [JsonPropertyName("endDate")]
    public string? EndDate { get; set; }

    [JsonPropertyName("maxCloudCover")]
    public double? MaxCloudCover { get; set; }

    [JsonPropertyName("limit")]
    public int? Limit { get; set; }

    public string? Validate()
    {
        if (Bbox == null || Bbox.Length != 4)
            return "bbox is required as [minLon, minLat, maxLon, maxLat]";
        if (Bbox[0] < -180 || Bbox[0] > 180 || Bbox[2] < -180 || Bbox[2] > 180)
            return "Longitude must be between -180 and 180";
        if (Bbox[1] < -90 || Bbox[1] > 90 || Bbox[3] < -90 || Bbox[3] > 90)
            return "Latitude must be between -90 and 90";
        if (Bbox[0] >= Bbox[2]) return "minLon must be less than maxLon";
        if (Bbox[1] >= Bbox[3]) return "minLat must be less than maxLat";
        return null;
    }

    public string? GetDateTimeRange()
    {
        if (!string.IsNullOrEmpty(StartDate) && !string.IsNullOrEmpty(EndDate))
            return $"{StartDate}/{EndDate}";
        if (!string.IsNullOrEmpty(StartDate)) return $"{StartDate}/..";
        if (!string.IsNullOrEmpty(EndDate)) return $"../{EndDate}";
        return null;
    }
}
