// ============================================================
// SatGuardView — EO Imagery Explorer + Live View
// ============================================================

var map = null;
var currentTab = 'explorer';
var currentLayer = 'street';
var streetLayer = null;
var satelliteLayer = null;
var gibsLayer = null;
var currentRectangle = null;
var searchMarkers = [];
var currentBbox = null;
var searchResults = [];
var liveShieldMarker = null;
var liveViewActive = false;
var countryBordersLayer = null;

// City autocomplete state
var cityDebounceTimer = null;
var citySuggestions = [];
var citySelectedIndex = -1;

// EO Explorer city autocomplete state
var explorerCityDebounceTimer = null;
var explorerCitySuggestions = [];
var explorerCitySelectedIndex = -1;

// Natural Earth 110m — lightweight (840KB) country borders GeoJSON
var COUNTRY_GEOJSON_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';
// Show country name labels only when zoomed in enough to avoid clutter
var COUNTRY_LABEL_MIN_ZOOM = 3;

// Light yellow border color (#FFD700) per user instruction
var BORDER_COLOR = '#FFD700';
var BORDER_FILL_COLOR = '#FFD700';
var BORDER_FILL_OPACITY = 0.08;

// Tile URLs
var streetTilesUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
var satelliteTilesUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
var gibsUrl = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/{gibsDate}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpeg';
var esriAttribution = 'Tiles &copy; Esri, Reference &copy; Esri';
var gibsAttribution = 'Imagery &copy; NASA GIBS, Reference &copy; Esri';

// GIBS "best" MODIS Terra imagery is typically published with ~1 day lag,
// so requesting today's date reliably 404s. Default to yesterday, and fall
// back further if that day's tiles are also unavailable.
var GIBS_DEFAULT_LAG_DAYS = 1;
var gibsCurrentLagDays = GIBS_DEFAULT_LAG_DAYS;
var GIBS_MAX_FALLBACK_DAYS = 5;

// ===== Date Helpers =====
function getGibsDate(daysAgo) {
    var d = new Date();
    d.setDate(d.getDate() - (daysAgo || GIBS_DEFAULT_LAG_DAYS));
    return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
}

function getTimestampDisplay() {
    var d = new Date();
    return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0') + ' ' +
        String(d.getHours()).padStart(2, '0') + ':' +
        String(d.getMinutes()).padStart(2, '0');
}

function formatDateForApi(dateStr) {
    if (!dateStr) return null;
    // Handle YYYY-MM-DD (from <input type="date">)
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) return dateStr;
    // Handle MM/DD/YYYY
    var parts = dateStr.split('/');
    if (parts.length === 3) return parts[2] + '-' + parts[0].padStart(2, '0') + '-' + parts[1].padStart(2, '0');
    return dateStr;
}

function setDefaultDateRange() {
    var end = new Date();
    var start = new Date();
    start.setDate(end.getDate() - 90);
    document.getElementById('startDate').value =
        start.getFullYear() + '-' + String(start.getMonth() + 1).padStart(2, '0') + '-' + String(start.getDate()).padStart(2, '0');
    document.getElementById('endDate').value =
        end.getFullYear() + '-' + String(end.getMonth() + 1).padStart(2, '0') + '-' + String(end.getDate()).padStart(2, '0');
}

// ===== Initialize Map =====
function initMap() {
    map = L.map('map', {
        center: [20, 0],
        zoom: 2,
        minZoom: 2,
        maxZoom: 18,
        zoomControl: true,
        worldCopyJump: true,
        attributionControl: true
    });

    streetLayer = L.tileLayer(streetTilesUrl, { attribution: esriAttribution, maxZoom: 18 });
    satelliteLayer = L.tileLayer(satelliteTilesUrl, { attribution: esriAttribution, maxZoom: 18 });
    gibsLayer = createGibsLayer(gibsCurrentLagDays);

    streetLayer.addTo(map);
    map.zoomControl.setPosition('bottomleft');
    L.control.attribution({ position: 'bottomright', prefix: 'Leaflet' }).addTo(map);
    map.on('click', onMapClick);
    map.on('zoomend', updateLabelVisibility);

    // Load country borders overlay (yellow lines + name labels)
    loadCountryBorders();

    // Update timestamp
    updateLiveTimestamp();
}

