using System.Text.Json.Serialization;

namespace SatGuardView.Models;

public class DirectionalView
{
    [JsonPropertyName("id")] public string Id { get; set; } = string.Empty;
    [JsonPropertyName("label")] public string Label { get; set; } = string.Empty;
    [JsonPropertyName("gibsLayer")] public string GibsLayer { get; set; } = string.Empty;
    [JsonPropertyName("description")] public string Description { get; set; } = string.Empty;
    [JsonPropertyName("resolution")] public string Resolution { get; set; } = string.Empty;
    [JsonPropertyName("satellite")] public string Satellite { get; set; } = string.Empty;
    [JsonPropertyName("icon")] public string Icon { get; set; } = string.Empty;

    public static List<DirectionalView> GetAll()
    {
        return new List<DirectionalView>
        {
            new() { Id = "north", Label = "North View", GibsLayer = "MODIS_Terra_CorrectedReflectance_TrueColor", Satellite = "MODIS Terra", Description = "Descending pass ~10:30 AM local time, northward viewing", Resolution = "250m", Icon = "north" },
            new() { Id = "south", Label = "South View", GibsLayer = "MODIS_Aqua_CorrectedReflectance_TrueColor", Satellite = "MODIS Aqua", Description = "Ascending pass ~1:30 PM local time, southward viewing", Resolution = "250m", Icon = "south" },
            new() { Id = "east", Label = "East View", GibsLayer = "VIIRS_SNPP_CorrectedReflectance_TrueColor", Satellite = "Suomi NPP VIIRS", Description = "Early afternoon pass, eastward viewing", Resolution = "375m", Icon = "east" },
            new() { Id = "west", Label = "West View", GibsLayer = "VIIRS_NOAA20_CorrectedReflectance_TrueColor", Satellite = "NOAA-20 VIIRS", Description = "Afternoon pass, westward viewing", Resolution = "375m", Icon = "west" },
        };
    }
}
