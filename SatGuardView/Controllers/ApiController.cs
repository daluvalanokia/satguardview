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
    /// Cloud cover filtering is NOT applied server-side (matching original behavior).
    /// Supports SortBy for Live View (sort by datetime descending).
    /// </summary>
    [HttpPost("search")]
    public async Task<ActionResult<SearchResponse>> Search([FromBody] SearchRequest request)
    {
        if (request == null)
            return BadRequest(new SearchResponse { Error = "Request body is required" });

        var validationError = request.Validate();
        if (validationError != null)
            return BadRequest(new SearchResponse { Error = validationError });

        _logger.LogInformation("Search: bbox={Bbox}, source={Source}, dates={Start}-{End}, sort={Sort}",
            string.Join(",", request.Bbox!), request.SatelliteSource, request.StartDate, request.EndDate, request.SortBy);

        var result = await _searchService.SearchAsync(request);

        if (result.Error != null)
            return BadRequest(result);

        return Ok(result);
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
            var url = $"https://nominatim.openstreetmap.org/search?q={Uri.EscapeDataString(q.Trim())}&format=json&limit=5&addressdetails=1";
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

    [HttpGet("health")]
    public ActionResult<object> Health() => Ok(new { status = "healthy", service = "SatGuardView", timestamp = DateTime.UtcNow.ToString("O") });
}