// ===== Country Borders Overlay =====
function loadCountryBorders() {
    fetch(COUNTRY_GEOJSON_URL)
        .then(function(r) { return r.json(); })
        .then(function(geojson) {
            countryBordersLayer = L.geoJSON(geojson, {
                style: {
                    color: '#FFD700',
                    weight: 1,
                    opacity: 0.8,
                    fillColor: '#FFD700',
                    fillOpacity: 0
                },
                onEachFeature: function(feature, layer) {
                    var name = feature.properties.NAME || feature.properties.NAME_EN || '';
                    if (name) {
                        layer.bindTooltip(name, {
                            permanent: true,
                            direction: 'center',
                            className: 'country-label',
                            opacity: 0.85
                        });
                    }
                    // Highlight border slightly on hover
                    layer.on('mouseover', function(e) {
                        e.target.setStyle({ weight: 2, opacity: 1, color: '#FFE54C' });
                    });
                    layer.on('mouseout', function(e) {
                        countryBordersLayer.resetStyle(e.target);
                    });
                }
            });
            countryBordersLayer.addTo(map);
            updateLabelVisibility();
        })
        .catch(function(err) {
            console.error('Failed to load country borders:', err);
        });
}

function updateLabelVisibility() {
    if (!countryBordersLayer) return;
    var container = map.getContainer();
    if (map.getZoom() >= COUNTRY_LABEL_MIN_ZOOM) {
        container.classList.add('show-country-labels');
    } else {
        container.classList.remove('show-country-labels');
    }
}

// ===== Tab Switching =====
function switchTab(tab) {
    if (tab === currentTab) return;
    currentTab = tab;

    var tabExplorer = document.getElementById('tabExplorer');
    var tabLiveView = document.getElementById('tabLiveView');
    var sidebarExplorer = document.getElementById('sidebarExplorer');
    var sidebarLiveView = document.getElementById('sidebarLiveView');
    var layerSwitcher = document.getElementById('layerSwitcher');
    var timestampBadge = document.getElementById('liveTimestampBadge');
    var sidebarRight = document.getElementById('sidebarRight');

    if (tab === 'explorer') {
        tabExplorer.classList.add('active');
        tabLiveView.classList.remove('active');
        sidebarExplorer.classList.remove('hidden');
        sidebarLiveView.classList.add('hidden');
        layerSwitcher.classList.remove('hidden');
        timestampBadge.classList.add('hidden');
        sidebarRight.classList.remove('hidden');
        liveViewActive = false;

        // Switch back to street/satellite
        if (map.hasLayer(gibsLayer)) map.removeLayer(gibsLayer);
        if (currentLayer === 'street') {
            if (!map.hasLayer(streetLayer)) streetLayer.addTo(map);
            if (map.hasLayer(satelliteLayer)) map.removeLayer(satelliteLayer);
        } else {
            if (!map.hasLayer(satelliteLayer)) satelliteLayer.addTo(map);
            if (map.hasLayer(streetLayer)) map.removeLayer(streetLayer);
        }
        // Remove shield marker
        if (liveShieldMarker) {
            map.removeLayer(liveShieldMarker);
            liveShieldMarker = null;
        }
        // Restore current rectangle if exists
        if (currentBbox) drawRectangleOnMap(currentBbox);
    } else {
        tabExplorer.classList.remove('active');
        tabLiveView.classList.add('active');
        sidebarExplorer.classList.add('hidden');
        sidebarLiveView.classList.remove('hidden');
        layerSwitcher.classList.add('hidden');
        timestampBadge.classList.remove('hidden');
        sidebarRight.classList.add('hidden');
        liveViewActive = true;

        // Switch to NASA GIBS MODIS Terra
        if (map.hasLayer(streetLayer)) map.removeLayer(streetLayer);
        if (map.hasLayer(satelliteLayer)) map.removeLayer(satelliteLayer);
        // Remove search rectangle
        if (currentRectangle) {
            map.removeLayer(currentRectangle);
            currentRectangle = null;
        }
        // Remove search markers
        clearSearchMarkers();
        // Add GIBS layer
        if (!map.hasLayer(gibsLayer)) {
            gibsLayer.addTo(map);
        }
        // Update timestamp
        updateLiveTimestamp();
    }
}

// ===== Live View Timestamp Badge =====
function updateLiveTimestamp() {
    var dateStr = getGibsDate(gibsCurrentLagDays);
    var badge = document.getElementById('liveTimestampDate');
    if (badge) badge.textContent = dateStr;

    var refresh = document.getElementById('liveViewLastRefresh');
    if (refresh) refresh.textContent = getTimestampDisplay();
}

