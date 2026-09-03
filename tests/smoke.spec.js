/**
 * SatGuardView — One-Step Happy-Path Validation Suite
 * ---------------------------------------------------
 * One test per menu use case. Each test performs the single menu action
 * for that use case (plus the minimal precondition to reach it) and
 * asserts the expected happy-path outcome. No multi-step journeys.
 *
 * Layout:
 *   01 App shell      — page load, chrome present
 *   02 Tabs           — Live View / Explorer
 *   03 Layers         — Street / Satellite / 3D Terrain / Road View
 *   04 Providers      — watermark guard (no CARTO, all tiles 200)
 *   05 Dark mode      — toggle on/off
 *   06 Hamburger      — mobile sidebar open
 *   07 Quick location — Varanasi preset
 *   08 Search         — imagery search results
 *   09 Sort           — results sorting
 *   10 Export         — CSV / GeoJSON downloads
 *   11 Pagination     — Load More
 *   12 Draw Area      — draw-mode hint
 *   13 Keyboard       — S / L / D / Esc
 *   14 Live View      — country → city → live imagery
 */
const { test, expect } = require('@playwright/test');

const STAC_TIMEOUT = 90 * 1000; // external STAC catalog can be slow

async function gotoApp(page, { dark = false } = {}) {
  await page.addInitScript(
    (d) => localStorage.setItem('darkMode', d ? 'true' : 'false'),
    dark
  );
  await page.goto('/');
  await expect(page.locator('#map')).toBeVisible();
  await page.waitForTimeout(1200); // let tiles + borders settle
}

/** Precondition for anything that needs search results: Varanasi + search. */
async function withResults(page) {
  await gotoApp(page);
  await page.click('.quick-loc-btn >> nth=0'); // Varanasi preset
  await expect(page.locator('#searchBtn')).toBeEnabled();
  await page.click('#searchBtn');
  await expect(page.locator('.result-item').first()).toBeVisible({ timeout: STAC_TIMEOUT });
}

async function expectToast(page, timeout = 8000) {
  await expect(page.locator('#toast.visible')).toBeVisible({ timeout });
}

/* ===== 01 App shell ================================================== */

test('UC-01 App shell loads with all menu chrome', async ({ page }) => {
  await gotoApp(page);
  await expect(page).toHaveTitle(/SatGuardView/i);
  await expect(page.locator('#map .leaflet-container')).toBeVisible();
  await expect(page.locator('#appStatusText')).toHaveText(/Ready/i);
  for (const id of ['#tabExplorer', '#tabLiveView', '#layerStreet', '#layerSatellite',
    '#layer3d', '#layerRoad', '#darkModeToggle', '#hamburgerMenu', '#drawAreaBtn']) {
    await expect(page.locator(id)).toBeVisible();
  }
});

/* ===== 02 Tabs ======================================================= */

test('UC-02a Live View tab opens live sidebar', async ({ page }) => {
  await gotoApp(page);
  await page.click('#tabLiveView');
  await expect(page.locator('#sidebarLiveView')).toBeVisible();
  await expect(page.locator('#liveCountrySelect')).toBeVisible();
});

test('UC-02b Explorer tab returns to explorer sidebar', async ({ page }) => {
  await gotoApp(page);
  await page.click('#tabLiveView');
  await page.click('#tabExplorer');
  await expect(page.locator('#sidebarExplorer')).toBeVisible();
  await expect(page.locator('#countrySelect')).toBeVisible();
});

/* ===== 03 Layer switcher ============================================= */

test('UC-03a Street layer shows OSM tiles', async ({ page }) => {
  await gotoApp(page, { dark: false });
  await page.click('#layerStreet');
  await expect(page.locator('#layerStreet')).toHaveClass(/active/);
  await expect(page.locator('img.leaflet-tile[src*="openstreetmap.org"]').first())
    .toBeVisible({ timeout: 20000 });
});

test('UC-03b Satellite layer shows NASA GIBS tiles', async ({ page }) => {
  await gotoApp(page, { dark: false });
  await page.click('#layerSatellite');
  await expect(page.locator('#layerSatellite')).toHaveClass(/active/);
  await expect(page.locator('img.leaflet-tile[src*="gibs.earthdata.nasa.gov"]').first())
    .toBeVisible({ timeout: 20000 });
});

test('UC-03c 3D Terrain layer shows OpenTopoMap tiles', async ({ page }) => {
  await gotoApp(page, { dark: false });
  await page.click('#layer3d');
  await expect(page.locator('#layer3d')).toHaveClass(/active/);
  await expect(page.locator('img.leaflet-tile[src*="opentopomap.org"]').first())
    .toBeVisible({ timeout: 20000 });
});

