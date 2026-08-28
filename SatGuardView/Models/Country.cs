using System.Text.Json.Serialization;

namespace SatGuardView.Models;

public class Country
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("code")]
    public string Code { get; set; } = string.Empty;

    [JsonPropertyName("bbox")]
    public double[] Bbox { get; set; } = new double[4];

    /// <summary>
    /// Returns all countries and regions sorted alphabetically by name (ascending).
    /// </summary>
    public static List<Country> GetAll()
    {
        var countries = new List<Country>
        {
            new() { Name = "Africa", Code = "AF", Bbox = [-18.0, -35.0, 52.0, 38.0] },
            new() { Name = "Algeria", Code = "DZ", Bbox = [-8.7, 18.9, 12.0, 37.1] },
            new() { Name = "Antarctica", Code = "AQ", Bbox = [-180.0, -90.0, 180.0, -60.0] },
            new() { Name = "Argentina", Code = "AR", Bbox = [-73.6, -55.1, -53.6, -21.8] },
            new() { Name = "Arctic", Code = "AR2", Bbox = [-180.0, 66.5, 180.0, 90.0] },
            new() { Name = "Asia", Code = "AS", Bbox = [25.0, -10.0, 180.0, 60.0] },
            new() { Name = "Australia", Code = "AU", Bbox = [113.3, -43.6, 153.6, -10.7] },
            new() { Name = "Austria", Code = "AT", Bbox = [9.5, 46.4, 17.2, 49.0] },
            new() { Name = "Bangladesh", Code = "BD", Bbox = [88.0, 20.5, 92.7, 26.7] },
            new() { Name = "Belgium", Code = "BE", Bbox = [2.5, 49.5, 6.4, 51.5] },
            new() { Name = "Brazil", Code = "BR", Bbox = [-73.9, -33.8, -32.4, 5.3] },
            new() { Name = "Bulgaria", Code = "BG", Bbox = [22.4, 41.2, 28.6, 44.2] },
            new() { Name = "Canada", Code = "CA", Bbox = [-141.0, 41.7, -52.6, 83.1] },
            new() { Name = "Caribbean", Code = "CR", Bbox = [-85.0, 10.0, -60.0, 24.0] },
            new() { Name = "Central America", Code = "CA2", Bbox = [-94.0, 7.0, -77.0, 18.0] },
            new() { Name = "Chile", Code = "CL", Bbox = [-75.7, -56.0, -66.4, -17.5] },
            new() { Name = "China", Code = "CN", Bbox = [73.5, 18.0, 135.1, 53.6] },
            new() { Name = "Colombia", Code = "CO", Bbox = [-81.7, -4.2, -66.8, 13.4] },
            new() { Name = "Croatia", Code = "HR", Bbox = [13.5, 42.4, 19.4, 46.6] },
            new() { Name = "Czech Republic", Code = "CZ", Bbox = [12.1, 48.5, 18.9, 51.1] },
            new() { Name = "Denmark", Code = "DK", Bbox = [8.1, 54.6, 15.2, 57.7] },
            new() { Name = "Egypt", Code = "EG", Bbox = [24.7, 22.0, 37.0, 31.7] },
            new() { Name = "Europe", Code = "EU", Bbox = [-10.0, 35.0, 30.0, 60.0] },
            new() { Name = "Finland", Code = "FI", Bbox = [19.2, 59.8, 31.6, 70.1] },
            new() { Name = "France", Code = "FR", Bbox = [-5.1, 41.3, 9.6, 51.1] },
            new() { Name = "Germany", Code = "DE", Bbox = [5.9, 47.3, 15.0, 55.1] },
            new() { Name = "Greece", Code = "GR", Bbox = [19.6, 34.8, 28.3, 41.8] },
            new() { Name = "Himalayas", Code = "HM", Bbox = [73.0, 27.0, 95.0, 37.0] },
            new() { Name = "Hungary", Code = "HU", Bbox = [16.1, 45.7, 22.9, 48.6] },
            new() { Name = "India", Code = "IN", Bbox = [68.1, 6.7, 97.4, 35.7] },
            new() { Name = "Indonesia", Code = "ID", Bbox = [95.0, -11.0, 141.0, 6.1] },
            new() { Name = "Iran", Code = "IR", Bbox = [44.0, 25.1, 63.3, 39.8] },
            new() { Name = "Iraq", Code = "IQ", Bbox = [38.8, 29.1, 48.6, 37.4] },
            new() { Name = "Ireland", Code = "IE", Bbox = [-10.7, 51.4, -5.3, 55.4] },
            new() { Name = "Israel", Code = "IL", Bbox = [34.2, 29.5, 35.9, 33.4] },
            new() { Name = "Italy", Code = "IT", Bbox = [6.6, 35.5, 18.8, 47.1] },
            new() { Name = "Japan", Code = "JP", Bbox = [129.4, 31.0, 146.0, 46.0] },
            new() { Name = "Kenya", Code = "KE", Bbox = [33.9, -4.9, 41.9, 4.6] },
            new() { Name = "Malaysia", Code = "MY", Bbox = [99.6, 0.8, 119.3, 7.6] },
            new() { Name = "Mediterranean", Code = "MD", Bbox = [-6.0, 30.0, 36.0, 46.0] },
            new() { Name = "Mexico", Code = "MX", Bbox = [-117.1, 14.5, -86.7, 32.7] },
            new() { Name = "Middle East", Code = "ME", Bbox = [25.0, 12.0, 63.0, 42.0] },
            new() { Name = "Morocco", Code = "MA", Bbox = [-13.2, 27.7, -1.0, 35.9] },
            new() { Name = "Nepal", Code = "NP", Bbox = [80.06, 26.34, 88.20, 30.45] },
            new() { Name = "Netherlands", Code = "NL", Bbox = [3.3, 50.8, 7.1, 53.5] },
            new() { Name = "New Zealand", Code = "NZ", Bbox = [166.4, -47.3, 178.6, -34.4] },
            new() { Name = "Nigeria", Code = "NG", Bbox = [2.7, 4.2, 14.7, 13.9] },
            new() { Name = "North America", Code = "NA", Bbox = [-170.0, 14.5, -52.0, 83.0] },
            new() { Name = "Norway", Code = "NO", Bbox = [4.6, 57.9, 31.3, 71.2] },
            new() { Name = "Oceania", Code = "OC", Bbox = [110.0, -47.0, 180.0, 0.0] },
            new() { Name = "Pakistan", Code = "PK", Bbox = [60.9, 23.5, 77.8, 37.1] },
            new() { Name = "Peru", Code = "PE", Bbox = [-81.3, -18.3, -68.4, 0.0] },
            new() { Name = "Philippines", Code = "PH", Bbox = [116.9, 4.5, 126.6, 21.1] },
            new() { Name = "Poland", Code = "PL", Bbox = [14.1, 49.0, 24.1, 54.8] },
            new() { Name = "Portugal", Code = "PT", Bbox = [-9.5, 36.9, -6.2, 42.2] },
            new() { Name = "Romania", Code = "RO", Bbox = [20.3, 43.6, 29.7, 48.3] },
            new() { Name = "Russia", Code = "RU", Bbox = [19.0, 41.0, 180.0, 78.0] },
            new() { Name = "Sahara Desert", Code = "SH", Bbox = [-17.0, 15.0, 40.0, 30.0] },
            new() { Name = "Saudi Arabia", Code = "SA", Bbox = [34.5, 16.3, 55.7, 32.2] },
            new() { Name = "Scandinavia", Code = "SC", Bbox = [4.0, 55.0, 32.0, 72.0] },
            new() { Name = "Singapore", Code = "SG", Bbox = [103.6, 1.2, 104.0, 1.5] },
            new() { Name = "South Africa", Code = "ZA", Bbox = [16.5, -34.8, 32.9, -22.1] },
            new() { Name = "South America", Code = "SA2", Bbox = [-82.0, -56.0, -34.0, 13.0] },
            new() { Name = "South Korea", Code = "KR", Bbox = [124.6, 33.2, 131.9, 38.9] },
            new() { Name = "Southeast Asia", Code = "SEA", Bbox = [92.0, -10.0, 142.0, 28.0] },
            new() { Name = "Spain", Code = "ES", Bbox = [-9.4, 35.9, 4.3, 43.8] },
            new() { Name = "Sweden", Code = "SE", Bbox = [11.0, 55.3, 24.2, 69.1] },
            new() { Name = "Switzerland", Code = "CH", Bbox = [5.9, 45.8, 10.5, 47.8] },
            new() { Name = "Thailand", Code = "TH", Bbox = [97.3, 5.6, 105.6, 20.5] },
            new() { Name = "Turkey", Code = "TR", Bbox = [26.0, 35.8, 45.0, 42.1] },
            new() { Name = "Ukraine", Code = "UA", Bbox = [22.1, 44.4, 40.2, 52.4] },
            new() { Name = "United Arab Emirates", Code = "AE", Bbox = [51.5, 22.6, 56.5, 26.1] },
            new() { Name = "United Kingdom", Code = "GB", Bbox = [-8.2, 49.9, 1.8, 60.9] },
            new() { Name = "United States (Contiguous)", Code = "US", Bbox = [-125.0, 24.4, -66.5, 49.4] },
            new() { Name = "Vietnam", Code = "VN", Bbox = [102.1, 8.2, 114.3, 23.4] },
            new() { Name = "Amazon Basin", Code = "AM", Bbox = [-75.0, -15.0, -45.0, 2.0] }
        };

        // Sort alphabetically by name (ascending)
        return countries.OrderBy(c => c.Name).ToList();
    }
}