// ===== Refresh Live View (re-adds GIBS layer with today's date) =====
function refreshLiveView() {
    if (!liveViewActive) return;
    gibsCurrentLagDays = GIBS_DEFAULT_LAG_DAYS;
    if (map.hasLayer(gibsLayer)) map.removeLayer(gibsLayer);
    gibsLayer = createGibsLayer(gibsCurrentLagDays);
    gibsLayer.addTo(map);
    updateLiveTimestamp();
    showToast('Live view refreshed — ' + getGibsDate(gibsCurrentLagDays), 'success');
}

// ===== GIBS Layer Factory (with automatic day-lag fallback on tile errors) =====
function createGibsLayer(lagDays) {
    var layer = L.tileLayer(gibsUrl, {
        gibsDate: getGibsDate(lagDays),
        attribution: gibsAttribution,
        maxZoom: 9,
        tileSize: 256,
        errorTileUrl: ''
    });

    var erroredTiles = 0;
    layer.on('tileerror', function() {
        erroredTiles++;
        // If a meaningful chunk of tiles fail (imagery not yet published for this date),
        // step back a day and rebuild the layer, up to GIBS_MAX_FALLBACK_DAYS.
        if (erroredTiles >= 3 && gibsCurrentLagDays < GIBS_MAX_FALLBACK_DAYS && liveViewActive) {
            erroredTiles = 0;
            gibsCurrentLagDays++;
            if (map.hasLayer(gibsLayer)) map.removeLayer(gibsLayer);
            gibsLayer = createGibsLayer(gibsCurrentLagDays);
            gibsLayer.addTo(map);
            updateLiveTimestamp();
        }
    });

    return layer;
}

// ===== Layer Switching (EO Explorer only) =====
function switchLayer(layer) {
    if (layer === currentLayer || liveViewActive) return;
    currentLayer = layer;
    if (layer === 'street') {
        map.removeLayer(satelliteLayer);
        if (!map.hasLayer(streetLayer)) streetLayer.addTo(map);
        document.getElementById('layerStreet').classList.add('active');
        document.getElementById('layerSatellite').classList.remove('active');
    } else {
        map.removeLayer(streetLayer);
        if (!map.hasLayer(satelliteLayer)) satelliteLayer.addTo(map);
        document.getElementById('layerSatellite').classList.add('active');
        document.getElementById('layerStreet').classList.remove('active');
    }
}

// ===== Map Click (EO Explorer — draw bbox) =====
function onMapClick(e) {
    if (liveViewActive) return;
    if (currentRectangle) return; // already have a selection
    var lat = e.latlng.lat, lng = e.latlng.lng, delta = 0.5;
    currentBbox = [Math.max(-180, lng - delta), Math.max(-90, lat - delta), Math.min(180, lng + delta), Math.min(90, lat + delta)];
    drawRectangleOnMap(currentBbox);
    enableSearch();
}

function drawRectangleOnMap(bbox) {
    if (currentRectangle) map.removeLayer(currentRectangle);
    currentRectangle = L.rectangle([[bbox[1], bbox[0]], [bbox[3], bbox[2]]], {
        color: BORDER_COLOR,
        weight: 2,
        fillColor: BORDER_FILL_COLOR,
        fillOpacity: BORDER_FILL_OPACITY
    }).addTo(map);
}

// ===== Country Selection (EO Explorer) =====
function onCountrySelected() {
    if (liveViewActive) return;
    var select = document.getElementById('countrySelect');
    var option = select.options[select.selectedIndex];
    var geoGroup = document.getElementById('geographyTypeGroup');

    if (!option || !option.value) {
        currentBbox = null;
        if (currentRectangle) { map.removeLayer(currentRectangle); currentRectangle = null; }
        if (geoGroup) geoGroup.style.display = 'none';
        var cityGroup = document.getElementById('explorerCityGroup');
        if (cityGroup) cityGroup.style.display = 'none';
        disableSearch();
        return;
    }

    var bboxStr = option.getAttribute('data-bbox');
    if (!bboxStr) return;
    var bbox = bboxStr.split(',').map(parseFloat);
    currentBbox = bbox;

    drawRectangleOnMap(bbox);
    map.fitBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]], { padding: [40, 40] });

    // Show Geography Type dropdown
    if (geoGroup) {
        geoGroup.style.display = 'block';
        document.getElementById('geographyTypeSelect').value = '';
    }

    // Show city search
    var cityGroup = document.getElementById('explorerCityGroup');
    if (cityGroup) {
        cityGroup.style.display = 'block';
        var cityInput = document.getElementById('explorerCityInput');
        if (cityInput) cityInput.value = '';
        var cityDropdown = document.getElementById('explorerCitySuggestions');
        if (cityDropdown) cityDropdown.style.display = 'none';
    }

    enableSearch();
}

