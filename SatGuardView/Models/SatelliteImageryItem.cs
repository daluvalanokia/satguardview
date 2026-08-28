using System.Text.Json.Serialization;

namespace SatGuardView.Models;

public class SatelliteImageryItem
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("collection")]
    public string Collection { get; set; } = string.Empty;

    [JsonPropertyName("bbox")]
    public double[]? Bbox { get; set; }

    [JsonPropertyName("geometry")]
    public GeoJsonGeometry? Geometry { get; set; }

    [JsonPropertyName("datetime")]
    public string? DateTime { get; set; }

    [JsonPropertyName("cloudCover")]
    public double? CloudCover { get; set; }

    [JsonPropertyName("platform")]
    public string? Platform { get; set; }

    [JsonPropertyName("constellation")]
    public string? Constellation { get; set; }

    [JsonPropertyName("sunAzimuth")]
    public double? SunAzimuth { get; set; }

    [JsonPropertyName("sunElevation")]
    public double? SunElevation { get; set; }

    [JsonPropertyName("instruments")]
    public List<string>? Instruments { get; set; }

    [JsonPropertyName("productId")]
    public string? ProductId { get; set; }

    [JsonPropertyName("thumbnail")]
    public string? Thumbnail { get; set; }

    [JsonPropertyName("visualUrl")]
    public string? VisualUrl { get; set; }

    [JsonPropertyName("tiffUrl")]
    public string? TiffUrl { get; set; }
}

public class GeoJsonGeometry
{
    [JsonPropertyName("type")]
    public string Type { get; set; } = "Polygon";

    [JsonPropertyName("coordinates")]
    public object? Coordinates { get; set; }
}
