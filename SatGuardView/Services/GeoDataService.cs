using SatGuardView.Models;

namespace SatGuardView.Services;

public class GeoDataService : IGeoDataService
{
    public List<Country> GetCountries() => Country.GetAll();
    public List<SatelliteSource> GetSatelliteSources() => SatelliteSource.GetAll();
}