// ===== Geography Type Selection =====
function onGeographyTypeSelected() {
    var geoType = document.getElementById('geographyTypeSelect').value;
    // Adjust rectangle style based on geography type
    if (currentRectangle && currentBbox) {
        if (geoType === 'administrative') {
            currentRectangle.setStyle({
                color: BORDER_COLOR,
                weight: 2,
                dashArray: null,
                fillColor: BORDER_FILL_COLOR,
                fillOpacity: BORDER_FILL_OPACITY
            });
        } else if (geoType === 'physical') {
            currentRectangle.setStyle({
                color: BORDER_COLOR,
                weight: 2,
                dashArray: '8 4',
                fillColor: BORDER_FILL_COLOR,
                fillOpacity: 0.03
            });
        }
    }
}

// ===== Country Selection (Live View) =====
function onLiveCountrySelected() {
    var select = document.getElementById('liveCountrySelect');
    var option = select.options[select.selectedIndex];
    var cityInput = document.getElementById('liveCityInput');
    var cityBtn = document.getElementById('liveCitySearchBtn');

    if (!option || !option.value) {
        cityInput.disabled = true;
        cityBtn.disabled = true;
        cityInput.placeholder = 'Select a country first';
        cityInput.value = '';
        return;
    }

    cityInput.disabled = false;
    cityBtn.disabled = false;
    cityInput.placeholder = 'Type a city name...';

    // Zoom to country
    var bboxStr = option.getAttribute('data-bbox');
    if (bboxStr) {
        var bbox = bboxStr.split(',').map(parseFloat);
        map.fitBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]], { padding: [40, 40] });
    }

    // Clear previous shield marker
    if (liveShieldMarker) {
        map.removeLayer(liveShieldMarker);
        liveShieldMarker = null;
    }
}

// ===== EO Explorer City Autocomplete =====
function onExplorerCityInputChanged() {
    var input = document.getElementById('explorerCityInput');
    var query = input.value.trim();
    var dropdown = document.getElementById('explorerCitySuggestions');

    clearTimeout(explorerCityDebounceTimer);
    if (query.length < 2) {
        dropdown.style.display = 'none';
        explorerCitySuggestions = [];
        explorerCitySelectedIndex = -1;
        return;
    }
    explorerCityDebounceTimer = setTimeout(function() { fetchExplorerCitySuggestions(query); }, 300);
}

async function fetchExplorerCitySuggestions(query) {
    var countrySelect = document.getElementById('countrySelect');
    var countryCode = countrySelect.value || '';
    var dropdown = document.getElementById('explorerCitySuggestions');

    try {
        var url = '/api/cities?q=' + encodeURIComponent(query);
        if (countryCode) url += '&country=' + encodeURIComponent(countryCode);
        var response = await fetch(url);
        if (!response.ok) { dropdown.style.display = 'none'; return; }
        var results = await response.json();
        if (!results || results.length === 0) {
            dropdown.style.display = 'none';
            explorerCitySuggestions = [];
            explorerCitySelectedIndex = -1;
            return;
        }
        explorerCitySuggestions = results;
        explorerCitySelectedIndex = -1;
        renderExplorerCitySuggestions();
    } catch (err) {
        console.error('Explorer city autocomplete error:', err);
        dropdown.style.display = 'none';
    }
}

function renderExplorerCitySuggestions() {
    var dropdown = document.getElementById('explorerCitySuggestions');
    if (explorerCitySuggestions.length === 0) { dropdown.style.display = 'none'; return; }
    var html = '';
    for (var i = 0; i < explorerCitySuggestions.length; i++) {
        var item = explorerCitySuggestions[i];
        var name = item.name || item.display_name.split(',')[0] || 'Unknown';
        var desc = item.display_name || '';
        if (desc.length > 60) desc = desc.substring(0, 57) + '...';
        html += '<div class="city-suggestion-item" data-index="' + i + '" onclick="selectExplorerCitySuggestion(' + i + ')">' +
            '<div class="city-suggestion-item__name">' + escapeHtml(name) + '</div>' +
            '<div class="city-suggestion-item__desc">' + escapeHtml(desc) + '</div></div>';
    }
    dropdown.innerHTML = html;
    dropdown.style.display = 'block';
}

