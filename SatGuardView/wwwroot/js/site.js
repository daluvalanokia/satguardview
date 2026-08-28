// ============================================================
// EO Imagery Explorer - SatGuardView
// ============================================================

var map = null;
var currentLayer = 'street';
var streetLayer = null;
var satelliteLayer = null;
var currentRectangle = null;
var searchMarkers = [];
var currentBbox = null;
var searchResults = [];
var liveViewActive = false;

var streetTilesUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
var satelliteTilesUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
var attribution = 'Tiles &copy; Esri, Reference &copy; Esri';

// Light yellow border color for country/region rectangles
var BORDER_COLOR = '#FFD700'; // light yellow / gold
var BORDER_FILL_COLOR = '#FFD700';
var BORDER_FILL_OPACITY = 0.08;

// ===== Initialize Map =====
function initMap() {
    map = L.map('map', {
        center: [20, 0], zoom: 2, minZoom: 2, maxZoom: 18,
        zoomControl: true, worldCopyJump: true, attributionControl: true
    });
    streetLayer = L.tileLayer(streetTilesUrl, { attribution: attribution, maxZoom: 18 }).addTo(map);
    satelliteLayer = L.tileLayer(satelliteTilesUrl, { attribution: attribution, maxZoom: 18 });
    map.zoomControl.setPosition('bottomleft');
    L.control.attribution({ position: 'bottomright', prefix: 'Leaflet' }).addTo(map);
    map.on('click', onMapClick);
}

// ===== Map Click =====
function onMapClick(e) {
    if (currentRectangle) return;
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

// ===== Live View Tab (toggles satellite/street layer) =====
function toggleLiveView() {
    var tab = document.getElementById('liveViewTab');
    liveViewActive = !liveViewActive;
    if (liveViewActive) {
        tab.classList.add('active');
        switchLayer('satellite');
    } else {
        tab.classList.remove('active');
        switchLayer('street');
    }
}

// ===== Layer Switching =====
function switchLayer(layer) {
    if (layer === currentLayer) return;
    if (layer === 'street') {
        map.removeLayer(satelliteLayer); map.addLayer(streetLayer);
        document.getElementById('layerStreet').classList.add('active');
        document.getElementById('layerSatellite').classList.remove('active');
    } else {
        map.removeLayer(streetLayer); map.addLayer(satelliteLayer);
        document.getElementById('layerSatellite').classList.add('active');
        document.getElementById('layerStreet').classList.remove('active');
    }
    currentLayer = layer;
}

// ===== Country Selection =====
function onCountrySelected() {
    var select = document.getElementById('countrySelect');
    var option = select.options[select.selectedIndex];
    if (!option || !option.value) {
        currentBbox = null;
        if (currentRectangle) { map.removeLayer(currentRectangle); currentRectangle = null; }
        disableSearch(); return;
    }
    var bboxStr = option.getAttribute('data-bbox');
    if (!bboxStr) return;
    var bbox = bboxStr.split(',').map(parseFloat);
    currentBbox = bbox;
    // Draw with light yellow border
    drawRectangleOnMap(bbox);
    map.fitBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]], { padding: [40, 40] });
    enableSearch();
}

// ===== Cloud Slider =====
function onCloudSliderChanged(value) {
    document.getElementById('cloudValue').textContent = value + '%';
}

// ===== Search Enable/Disable =====
function enableSearch() {
    document.getElementById('searchBtn').disabled = false;
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
    document.getElementById('searchBtn').disabled = true;
    document.getElementById('searchBtn').textContent = 'Searching...';
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
        // Store all results from API (no server-side cloud filter — matches Base44 behavior)
        searchResults = data.items || [];
        // Client-side cloud cover filtering
        var maxCloud = parseInt(document.getElementById('cloudSlider').value);
        var filteredResults = searchResults.filter(function(item) {
            if (item.cloudCover == null) return true; // keep items without cloud cover data (e.g., Sentinel-1, DEM)
            return item.cloudCover <= maxCloud;
        });
        displayResults(filteredResults, data.total || searchResults.length);
        addResultMarkers(filteredResults);
        showToast('Found ' + filteredResults.length + ' imagery items', 'success');
    } catch (err) {
        showToast('Network error: ' + err.message, 'error');
        showEmptyState();
    } finally {
        document.getElementById('searchBtn').disabled = false;
        document.getElementById('searchBtn').textContent = 'Search Imagery';
    }
}

// ===== Display Results in Search Results Panel =====
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

// ===== Map Markers =====
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
    if (!searchResults[index]) return;
    var item = searchResults[index];
    if (item.bbox && item.bbox.length >= 4)
        map.fitBounds([[item.bbox[1], item.bbox[0]], [item.bbox[3], item.bbox[2]]], { padding: [50, 50] });
}

// ===== States =====
function showLoading() {
    document.getElementById('resultsBody').innerHTML = '<div class="results-loading"><div class="results-loading__spinner"></div><div class="results-loading__text">Searching satellite catalogs...</div></div>';
    document.getElementById('resultsFooter').textContent = '';
}
function showEmptyState() {
    document.getElementById('resultsBody').innerHTML = '<div class="results-empty"><svg class="results-empty__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg><div class="results-empty__text">Select a location and search to browse available imagery</div></div>';
    document.getElementById('resultsFooter').textContent = '';
}

// ===== Sidebar Toggles =====
function toggleLeftSidebar() {
    document.getElementById('sidebarLeft').classList.toggle('hidden');
    document.getElementById('toggleLeft').classList.toggle('visible');
    setTimeout(function() { if (map) map.invalidateSize(); }, 300);
}
function toggleRightSidebar() {
    document.getElementById('sidebarRight').classList.toggle('hidden');
    document.getElementById('toggleRight').classList.toggle('visible');
    setTimeout(function() { if (map) map.invalidateSize(); }, 300);
}

// ===== Toast =====
function showToast(message, type) {
    var toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast visible' + (type ? ' ' + type : '');
    setTimeout(function() { toast.classList.remove('visible'); }, 3000);
}

// ===== Date Formatting =====
function formatDateForApi(dateStr) {
    if (!dateStr) return '';
    var parts = dateStr.split('/');
    if (parts.length === 3) return parts[2] + '-' + parts[0].padStart(2, '0') + '-' + parts[1].padStart(2, '0');
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    var d = new Date(dateStr);
    if (!isNaN(d)) return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    return dateStr;
}

// ===== Default Dates (3 months ago → today) =====
function setDefaultDates() {
    var today = new Date();
    var threeMonthsAgo = new Date(today);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    document.getElementById('startDate').value =
        String(threeMonthsAgo.getMonth() + 1).padStart(2, '0') + '/' +
        String(threeMonthsAgo.getDate()).padStart(2, '0') + '/' +
        threeMonthsAgo.getFullYear();
    document.getElementById('endDate').value =
        String(today.getMonth() + 1).padStart(2, '0') + '/' +
        String(today.getDate()).padStart(2, '0') + '/' +
        today.getFullYear();
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', function() {
    initMap();
    setDefaultDates();
});
