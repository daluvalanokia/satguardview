namespace SatGuardView.Services;

public class StacApiSettings
{
    public string BaseUrl { get; set; } = "https://earth-search.aws.element84.com/v1";
    public int DefaultLimit { get; set; } = 50;
    public int MaxLimit { get; set; } = 500;
}