function selectExplorerCitySuggestion(index) {
    if (index < 0 || index >= explorerCitySuggestions.length) return;
    var item = explorerCitySuggestions[index];
    var name = item.name || item.display_name.split(',')[0] || '';
    document.getElementById('explorerCityInput').value = name;
    document.getElementById('explorerCitySuggestions').style.display = 'none';
    explorerCitySelectedIndex = -1;
    searchExplorerCity();
}

function onExplorerCityKeydown(event) {
    var dropdown = document.getElementById('explorerCitySuggestions');
    if (dropdown.style.display === 'none' || explorerCitySuggestions.length === 0) {
        if (event.key === 'Enter') searchExplorerCity();
        return;
    }
    if (event.key === 'ArrowDown') {
        event.preventDefault();
        explorerCitySelectedIndex = Math.min(explorerCitySelectedIndex + 1, explorerCitySuggestions.length - 1);
        highlightExplorerCitySuggestion();
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        explorerCitySelectedIndex = Math.max(explorerCitySelectedIndex - 1, -1);
        highlightExplorerCitySuggestion();
    } else if (event.key === 'Enter') {
        event.preventDefault();
        if (explorerCitySelectedIndex >= 0) selectExplorerCitySuggestion(explorerCitySelectedIndex);
        else searchExplorerCity();
    } else if (event.key === 'Escape') {
        dropdown.style.display = 'none';
        explorerCitySelectedIndex = -1;
    }
}

function highlightExplorerCitySuggestion() {
    var items = document.querySelectorAll('#explorerCitySuggestions .city-suggestion-item');
    for (var i = 0; i < items.length; i++) items[i].classList.remove('selected');
    if (explorerCitySelectedIndex >= 0 && items[explorerCitySelectedIndex]) {
        items[explorerCitySelectedIndex].classList.add('selected');
        items[explorerCitySelectedIndex].scrollIntoView({ block: 'nearest' });
    }
}

