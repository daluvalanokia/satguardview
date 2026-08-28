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
    private readonly ILogger<ApiController> _logger;

    public ApiController(
        IStacSearchService searchService,
        IGeoDataService geoDataService,
        ILogger<ApiController> logger)
    {
        _searchService = searchService;
        _geoDataService = geoDataService;
        _logger = logger;
    }

    /// <summary>
    /// Searches satellite imagery — replicates the Base44 searchSatelliteImagery function.
    /// Cloud cover filtering is NOT applied server-side (matching original behavior).
    /// </summary>
    [HttpPost("search")]
    public async Task<ActionResult<SearchResponse>> Search([FromBody] SearchRequest request)
    {
        if (request == null)
            return BadRequest(new SearchResponse { Error = "Request body is required" });

        var validationError = request.Validate();
        if (validationError != null)
            return BadRequest(new SearchResponse { Error = validationError });

        _logger.LogInformation("Search: bbox={Bbox}, source={Source}, dates={Start}-{End}",
            string.Join(",", request.Bbox!), request.SatelliteSource, request.StartDate, request.EndDate);

        var result = await _searchService.SearchAsync(request);

        if (result.Error != null)
            return BadRequest(result);

        return Ok(result);
    }

    [HttpGet("sources")]
    public ActionResult<List<SatelliteSource>> GetSources() => Ok(_geoDataService.GetSatelliteSources());

    [HttpGet("countries")]
    public ActionResult<List<Country>> GetCountries() => Ok(_geoDataService.GetCountries());

    [HttpGet("health")]
    public ActionResult<object> Health() => Ok(new { status = "healthy", service = "SatGuardView", timestamp = DateTime.UtcNow.ToString("O") });
}
