using SatGuardView.Models;

namespace SatGuardView.Services;

public interface IStacSearchService
{
    Task<SearchResponse> SearchAsync(SearchRequest request);
}