async function searchExplorerCity() {
    var input = document.getElementById('explorerCityInput');
    var countrySelect = document.getElementById('countrySelect');
    var city = input.value.trim();
    var country = countrySelect.options[countrySelect.selectedIndex].text;
    if (!city) { showToast('Enter a city name', 'error'); return; }

    var query = city + ', ' + country;
    var btn = document.getElementById('explorerCitySearchBtn');
    btn.disabled = true;
    btn.innerHTML = '<div class="mini-spinner"></div>';

    try {
        var response = await fetch('/api/geocode?q=' + encodeURIComponent(query));
        if (!response.ok) throw new Error('Geocoding failed');
        var results = await response.json();
        if (!results || results.length === 0) {
            response = await fetch('/api/geocode?q=' + encodeURIComponent(city));
            results = await response.json();
        }
        if (!results || results.length === 0) { showToast('City not found: ' + city, 'error'); return; }

        var best = results[0];
        var lat = parseFloat(best.lat);
        var lng = parseFloat(best.lon);
        var delta = 0.5;
        currentBbox = [Math.max(-180, lng - delta), Math.max(-90, lat - delta),
                       Math.min(180, lng + delta), Math.min(90, lat + delta)];
        drawRectangleOnMap(currentBbox);
        map.setView([lat, lng], 6, { animate: true });
        enableSearch();
        showToast('Located: ' + best.name, 'success');
    } catch (err) {
        showToast('Search error: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
    }
}

// Close explorer suggestions on outside click (extend existing handler)
// ===== City Autocomplete (incremental search) =====
function onCityInputChanged() {
    var input = document.getElementById('liveCityInput');
    var query = input.value.trim();
    var dropdown = document.getElementById('citySuggestions');

    clearTimeout(cityDebounceTimer);

    if (query.length < 2) {
        dropdown.style.display = 'none';
        citySuggestions = [];
        citySelectedIndex = -1;
        return;
    }

    // Debounce — wait 300ms after last keystroke
    cityDebounceTimer = setTimeout(function() { fetchCitySuggestions(query); }, 300);
}

async function fetchCitySuggestions(query) {
    var countrySelect = document.getElementById('liveCountrySelect');
    var countryCode = countrySelect.value || '';
    var dropdown = document.getElementById('citySuggestions');

    try {
        var url = '/api/cities?q=' + encodeURIComponent(query);
        if (countryCode) url += '&country=' + encodeURIComponent(countryCode);
        var response = await fetch(url);
        if (!response.ok) { dropdown.style.display = 'none'; return; }

        var results = await response.json();
        if (!results || results.length === 0) {
            dropdown.style.display = 'none';
            citySuggestions = [];
            citySelectedIndex = -1;
            return;
        }

        citySuggestions = results;
        citySelectedIndex = -1;
        renderCitySuggestions();
    } catch (err) {
        console.error('City autocomplete error:', err);
        dropdown.style.display = 'none';
    }
}

function renderCitySuggestions() {
    var dropdown = document.getElementById('citySuggestions');
    if (citySuggestions.length === 0) {
        dropdown.style.display = 'none';
        return;
    }

    var html = '';
    for (var i = 0; i < citySuggestions.length; i++) {
        var item = citySuggestions[i];
        var name = item.name || item.display_name.split(',')[0] || 'Unknown';
        var desc = item.display_name || '';
        // Truncate long display names
        if (desc.length > 60) desc = desc.substring(0, 57) + '...';
        html += '<div class="city-suggestion-item" data-index="' + i + '" onclick="selectCitySuggestion(' + i + ')">' +
            '<div class="city-suggestion-item__name">' + escapeHtml(name) + '</div>' +
            '<div class="city-suggestion-item__desc">' + escapeHtml(desc) + '</div>' +
            '</div>';
    }
    dropdown.innerHTML = html;
    dropdown.style.display = 'block';
}

function selectCitySuggestion(index) {
    if (index < 0 || index >= citySuggestions.length) return;
    var item = citySuggestions[index];
    var name = item.name || item.display_name.split(',')[0] || '';
    document.getElementById('liveCityInput').value = name;
    document.getElementById('citySuggestions').style.display = 'none';
    citySelectedIndex = -1;
    searchLiveCity();
}

function onCityKeydown(event) {
    var dropdown = document.getElementById('citySuggestions');
    if (dropdown.style.display === 'none' || citySuggestions.length === 0) {
        if (event.key === 'Enter') searchLiveCity();
        return;
    }

    if (event.key === 'ArrowDown') {
        event.preventDefault();
        citySelectedIndex = Math.min(citySelectedIndex + 1, citySuggestions.length - 1);
        highlightCitySuggestion();
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        citySelectedIndex = Math.max(citySelectedIndex - 1, -1);
        highlightCitySuggestion();
    } else if (event.key === 'Enter') {
        event.preventDefault();
        if (citySelectedIndex >= 0) {
            selectCitySuggestion(citySelectedIndex);
        } else {
            searchLiveCity();
        }
    } else if (event.key === 'Escape') {
        dropdown.style.display = 'none';
        citySelectedIndex = -1;
    }
}

function highlightCitySuggestion() {
    var items = document.querySelectorAll('.city-suggestion-item');
    for (var i = 0; i < items.length; i++) {
        items[i].classList.remove('selected');
    }
    if (citySelectedIndex >= 0 && items[citySelectedIndex]) {
        items[citySelectedIndex].classList.add('selected');
        items[citySelectedIndex].scrollIntoView({ block: 'nearest' });
    }
}

function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Close suggestions when clicking outside
document.addEventListener('click', function(e) {
    if (!e.target.closest('.city-search-wrapper')) {
        var d1 = document.getElementById('citySuggestions');
        if (d1) d1.style.display = 'none';
        var d2 = document.getElementById('explorerCitySuggestions');
        if (d2) d2.style.display = 'none';
    }
});

// ===== City Search (Live View — geocoding via Nominatim) =====
async function searchLiveCity() {
    var cityInput = document.getElementById('liveCityInput');
    var countrySelect = document.getElementById('liveCountrySelect');
    var city = cityInput.value.trim();
    var country = countrySelect.options[countrySelect.selectedIndex].text;

    if (!city) {
        showToast('Enter a city name', 'error');
        return;
    }

    var query = city + ', ' + country;
    cityInput.disabled = true;
    cityBtn = document.getElementById('liveCitySearchBtn');
    cityBtn.disabled = true;
    cityBtn.innerHTML = '<div class="mini-spinner"></div>';

    try {
        var response = await fetch('/api/geocode?q=' + encodeURIComponent(query));
        if (!response.ok) throw new Error('Geocoding failed');
        var results = await response.json();

        if (!results || results.length === 0) {
            // Try without country prefix
            response = await fetch('/api/geocode?q=' + encodeURIComponent(city));
            results = await response.json();
        }

        if (!results || results.length === 0) {
            showToast('City not found: ' + city, 'error');
            return;
        }

        var best = results[0];
        var lat = parseFloat(best.lat);
        var lng = parseFloat(best.lon);

        // Drop shield marker
        if (liveShieldMarker) map.removeLayer(liveShieldMarker);

        var shieldIcon = L.divIcon({
            className: 'shield-marker',
            html: '<svg viewBox="0 0 24 24" width="36" height="36" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M12 2L4 6v6c0 5.5 3.84 10.74 8 12 4.16-1.26 8-6.5 8-12V6l-8-4z" ' +
                'fill="#2563eb" stroke="#fff" stroke-width="2"/>' +
                '<text x="12" y="15" text-anchor="middle" fill="#fff" font-size="7" font-weight="bold" font-family="sans-serif">LIVE</text></svg>',
            iconSize: [36, 36],
            iconAnchor: [18, 36]
        });

        liveShieldMarker = L.marker([lat, lng], { icon: shieldIcon }).addTo(map);
        liveShieldMarker.bindPopup(
            '<div style="font-size:13px"><strong>' + (best.display_name || city) + '</strong><br>' +
            'Lat: ' + lat.toFixed(4) + ', Lng: ' + lng.toFixed(4) + '<br>' +
            '<span style="color:#2563eb">Live MODIS Terra imagery</span></div>'
        );

        // Zoom to city
        map.setView([lat, lng], 8, { animate: true });
        showToast('Located: ' + city, 'success');

    } catch (err) {
        showToast('Search error: ' + err.message, 'error');
    } finally {
        cityInput.disabled = false;
        cityBtn.disabled = false;
        cityBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
    }
}

// ===== Cloud Slider =====
function onCloudSliderChanged(value) {
    document.getElementById('cloudValue').textContent = value + '%';
}

// ===== Search Enable/Disable =====
function enableSearch() {
    var btn = document.getElementById('searchBtn');
    btn.disabled = false;
    document.getElementById('searchHint').textContent = 'Ready to search';
}
function disableSearch() {
    document.getElementById('searchBtn').disabled = true;
    document.getElementById('searchHint').textContent = 'Select a location to start';
}

// ===== Search Imagery =====
async function searchImagery() {
    if (!currentBbox) { showToast('Select a location first', 'error'); return; }

    var payload = {
        bbox: currentBbox,
        satelliteSource: document.getElementById('sourceSelect').value,
        startDate: formatDateForApi(document.getElementById('startDate').value),
        endDate: formatDateForApi(document.getElementById('endDate').value),
        maxCloudCover: parseInt(document.getElementById('cloudSlider').value)
    };

    showLoading();
    var btn = document.getElementById('searchBtn');
    btn.disabled = true;
    btn.innerHTML = '<div class="mini-spinner" style="margin:0 auto"></div> Searching...';
    clearSearchMarkers();

    try {
        var response = await fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        var data = await response.json();

        if (!response.ok || data.error) {
            showToast(data.error || 'Search failed', 'error');
            showEmptyState();
            return;
        }

        searchResults = data.items || [];

        // Client-side cloud cover filtering
        var maxCloud = parseInt(document.getElementById('cloudSlider').value);
        var filtered = searchResults.filter(function(item) {
            if (item.cloudCover == null) return true;
            return item.cloudCover <= maxCloud;
        });

        displayResults(filtered, data.total || searchResults.length);
        addResultMarkers(filtered);
        showToast('Found ' + filtered.length + ' imagery items', 'success');

    } catch (err) {
        showToast('Network error: ' + err.message, 'error');
        showEmptyState();
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" style="margin-right:6px"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Search Imagery';
    }
}

// ===== Display Results =====
function displayResults(items, totalCount) {
    var body = document.getElementById('resultsBody');
    var footer = document.getElementById('resultsFooter');

    if (!items || items.length === 0) {
        body.innerHTML = '<div class="results-empty"><svg class="results-empty__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><div class="results-empty__text">No imagery found matching your filters. Try adjusting cloud cover or date range.</div></div>';
        footer.textContent = '';
        return;
    }

    var html = '';
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var date = item.dateTime ? new Date(item.dateTime).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Unknown';
        var cloudClass = 'cloud-none', cloudText = 'N/A';
        if (item.cloudCover != null) {
            cloudText = item.cloudCover.toFixed(1) + '% cloud';
            if (item.cloudCover < 20) cloudClass = 'cloud-low';
            else if (item.cloudCover < 60) cloudClass = 'cloud-medium';
            else cloudClass = 'cloud-high';
        }
        var thumbHtml = item.thumbnail
            ? '<img src="' + item.thumbnail + '" alt="Thumbnail" onerror="this.parentElement.innerHTML=\'<div class=&quot;result-item__thumb-placeholder&quot;>No preview</div>\'" />'
            : '<div class="result-item__thumb-placeholder">No preview available</div>';
        var instruments = (item.instruments || []).join(', ');
        var platform = item.platform || 'Unknown';
        html += '<div class="result-item" onclick="zoomToItem(' + i + ')">' +
            '<div class="result-item__thumb">' + thumbHtml +
            '<div class="result-item__cloud-badge ' + cloudClass + '">' + cloudText + '</div></div>' +
            '<div class="result-item__id">' + (item.id || item.productId || '') + '</div>' +
            '<div class="result-item__date">' + date + '</div>' +
            '<div class="result-item__meta">' +
            '<div class="result-item__meta-item"> \u25A0 ' + platform + '</div>' +
            (item.constellation ? '<div class="result-item__meta-item"> \u25CE ' + item.constellation + '</div>' : '') +
            (instruments ? '<div class="result-item__meta-item"> \u2692 ' + instruments + '</div>' : '') +
            (item.sunElevation != null ? '<div class="result-item__meta-item"> \u2600 ' + item.sunElevation.toFixed(1) + '&deg;</div>' : '') +
            '</div></div>';
    }
    body.innerHTML = html;
    footer.textContent = items.length + ' of ' + totalCount + ' items shown';
}

