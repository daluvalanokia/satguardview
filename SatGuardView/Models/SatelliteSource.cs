using System.Text.Json.Serialization;

namespace SatGuardView.Models;

public class SatelliteSource
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("description")]
    public string Description { get; set; } = string.Empty;

    [JsonPropertyName("resolution")]
    public string Resolution { get; set; } = string.Empty;

    [JsonPropertyName("displayLabel")]
    public string DisplayLabel { get; set; } = string.Empty;

    public static List<SatelliteSource> GetAll()
    {
        return new List<SatelliteSource>
        {
            new() { Id = "sentinel-2-l2a", Name = "Sentinel-2 Level-2A", Description = "Global Sentinel-2 data from the Multispectral Instrument (MSI). Surface reflectance, atmospherically corrected.", Resolution = "10m", DisplayLabel = "Sentinel-2 L2A — 10m" },
            new() { Id = "sentinel-2-c1-l2a", Name = "Sentinel-2 Collection 1 Level-2A", Description = "Sentinel-2 Collection 1 Level-2A.", Resolution = "10m", DisplayLabel = "Sentinel-2 C1 L2A — 10m" },
            new() { Id = "sentinel-2-l1c", Name = "Sentinel-2 Level-1C", Description = "Top-of-atmosphere reflectance.", Resolution = "10m", DisplayLabel = "Sentinel-2 L1C — 10m" },
            new() { Id = "sentinel-2-pre-c1-l2a", Name = "Sentinel-2 Pre-Collection 1 Level-2A", Description = "Sentinel-2 Pre-Collection 1 Level-2A (baseline < 05.00).", Resolution = "10m", DisplayLabel = "Sentinel-2 Pre-C1 L2A — 10m" },
            new() { Id = "landsat-c2-l2", Name = "Landsat Collection 2 Level-2", Description = "Atmospherically corrected global Landsat Collection 2 Level-2 data.", Resolution = "30m", DisplayLabel = "Landsat C2 L2 — 30m" },
            new() { Id = "sentinel-1-grd", Name = "Sentinel-1 Level-1C GRD", Description = "Sentinel-1 SAR imaging satellites. Ground Range Detected products.", Resolution = "10m", DisplayLabel = "Sentinel-1 GRD — 10m" },
            new() { Id = "naip", Name = "NAIP: National Agriculture Imagery Program", Description = "Aerial imagery during agricultural growing seasons in the continental U.S.", Resolution = "1m", DisplayLabel = "NAIP — 1m" },
            new() { Id = "cop-dem-glo-30", Name = "Copernicus DEM GLO-30", Description = "Digital Surface Model representing the surface of the Earth.", Resolution = "30m", DisplayLabel = "Copernicus DEM GLO-30" },
            new() { Id = "cop-dem-glo-90", Name = "Copernicus DEM GLO-90", Description = "Copernicus DEM at 90m resolution.", Resolution = "90m", DisplayLabel = "Copernicus DEM GLO-90" }
        };
    }
}
