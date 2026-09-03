using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using SatGuardView.Models;
using SatGuardView.Services;

namespace SatGuardView.Controllers;

[ApiController]
[Route("api")]
public class ApiController : ControllerBase
{
    private readonly IStacSearchService _searchService;
    private readonly IGeoDataService _geoDataService;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<ApiController> _logger;

    public ApiController(
        IStacSearchService searchService,
        IGeoDataService geoDataService,
        IHttpClientFactory httpClientFactory,
        ILogger<ApiController> logger)
    {
        _searchService = searchService;
        _geoDataService = geoDataService;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    /// <summary>
    /// Searches satellite imagery — replicates the Base44 searchSatelliteImagery function.
    /// Server-side cloud cover filtering, pagination, and sorting are supported.
    /// </summary>
    [HttpPost("search")]
    public async Task<ActionResult<SearchResponse>> Search([FromBody] SearchRequest request)
    {
        if (request == null)
            return BadRequest(new SearchResponse { Error = "Request body is required" });

        var validationError = request.Validate();
        if (validationError != null)
            return BadRequest(new SearchResponse { Error = validationError });

        _logger.LogInformation("Search: bbox={Bbox}, source={Source}, dates={Start}-{End}, sort={Sort} {Order}, page={Page}",
            string.Join(",", request.Bbox!), request.SatelliteSource, request.StartDate, request.EndDate, request.SortBy, request.SortOrder, request.Page);

        var result = await _searchService.SearchAsync(request);

        if (result.Error != null)
            return BadRequest(result);

        return Ok(result);
    }

    /// <summary>
    /// Gets directional views for satellite imagery (North, South, East, West).
    /// </summary>
    [HttpGet("directional-views")]
    public ActionResult<List<DirectionalView>> GetDirectionalViews() => Ok(DirectionalView.GetAll());

    /// <summary>
    /// Exports satellite imagery search results in CSV or GeoJSON format.
    /// Accepts search parameters as query strings.
    /// </summary>
    [HttpGet("export")]
    public async Task<IActionResult> Export(
        [FromQuery] string? bbox,
        [FromQuery] string? satelliteSource,
        [FromQuery] string? startDate,
        [FromQuery] string? endDate,
        [FromQuery] double? maxCloudCover,
        [FromQuery] int? limit,
        [FromQuery] int? page,
        [FromQuery] string? sortBy,
        [FromQuery] string? sortOrder,
        [FromQuery] string format = "csv")
    {
        var parsedBbox = ParseBboxFromQuery(Request.Query);
        var searchReq = new SearchRequest
        {
            Bbox = parsedBbox,
            SatelliteSource = satelliteSource,
            StartDate = startDate,
            EndDate = endDate,
            MaxCloudCover = maxCloudCover,
            Limit = limit,
            Page = page,
            SortBy = sortBy,
            SortOrder = sortOrder
        };

        var validationError = searchReq.Validate();
        if (validationError != null)
            return BadRequest(new { error = validationError });

        var result = await _searchService.SearchAsync(searchReq);
        if (result.Error != null)
            return BadRequest(new { error = result.Error });

        var fmt = format?.Trim().ToLowerInvariant() ?? "csv";

        if (fmt == "csv")
        {
            var csvContent = ExportToCsv(result.Items);
            return Content(csvContent, "text/csv");
        }
        else if (fmt == "geojson")
        {
            var geoJsonContent = ExportToGeoJson(result.Items);
            return Content(geoJsonContent, "application/geo+json");
        }

        return BadRequest(new { error = "Unsupported format. Use 'csv' or 'geojson'." });
    }

    /// <summary>
    /// Geocodes a city/place name using OpenStreetMap Nominatim API.
    /// Returns coordinates and bounding box for the search area.
    /// </summary>
    [HttpGet("geocode")]
    public async Task<ActionResult> Geocode([FromQuery] string q)
    {
        if (string.IsNullOrWhiteSpace(q) || q.Trim().Length < 2)
            return BadRequest(new { error = "Query must be at least 2 characters" });

        try
        {
            var client = _httpClientFactory.CreateClient("Geocoding");
            var url = $"https://nominatim.openstreetmap.org/search?q={Uri.EscapeDataString(q.Trim())}&format=json&limit=5&addressdetails=1&accept-language=en";
            var response = await client.GetAsync(url);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("Geocoding failed: {StatusCode}", response.StatusCode);
                return BadRequest(new { error = "Geocoding service unavailable" });
            }

            var content = await response.Content.ReadAsStringAsync();
            return Content(content, "application/json");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Geocoding error");
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpGet("sources")]
    public ActionResult<List<SatelliteSource>> GetSources() => Ok(_geoDataService.GetSatelliteSources());

    [HttpGet("countries")]
    public ActionResult<List<Country>> GetCountries() => Ok(_geoDataService.GetCountries());

    /// <summary>
    /// Autocomplete city names for a given country (incremental search).
    /// Uses Nominatim with accept-language=en for English results.
    /// </summary>
    [HttpGet("cities")]
    public async Task<ActionResult> SearchCities([FromQuery] string q, [FromQuery] string? country = null)
    {
        if (string.IsNullOrWhiteSpace(q) || q.Trim().Length < 2)
            return Ok(new List<object>());

        try
        {
            var client = _httpClientFactory.CreateClient("Geocoding");
            var countryCode = string.IsNullOrWhiteSpace(country) ? "" : $"&countrycodes={Uri.EscapeDataString(country.Trim().ToLowerInvariant())}";
            var url = $"https://nominatim.openstreetmap.org/search?q={Uri.EscapeDataString(q.Trim())}{countryCode}&format=json&limit=8&addressdetails=1&accept-language=en&featureClass=P";
            var response = await client.GetAsync(url);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("City autocomplete failed: {StatusCode}", response.StatusCode);
                return Ok(new List<object>());
            }

            var content = await response.Content.ReadAsStringAsync();
            return Content(content, "application/json");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "City autocomplete error");
            return Ok(new List<object>());
        }
    }

    [HttpGet("health")]
    public ActionResult<object> Health() => Ok(new { status = "healthy", service = "SatGuardView", timestamp = DateTime.UtcNow.ToString("O") });

    private static double[]? ParseBboxFromQuery(IQueryCollection query)
    {
        if (!query.TryGetValue("bbox", out var values) || values.Count == 0)
            return null;

        if (values.Count == 4)
        {
            var result = new double[4];
            for (int i = 0; i < 4; i++)
            {
                if (!double.TryParse(values[i], System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out result[i]))
                    return null;
            }
            return result;
        }

        var firstVal = values[0];
        if (!string.IsNullOrWhiteSpace(firstVal))
        {
            var parts = firstVal.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            if (parts.Length == 4)
            {
                var result = new double[4];
                for (int i = 0; i < 4; i++)
                {
                    if (!double.TryParse(parts[i], System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out result[i]))
                        return null;
                }
                return result;
            }
        }

        return null;
    }

    private static string ExportToCsv(List<SatelliteImageryItem> items)
    {
        var sb = new System.Text.StringBuilder();
        sb.AppendLine("id,collection,datetime,cloudCover,platform,bbox");

        foreach (var item in items)
        {
            var id = EscapeCsvField(item.Id);
            var collection = EscapeCsvField(item.Collection);
            var dt = EscapeCsvField(item.DateTime ?? "");
            var cloudCover = item.CloudCover?.ToString(System.Globalization.CultureInfo.InvariantCulture) ?? "";
            var platform = EscapeCsvField(item.Platform ?? "");
            var bboxStr = item.Bbox != null
                ? $"\"{string.Join(",", item.Bbox.Select(b => b.ToString(System.Globalization.CultureInfo.InvariantCulture)))}\""
                : "";

            sb.AppendLine($"{id},{collection},{dt},{cloudCover},{platform},{bboxStr}");
        }

        return sb.ToString();
    }

    private static string EscapeCsvField(string field)
    {
        if (string.IsNullOrEmpty(field)) return "";
        if (field.Contains(',') || field.Contains('"') || field.Contains('\n') || field.Contains('\r'))
        {
            return $"\"{field.Replace("\"", "\"\"")}\"";
        }
        return field;
    }

    private static string ExportToGeoJson(List<SatelliteImageryItem> items)
    {
        var features = items.Select(item => new
        {
            type = "Feature",
            id = item.Id,
            bbox = item.Bbox,
            geometry = item.Geometry != null ? (object)item.Geometry : (item.Bbox != null && item.Bbox.Length == 4 ? new
            {
                type = "Polygon",
                coordinates = new double[][][]
                {
                    new double[][]
                    {
                        new double[] { item.Bbox[0], item.Bbox[1] },
                        new double[] { item.Bbox[2], item.Bbox[1] },
                        new double[] { item.Bbox[2], item.Bbox[3] },
                        new double[] { item.Bbox[0], item.Bbox[3] },
                        new double[] { item.Bbox[0], item.Bbox[1] }
                    }
                }
            } : null),
            properties = new
            {
                id = item.Id,
                collection = item.Collection,
                datetime = item.DateTime,
                cloudCover = item.CloudCover,
                platform = item.Platform,
                constellation = item.Constellation,
                sunAzimuth = item.SunAzimuth,
                sunElevation = item.SunElevation,
                instruments = item.Instruments,
                productId = item.ProductId,
                thumbnail = item.Thumbnail,
                visualUrl = item.VisualUrl,
                tiffUrl = item.TiffUrl
            }
        }).ToList();

        var featureCollection = new
        {
            type = "FeatureCollection",
            features
        };

        return JsonSerializer.Serialize(featureCollection, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
            WriteIndented = true
        });
    }
}