// ===== Result Markers =====
function addResultMarkers(items) {
    clearSearchMarkers();
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (!item.bbox || item.bbox.length < 4) continue;
        var bounds = [[item.bbox[1], item.bbox[0]], [item.bbox[3], item.bbox[2]]];
        var rect = L.rectangle(bounds, { color: '#2563eb', weight: 1, fillColor: '#2563eb', fillOpacity: 0.05 }).addTo(map);
        rect._itemIndex = i;
        rect.on('click', function(e) { zoomToItem(e.target._itemIndex); });
        searchMarkers.push(rect);
    }
}

function clearSearchMarkers() {
    for (var i = 0; i < searchMarkers.length; i++) map.removeLayer(searchMarkers[i]);
    searchMarkers = [];
}

function zoomToItem(index) {
    var filtered = searchResults;
    if (filtered[index] && filtered[index].bbox) {
        var b = filtered[index].bbox;
        map.fitBounds([[b[1], b[0]], [b[3], b[2]]], { padding: [40, 40] });
    }
}

// ===== Loading / Empty States =====
function showLoading() {
    document.getElementById('resultsBody').innerHTML =
        '<div class="results-loading"><div class="results-loading__spinner"></div><div class="results-loading__text">Searching satellite imagery...</div></div>';
    document.getElementById('resultsFooter').textContent = '';
}

