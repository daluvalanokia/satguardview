using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using SatGuardView.Models;

namespace SatGuardView.Services;

/// <summary>
/// Searches satellite imagery via the Element84 Earth Search STAC API.
/// Replicates the exact logic from the Base44 app's searchSatelliteImagery backend function.
/// </summary>
public class StacSearchService : IStacSearchService
{
    private readonly HttpClient _httpClient;
    private readonly StacApiSettings _settings;
    private readonly ILogger<StacSearchService> _logger;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    public StacSearchService(HttpClient httpClient, IOptions<StacApiSettings> settings, ILogger<StacSearchService> logger)
    {
        _httpClient = httpClient;
        _settings = settings.Value;
        _logger = logger;

        // FIX: Must use trailing slash in BaseAddress to avoid .NET URI resolution bug.
        var baseUrl = _settings.BaseUrl ?? "https://earth-search.aws.element84.com/v1";
        if (!baseUrl.EndsWith("/")) baseUrl += "/";

        _httpClient.BaseAddress = new Uri(baseUrl);
        _httpClient.DefaultRequestHeaders.Add("Accept", "application/json");
        _httpClient.Timeout = TimeSpan.FromSeconds(30);
    }

    public async Task<SearchResponse> SearchAsync(SearchRequest request)
    {
        var response = new SearchResponse();

        var validationError = request.Validate();
        if (validationError != null)
        {
            response.Error = validationError;
            return response;
        }

        var collection = string.IsNullOrEmpty(request.SatelliteSource)
            ? "sentinel-2-l2a"
            : request.SatelliteSource;

        var page = request.Page ?? 1;
        if (page < 1) page = 1;
        var limit = request.Limit ?? _settings.DefaultLimit;

        var searchPayload = new StacSearchPayload
        {
            Collections = new List<string> { collection },
            Bbox = request.Bbox!,
            Limit = limit,
            Page = page
        };

        var dateRange = request.GetDateTimeRange();
        if (!string.IsNullOrEmpty(dateRange))
        {
            searchPayload.Datetime = dateRange;
        }

        // Add server-side cloud cover filter if provided
        if (request.MaxCloudCover.HasValue)
        {
            searchPayload.Query = new Dictionary<string, StacQueryFilter>
            {
                ["eo:cloud_cover"] = new StacQueryFilter { Lte = request.MaxCloudCover.Value }
            };
        }

        // Add sorting if requested (used by Live View to get most recent imagery)
        var sortBy = request.SortBy;
        var sortOrder = !string.IsNullOrEmpty(request.SortOrder) ? request.SortOrder : "desc";

        if (!string.IsNullOrEmpty(sortBy))
        {
            searchPayload.Sort = new List<StacSort>
            {
                new() { Field = sortBy, Direction = sortOrder }
            };
        }

        try
        {
            _logger.LogInformation(
                "STAC search: collection={Collection}, bbox={Bbox}, datetime={Datetime}, cloudCover<={CloudCover}, page={Page}, limit={Limit}, sort={Sort} {Order}",
                collection, string.Join(",", request.Bbox!), dateRange ?? "none", request.MaxCloudCover?.ToString() ?? "none", page, limit, sortBy ?? "none", sortOrder);

            var apiResponse = await _httpClient.PostAsJsonAsync("search", searchPayload, JsonOpts);

            if (!apiResponse.IsSuccessStatusCode)
            {
                var errorContent = await apiResponse.Content.ReadAsStringAsync();
                _logger.LogError("STAC API returned {StatusCode}: {Error}", apiResponse.StatusCode, errorContent);
                response.Error = $"STAC API error: {apiResponse.StatusCode}";
                return response;
            }

            var stacResponse = await apiResponse.Content.ReadFromJsonAsync<StacResponse>(JsonOpts);

            if (stacResponse?.Features == null || stacResponse.Features.Count == 0)
            {
                response.Items = new List<SatelliteImageryItem>();
                response.Total = 0;
                response.HasMore = false;
                response.NextPage = null;
                return response;
            }

            response.Items = stacResponse.Features.Select(MapFeatureToItem).ToList();
            response.Total = stacResponse.NumberMatched > 0
                ? stacResponse.NumberMatched
                : response.Items.Count;

            response.HasMore = response.Total > (page * limit);
            response.NextPage = response.HasMore ? page + 1 : null;

            _logger.LogInformation("Found {Count} imagery items (total matched: {Total}, page: {Page}, hasMore: {HasMore})",
                response.Items.Count, response.Total, page, response.HasMore);

            return response;
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "HTTP error while searching STAC API");
            response.Error = $"Network error: {ex.Message}";
            return response;
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "JSON parsing error");
            response.Error = $"Data parsing error: {ex.Message}";
            return response;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error");
            response.Error = $"Unexpected error: {ex.Message}";
            return response;
        }
    }

    private static SatelliteImageryItem MapFeatureToItem(StacFeature feature)
    {
        var props = feature.Properties ?? new StacProperties();
        var assets = feature.Assets ?? new Dictionary<string, StacAsset>();

        string? thumbnailUrl = null;
        if (assets.TryGetValue("thumbnail", out var thumbAsset))
        {
            thumbnailUrl = thumbAsset.Href;
        }
        else if (!string.IsNullOrEmpty(feature.Id) && feature.Collection == "sentinel-2-l2a")
        {
            thumbnailUrl = ConstructSentinel2Thumbnail(feature.Id);
        }

        string? visualUrl = thumbnailUrl;

        string? tiffUrl = null;
        if (assets.TryGetValue("visual", out var visualAsset))
        {
            tiffUrl = visualAsset.Href;
        }

        return new SatelliteImageryItem
        {
            Id = feature.Id ?? string.Empty,
            Collection = feature.Collection ?? string.Empty,
            Bbox = feature.Bbox,
            Geometry = feature.Geometry != null
                ? new GeoJsonGeometry
                {
                    Type = feature.Geometry.Type ?? "Polygon",
                    Coordinates = feature.Geometry.Coordinates
                }
                : null,
            DateTime = props.DateTime,
            CloudCover = props.EoCloudCover,
            Platform = props.Platform,
            Constellation = props.Constellation,
            SunAzimuth = props.ViewSunAzimuth,
            SunElevation = props.ViewSunElevation,
            Instruments = props.Instruments,
            ProductId = feature.Id,
            Thumbnail = thumbnailUrl,
            VisualUrl = visualUrl,
            TiffUrl = tiffUrl
        };
    }

    private static string? ConstructSentinel2Thumbnail(string productId)
    {
        try
        {
            var parts = productId.Split('_');
            if (parts.Length < 4) return null;
            var tile = parts[1];
            var dateStr = parts[2];
            if (tile.Length < 3 || dateStr.Length < 6) return null;

            var mgrsTile = tile.Substring(0, 2);
            var latBand = tile[2];
            var square = tile.Length > 3 ? tile.Substring(3) : "";
            var year = dateStr.Substring(0, 4);
            var month = int.Parse(dateStr.Substring(4, 2));

            return $"https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/" +
                   $"{mgrsTile}/{latBand}/{square}/{year}/{month}/{productId}/preview.jpg";
        }
        catch { return null; }
    }
}

