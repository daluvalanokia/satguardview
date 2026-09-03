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

    [JsonPropertyName("page")]
    public int? Page { get; set; }

    /// <summary>
    /// Sort by field (e.g., "datetime" for sorting by date descending).
    /// Used by Live View to fetch the most recent imagery.
    /// </summary>
    [JsonPropertyName("sortBy")]
    public string? SortBy { get; set; }

    /// <summary>
    /// Sort order ("asc" or "desc", default "desc").
    /// </summary>
    [JsonPropertyName("sortOrder")]
    public string? SortOrder { get; set; }

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
        if (Limit.HasValue && (Limit.Value < 1 || Limit.Value > 1000))
            return "Limit must be between 1 and 1000";
        if (Page.HasValue && Page.Value < 1)
            return "Page must be at least 1";
        return null;
    }

    /// <summary>
    /// Builds an RFC3339-compliant datetime interval for the STAC API.
    /// The Element84 STAC API rejects date-only strings (e.g. "2026-05-31/2026-08-29")
    /// with "datetime value is invalid, does not match RFC3339 format" — it requires
    /// a full timestamp with time and timezone (e.g. "2026-05-31T00:00:00Z/2026-08-29T23:59:59Z").
    /// </summary>
    public string? GetDateTimeRange()
    {
        var start = ToRfc3339Start(StartDate);
        var end = ToRfc3339End(EndDate);

        if (start != null && end != null) return $"{start}/{end}";
        if (start != null) return $"{start}/..";
        if (end != null) return $"../{end}";
        return null;
    }

    private static string? ToRfc3339Start(string? date)
    {
        if (string.IsNullOrWhiteSpace(date)) return null;
        var d = date.Trim();
        // Already has a time component
        if (d.Contains('T')) return d.EndsWith("Z") || d.Contains('+') ? d : d + "Z";
        return $"{d}T00:00:00Z";
    }

    private static string? ToRfc3339End(string? date)
    {
        if (string.IsNullOrWhiteSpace(date)) return null;
        var d = date.Trim();
        if (d.Contains('T')) return d.EndsWith("Z") || d.Contains('+') ? d : d + "Z";
        return $"{d}T23:59:59Z";
    }
}
