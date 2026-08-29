using SatGuardView.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllersWithViews();
builder.Services.AddHttpClient<IStacSearchService, StacSearchService>();
builder.Services.AddHttpClient("Geocoding", client =>
{
    client.DefaultRequestHeaders.Add("User-Agent", "SatGuardView/1.0");
    client.Timeout = TimeSpan.FromSeconds(10);
});
builder.Services.AddSingleton<IGeoDataService, GeoDataService>();
builder.Services.Configure<StacApiSettings>(builder.Configuration.GetSection("StacApi"));

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.UseStaticFiles();
app.UseRouting();
app.UseAuthorization();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

app.Run();