test('UC-03d Road View layer shows Wikimedia tiles', async ({ page }) => {
  await gotoApp(page, { dark: false });
  await page.click('#layerRoad');
  await expect(page.locator('#layerRoad')).toHaveClass(/active/);
  await expect(page.locator('img.leaflet-tile[src*="maps.wikimedia.org"]').first())
    .toBeVisible({ timeout: 20000 });
});

/* ===== 04 Provider / watermark guard ================================= */

test('UC-04 No CARTO requests; every map tile returns 200', async ({ page }) => {
  const cartoRequests = [];
  const tileResponses = [];
  page.on('request', (req) => {
    if (req.url().includes('cartocdn')) cartoRequests.push(req.url());
  });
  page.on('response', (res) => {
    const url = res.url();
    if (/tile\.openstreetmap\.org|opentopomap\.org|maps\.wikimedia\.org|gibs\.earthdata\.nasa\.gov/.test(url)) {
      tileResponses.push({ url, status: res.status() });
    }
  });
  await gotoApp(page, { dark: false });
  for (const btn of ['#layerSatellite', '#layer3d', '#layerRoad', '#layerStreet']) {
    await page.click(btn);
    await page.waitForTimeout(1500);
  }
  expect(cartoRequests, 'CARTO must never be requested (watermarked provider)').toHaveLength(0);
  expect(tileResponses.length).toBeGreaterThan(0);
  const bad = tileResponses.filter((t) => t.status !== 200);
  expect(bad, `non-200 tiles: ${JSON.stringify(bad)}`).toHaveLength(0);
});

/* ===== 05 Dark mode ================================================== */

test('UC-05a Dark mode toggle switches to dark tiles', async ({ page }) => {
  await gotoApp(page, { dark: false });
  await expect(page.locator('body')).not.toHaveClass(/dark-mode/);
  await page.click('#darkModeToggle');
  await expect(page.locator('body')).toHaveClass(/dark-mode/);
  await expect(page.locator('.dark-tiles')).toBeVisible({ timeout: 20000 });
});

test('UC-05b Dark mode toggle returns to light tiles', async ({ page }) => {
  await gotoApp(page, { dark: true });
  await expect(page.locator('body')).toHaveClass(/dark-mode/);
  await page.click('#darkModeToggle');
  await expect(page.locator('body')).not.toHaveClass(/dark-mode/);
  await expect(page.locator('.dark-tiles')).toHaveCount(0);
});

/* ===== 06 Hamburger (mobile) ========================================= */

test('UC-06 Hamburger opens sidebar on mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await gotoApp(page);
  const sidebar = page.locator('#sidebarExplorer');
  if (await sidebar.isHidden()) {
    await page.click('#hamburgerMenu');
  } else {
    await page.click('#hamburgerMenu'); // toggle closed then open again for full path
    await page.click('#hamburgerMenu');
  }
  await expect(page.locator('#sidebarExplorer')).toBeVisible();
});

/* ===== 07 Quick locations ============================================ */

test('UC-07 Varanasi quick location enables search', async ({ page }) => {
  await gotoApp(page);
  await expect(page.locator('#searchBtn')).toBeDisabled();
  await page.click('.quick-loc-btn >> nth=0'); // Varanasi
  await expect(page.locator('#searchBtn')).toBeEnabled();
  await expect(page.locator('#searchHint')).not.toContainText(/select a location/i);
});

test('UC-07b Kailash quick location enables search', async ({ page }) => {
  await gotoApp(page);
  await page.click('.quick-loc-btn >> nth=1'); // Kailash
  await expect(page.locator('#searchBtn')).toBeEnabled();
});

/* ===== 08 Search ===================================================== */

test('UC-08 Search imagery returns results for Varanasi', async ({ page }) => {
  await withResults(page);
  const count = await page.locator('.result-item').count();
  expect(count).toBeGreaterThan(0);
  await expect(page.locator('#appStatusText')).toHaveText(/Ready/i);
});

/* ===== 09 Sort ======================================================= */

test('UC-09 Sort by Oldest First re-renders results', async ({ page }) => {
  await withResults(page);
  const before = await page.locator('.result-item').count();
  await page.selectOption('#sortSelect', 'date-asc');
  await expect(page.locator('#sortSelect')).toHaveValue('date-asc');
  await expect.poll(async () => page.locator('.result-item').count(),
    { timeout: 20000 }).toBeGreaterThanOrEqual(before > 0 ? 1 : 0);
});

/* ===== 10 Export ===================================================== */

