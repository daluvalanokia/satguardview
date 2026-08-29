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

// Light yellow border color (#FFD700) per user instruction
var BORDER_COLOR = '#FFD700';
var BORDER_FILL_COLOR = '#FFD700';
var BORDER_FILL_OPACITY = 0.08;

// Tile URLs
var streetTilesUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
var satelliteTilesUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
var gibsUrl = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/{gibsDate}/250m/{z}/{y}/{x}.jpg';
var esriAttribution = 'Tiles &copy; Esri, Reference &copy; Esri';
var gibsAttribution = 'Imagery &copy; NASA GIBS, Reference &copy; Esri';

// ===== Date Helpers =====
function getGibsDate() {
    var d = new Date();
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
    gibsLayer = L.tileLayer(gibsUrl, {
        gibsDate: getGibsDate(),
        attribution: gibsAttribution,
        maxZoom: 9,
        tileSize: 256
    });

    streetLayer.addTo(map);
    map.zoomControl.setPosition('bottomleft');
    L.control.attribution({ position: 'bottomright', prefix: 'Leaflet' }).addTo(map);
    map.on('click', onMapClick);

    // Update timestamp
    updateLiveTimestamp();
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
            gibsLayer.options.gibsDate = getGibsDate();
            gibsLayer.addTo(map);
        }
        // Update timestamp
        updateLiveTimestamp();
    }
}

// ===== Live View Timestamp Badge =====
function updateLiveTimestamp() {
    var dateStr = getGibsDate();
    var badge = document.getElementById('liveTimestampDate');
    if (badge) badge.textContent = dateStr;

    var refresh = document.getElementById('liveViewLastRefresh');
    if (refresh) refresh.textContent = getTimestampDisplay();
}

// ===== Refresh Live View (re-adds GIBS layer with today's date) =====
function refreshLiveView() {
    if (!liveViewActive) return;
    var newDate = getGibsDate();
    if (map.hasLayer(gibsLayer)) map.removeLayer(gibsLayer);
    gibsLayer = L.tileLayer(gibsUrl, {
        gibsDate: newDate,
        attribution: gibsAttribution,
        maxZoom: 9,
        tileSize: 256
    });
    gibsLayer.addTo(map);
    updateLiveTimestamp();
    showToast('Live view refreshed — ' + newDate, 'success');
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
        // Reset selection
        document.getElementById('geographyTypeSelect').value = '';
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