function showEmptyState() {
    document.getElementById('resultsBody').innerHTML =
        '<div class="results-empty"><svg class="results-empty__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><div class="results-empty__text">No imagery found. Try adjusting your search.</div></div>';
    document.getElementById('resultsFooter').textContent = '';
}

// ===== Sidebar Toggles =====
function toggleLeftSidebar() {
    var sidebar = currentTab === 'explorer'
        ? document.getElementById('sidebarExplorer')
        : document.getElementById('sidebarLiveView');
    sidebar.classList.toggle('hidden');
    var toggle = document.getElementById('toggleLeft');
    if (sidebar.classList.contains('hidden')) {
        toggle.classList.add('visible');
    } else {
        toggle.classList.remove('visible');
    }
    setTimeout(function() { map.invalidateSize(); }, 300);
}

function toggleRightSidebar() {
    var sidebar = document.getElementById('sidebarRight');
    sidebar.classList.toggle('hidden');
    setTimeout(function() { map.invalidateSize(); }, 300);
}

// ===== Toast =====
function showToast(msg, type) {
    var toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = 'toast visible' + (type ? ' ' + type : '');
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(function() {
        toast.className = 'toast' + (type ? ' ' + type : '');
    }, 3000);
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', function() {
    initMap();
    setDefaultDateRange();

    // Close toggle button for left sidebar
    document.getElementById('toggleLeft').addEventListener('click', function() {
        var sidebar = currentTab === 'explorer'
            ? document.getElementById('sidebarExplorer')
            : document.getElementById('sidebarLiveView');
        sidebar.classList.remove('hidden');
        this.classList.remove('visible');
        setTimeout(function() { map.invalidateSize(); }, 300);
    });
});