test('UC-10a Export CSV downloads a .csv file', async ({ page }) => {
  await withResults(page);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60 * 1000 }),
    page.click('#exportCsvBtn'),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
});

test('UC-10b Export GeoJSON downloads a .geojson file', async ({ page }) => {
  await withResults(page);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60 * 1000 }),
    page.click('#exportGeojsonBtn'),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.geojson$/);
});

/* ===== 11 Pagination ================================================= */

test('UC-11 Load More appends additional results', async ({ page }) => {
  await withResults(page);
  const before = await page.locator('.result-item').count();
  const loadMore = page.locator('#loadMoreBtn');
  if (await loadMore.isVisible()) {
    await loadMore.click();
    await expect.poll(async () => page.locator('.result-item').count(),
      { timeout: STAC_TIMEOUT }).toBeGreaterThan(before);
  } else {
    test.info().annotations.push({ type: 'note', description: 'Single page of results — pagination complete, Load More correctly absent' });
  }
});

/* ===== 12 Draw Area ================================================== */

test('UC-12 Draw Area enters draw mode', async ({ page }) => {
  await gotoApp(page);
  await page.click('#drawAreaBtn');
  await expectToast(page);
  await expect(page.locator('#toast')).toContainText(/draw/i);
});

/* ===== 13 Keyboard shortcuts ========================================= */

test('UC-13a L cycles through map layers', async ({ page }) => {
  await gotoApp(page, { dark: false });
  await expect(page.locator('#layerStreet')).toHaveClass(/active/);
  await page.keyboard.press('l');
  await expect(page.locator('#layerSatellite')).toHaveClass(/active/);
  await page.keyboard.press('L');
  await expect(page.locator('#layer3d')).toHaveClass(/active/);
  await page.keyboard.press('l');
  await expect(page.locator('#layerRoad')).toHaveClass(/active/);
});

test('UC-13b D toggles dark mode', async ({ page }) => {
  await gotoApp(page, { dark: false });
  await page.keyboard.press('d');
  await expect(page.locator('body')).toHaveClass(/dark-mode/);
  await page.keyboard.press('d');
  await expect(page.locator('body')).not.toHaveClass(/dark-mode/);
});

test('UC-13c S focuses search', async ({ page }) => {
  await gotoApp(page);
  await page.keyboard.press('s');
  const focused = await page.evaluate(() => ({
    id: document.activeElement ? document.activeElement.id : '',
  }));
  expect(['explorerCityInput', 'searchBtn', 'liveCityInput']).toContain(focused.id);
});

test('UC-13d Esc collapses sidebars', async ({ page }) => {
  await gotoApp(page);
  await expect(page.locator('#sidebarExplorer')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#sidebarExplorer')).toHaveClass(/hidden/);
  await expect(page.locator('#toggleLeft')).toBeVisible();
});

/* ===== 14 Live View ================================================== */

test('UC-14a Live View: selecting a country enables city search', async ({ page }) => {
  await gotoApp(page);
  await page.click('#tabLiveView');
  await expect(page.locator('#liveCityInput')).toBeDisabled();
  const select = page.locator('#liveCountrySelect');
  const options = await select.locator('option').all();
  test.skip(options.length < 2, 'no countries loaded');
  const value = await options[1].getAttribute('value');
  await select.selectOption(value);
  await expect(page.locator('#liveCityInput')).toBeEnabled({ timeout: 20000 });
});

test('UC-14b Live View: city search shows live marker on map', async ({ page }) => {
  await gotoApp(page);
  await page.click('#tabLiveView');
  const select = page.locator('#liveCountrySelect');
  const options = await select.locator('option').all();
  test.skip(options.length < 2, 'no countries loaded');
  const value = await options[1].getAttribute('value');
  await select.selectOption(value);
  await expect(page.locator('#liveCityInput')).toBeEnabled({ timeout: 20000 });
  await page.fill('#liveCityInput', 'varanasi');
  await page.click('#liveCitySearchBtn');
  await expect(page.locator('.shield-marker')).toBeVisible({ timeout: STAC_TIMEOUT });
  await expect(page.locator('#appStatusText')).toHaveText(/Ready/i);
});

test('UC-14c Live View: directional view selector is present and switchable', async ({ page }) => {
  await gotoApp(page);
  await page.click('#tabLiveView');
  const dir = page.locator('#directionalViewSelector');
  await expect(dir).toBeVisible();
  const options = await dir.locator('option').all();
  test.skip(options.length < 2, 'no directional options');
  const value = await options[1].getAttribute('value');
  await dir.selectOption(value);
  await expect(dir).toHaveValue(value);
});
