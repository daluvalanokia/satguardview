using SatGuardView.Models;

namespace SatGuardView.Services;

public interface IGeoDataService
{
    List<Country> GetCountries();
    List<SatelliteSource> GetSatelliteSources();
}
