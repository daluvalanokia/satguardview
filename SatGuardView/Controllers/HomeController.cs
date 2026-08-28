using Microsoft.AspNetCore.Mvc;
using SatGuardView.Services;

namespace SatGuardView.Controllers;

public class HomeController : Controller
{
    private readonly IGeoDataService _geoDataService;

    public HomeController(IGeoDataService geoDataService)
    {
        _geoDataService = geoDataService;
    }

    public IActionResult Index()
    {
        ViewBag.Countries = _geoDataService.GetCountries();
        ViewBag.SatelliteSources = _geoDataService.GetSatelliteSources();
        return View();
    }

    [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
    public IActionResult Error() => View();
}