// ===== STAC API DTOs =====

internal class StacSearchPayload
{
    [JsonPropertyName("collections")] public List<string> Collections { get; set; } = new();
    [JsonPropertyName("bbox")] public double[] Bbox { get; set; } = Array.Empty<double>();
    [JsonPropertyName("datetime")] public string? Datetime { get; set; }
    [JsonPropertyName("limit")] public int Limit { get; set; } = 50;
    [JsonPropertyName("page")] public int? Page { get; set; }
    [JsonPropertyName("query")] public Dictionary<string, StacQueryFilter>? Query { get; set; }
    [JsonPropertyName("sort")] public List<StacSort>? Sort { get; set; }
}

internal class StacQueryFilter
{
    [JsonPropertyName("lte")] public double? Lte { get; set; }
}

internal class StacSort
{
    [JsonPropertyName("field")] public string Field { get; set; } = "datetime";
    [JsonPropertyName("direction")] public string Direction { get; set; } = "desc";
}

internal class StacResponse
{
    [JsonPropertyName("type")] public string? Type { get; set; }
    [JsonPropertyName("features")] public List<StacFeature> Features { get; set; } = new();
    [JsonPropertyName("numberReturned")] public int NumberReturned { get; set; }
    [JsonPropertyName("numberMatched")] public int NumberMatched { get; set; }
}

internal class StacFeature
{
    [JsonPropertyName("id")] public string? Id { get; set; }
    [JsonPropertyName("collection")] public string? Collection { get; set; }
    [JsonPropertyName("bbox")] public double[]? Bbox { get; set; }
    [JsonPropertyName("geometry")] public StacGeometry? Geometry { get; set; }
    [JsonPropertyName("properties")] public StacProperties? Properties { get; set; }
    [JsonPropertyName("assets")] public Dictionary<string, StacAsset>? Assets { get; set; }
}

internal class StacGeometry
{
    [JsonPropertyName("type")] public string? Type { get; set; }
    [JsonPropertyName("coordinates")] public object? Coordinates { get; set; }
}

internal class StacProperties
{
    [JsonPropertyName("datetime")] public string? DateTime { get; set; }
    [JsonPropertyName("eo:cloud_cover")] public double? EoCloudCover { get; set; }
    [JsonPropertyName("platform")] public string? Platform { get; set; }
    [JsonPropertyName("constellation")] public string? Constellation { get; set; }
    [JsonPropertyName("view:sun_azimuth")] public double? ViewSunAzimuth { get; set; }
    [JsonPropertyName("view:sun_elevation")] public double? ViewSunElevation { get; set; }
    [JsonPropertyName("instruments")] public List<string>? Instruments { get; set; }
}

internal class StacAsset
{
    [JsonPropertyName("href")] public string? Href { get; set; }
    [JsonPropertyName("type")] public string? Type { get; set; }
    [JsonPropertyName("title")] public string? Title { get; set; }
}
