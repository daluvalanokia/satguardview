// ============================================================
// SatGuardView — EO Imagery Explorer + Live View
// ============================================================

var map = null;
var currentTab = 'explorer';
var currentLayer = 'street';
var streetLayer = null;
var satelliteLayer = null;
var darkLayer = null;
var topo3dLayer = null;
var roadViewLayer = null;
var gibsLayer = null;
var currentRectangle = null;
var searchMarkers = [];
var currentBbox = null;
var searchResults = [];
var liveShieldMarker = null;
var liveViewActive = false;
var countryBordersLayer = null;

// Directional View State
var currentDirection = 'north';
var directionalLayers = {
    north: 'MODIS_Terra_CorrectedReflectance_TrueColor',
    south: 'MODIS_Aqua_CorrectedReflectance_TrueColor',
    east: 'VIIRS_SNPP_CorrectedReflectance_TrueColor',
    west: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor'
};

// Pagination & Search State
var currentPage = 1;
var hasMore = false;
var currentSortBy = 'datetime desc';

// Dark Mode State
var isDarkMode = false;

// Leaflet Draw State
var drawHandler = null;

// City autocomplete state
var cityDebounceTimer = null;
var citySuggestions = [];
var citySelectedIndex = -1;

// EO Explorer city autocomplete state
var explorerCityDebounceTimer = null;
var explorerCitySuggestions = [];
var explorerCitySelectedIndex = -1;

// ===== App Status Indicator =====
function setAppStatus(state, message) {
    var status = document.getElementById('appStatus');
    var dot = document.getElementById('appStatusDot');
    var text = document.getElementById('appStatusText');
    if (!status || !dot || !text) return;
    status.classList.remove('idle', 'processing', 'waiting', 'error');
    var msg = message || ({idle:'Ready', processing:'Processing...', waiting:'Waiting...', error:'Error'}[state] || 'Ready');
    status.classList.add(state);
    text.textContent = msg;
}

// Natural Earth 110m — lightweight country borders GeoJSON
var COUNTRY_GEOJSON_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';
var COUNTRY_LABEL_MIN_ZOOM = 3;

// Border styling (#FFD700)
var BORDER_COLOR = '#FFD700';
var BORDER_FILL_COLOR = '#FFD700';
var BORDER_FILL_OPACITY = 0.08;

// Tile URLs
var streetTilesUrl = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png';
var satelliteTilesUrl = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/Sentinel_2_L2A_TrueColor/default/{satelliteDate}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpeg';
var darkTilesUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png';
var topo3dTilesUrl = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
var osmRoadTilesUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
var opentopoAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>, SRTM';
var osmAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
var streetAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
var gibsAttribution = 'Imagery &copy; NASA GIBS (public domain)';
var cartoAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

var GIBS_DEFAULT_LAG_DAYS = 1;
var gibsCurrentLagDays = GIBS_DEFAULT_LAG_DAYS;
var satelliteBasemapDate = getGibsDate(1); // 1-day lag for satellite basemap
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
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) return dateStr;
    var parts = dateStr.split('/');
    if (parts.length === 3) return parts[2] + '-' + parts[0].padStart(2, '0') + '-' + parts[1].padStart(2, '0');
    return dateStr;
}

function setDefaultDateRange() {
    var end = new Date();
    var start = new Date();
    start.setDate(end.getDate() - 90);
    var startElem = document.getElementById('startDate');
    var endElem = document.getElementById('endDate');
    if (startElem) {
        startElem.value = start.getFullYear() + '-' + String(start.getMonth() + 1).padStart(2, '0') + '-' + String(start.getDate()).padStart(2, '0');
    }
    if (endElem) {
        endElem.value = end.getFullYear() + '-' + String(end.getMonth() + 1).padStart(2, '0') + '-' + String(end.getDate()).padStart(2, '0');
    }
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

    streetLayer = L.tileLayer(streetTilesUrl, { attribution: streetAttribution, maxZoom: 19, subdomains: 'abcd' });
    satelliteLayer = L.tileLayer(satelliteTilesUrl, { attribution: gibsAttribution, maxZoom: 9, satelliteDate: satelliteBasemapDate, tileSize: 256 });
    darkLayer = L.tileLayer(darkTilesUrl, { attribution: cartoAttribution, maxZoom: 18, subdomains: 'abcd' });
    topo3dLayer = L.tileLayer(topo3dTilesUrl, { attribution: opentopoAttribution, maxZoom: 17, subdomains: 'abc' });
    roadViewLayer = L.tileLayer(osmRoadTilesUrl, { attribution: osmAttribution, maxZoom: 19, subdomains: 'abc' });
    gibsLayer = createGibsLayer(gibsCurrentLagDays);

    if (isDarkMode) {
        darkLayer.addTo(map);
    } else {
        streetLayer.addTo(map);
    }

    map.zoomControl.setPosition('bottomleft');
    L.control.attribution({ position: 'bottomright', prefix: 'Leaflet' }).addTo(map);
    map.on('click', onMapClick);
    map.on('zoomend', updateLabelVisibility);

    loadCountryBorders();
    updateLiveTimestamp();
}

// ===== Fetch Directional Views Config =====
async function fetchDirectionalViews() {
    try {
        var response = await fetch('/api/directional-views');
        if (response.ok) {
            var data = await response.json();
            if (data && typeof data === 'object') {
                if (data.north) directionalLayers.north = data.north;
                if (data.south) directionalLayers.south = data.south;
                if (data.east) directionalLayers.east = data.east;
                if (data.west) directionalLayers.west = data.west;
            }
        }
    } catch (err) {
        console.log('Using default GIBS directional view configuration:', err);
    }
}

// ===== Directional View Support =====
function getGibsUrl(layerName) {
    return 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/' + layerName + '/default/{gibsDate}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpeg';
}

function switchDirectionalView(direction) {
    if (!direction) return;
    var dirKey = direction.toLowerCase();
    if (dirKey === 'n') dirKey = 'north';
    if (dirKey === 's') dirKey = 'south';
    if (dirKey === 'e') dirKey = 'east';
    if (dirKey === 'w') dirKey = 'west';

    currentDirection = dirKey;

    // Update active class on directional selector buttons
    var btns = document.querySelectorAll('.directional-btn, [data-direction]');
    for (var i = 0; i < btns.length; i++) {
        var btn = btns[i];
        var bDir = (btn.getAttribute('data-direction') || btn.getAttribute('data-dir') || btn.value || btn.id || btn.textContent).toLowerCase();
        if (bDir.indexOf(dirKey) !== -1 || bDir.indexOf(dirKey[0]) !== -1) {
            btn.classList.add('active');
            btn.style.background = '#2563eb';
            btn.style.color = '#ffffff';
        } else {
            btn.classList.remove('active');
            btn.style.background = '';
            btn.style.color = '';
        }
    }

    if (liveViewActive || currentTab === 'liveview') {
        if (map && map.hasLayer(gibsLayer)) {
            map.removeLayer(gibsLayer);
        }
        gibsLayer = createGibsLayer(gibsCurrentLagDays);
        if (map) gibsLayer.addTo(map);
        updateLiveTimestamp();
        showToast('Switched to ' + dirKey.toUpperCase() + ' satellite view', 'success');
    }
}

// ===== GIBS Layer Factory =====
function createGibsLayer(lagDays, layerName) {
    var lName = layerName || directionalLayers[currentDirection] || 'MODIS_Terra_CorrectedReflectance_TrueColor';
    var url = getGibsUrl(lName);
    var layer = L.tileLayer(url, {
        gibsDate: getGibsDate(lagDays),
        attribution: gibsAttribution,
        maxZoom: 9,
        tileSize: 256,
        errorTileUrl: ''
    });

    var erroredTiles = 0;
    layer.on('tileerror', function() {
        erroredTiles++;
        if (erroredTiles >= 3 && gibsCurrentLagDays < GIBS_MAX_FALLBACK_DAYS && liveViewActive) {
            erroredTiles = 0;
            gibsCurrentLagDays++;
            if (map && map.hasLayer(gibsLayer)) map.removeLayer(gibsLayer);
            gibsLayer = createGibsLayer(gibsCurrentLagDays, lName);
            gibsLayer.addTo(map);
            updateLiveTimestamp();
        }
    });

    layer.on('loading', function() { if (liveViewActive) setAppStatus('waiting', 'Loading tiles...'); });
    layer.on('load', function() { if (liveViewActive) setAppStatus('idle'); });

    return layer;
}

// ===== Country Borders Overlay =====
function loadCountryBorders() {
    fetch(COUNTRY_GEOJSON_URL)
        .then(function(r) { return r.json(); })
        .then(function(geojson) {
            countryBordersLayer = L.geoJSON(geojson, {
                style: {
                    color: BORDER_COLOR,
                    weight: 1,
                    opacity: 0.8,
                    fillColor: BORDER_FILL_COLOR,
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
    if (!countryBordersLayer || !map) return;
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
        if (tabExplorer) tabExplorer.classList.add('active');
        if (tabLiveView) tabLiveView.classList.remove('active');
        if (sidebarExplorer) sidebarExplorer.classList.remove('hidden');
        if (sidebarLiveView) sidebarLiveView.classList.add('hidden');
        if (layerSwitcher) layerSwitcher.classList.remove('hidden');
        if (timestampBadge) timestampBadge.classList.add('hidden');
        if (sidebarRight) sidebarRight.classList.remove('hidden');
        liveViewActive = false;

        if (map && map.hasLayer(gibsLayer)) map.removeLayer(gibsLayer);

        if (isDarkMode) {
            if (streetLayer && map.hasLayer(streetLayer)) map.removeLayer(streetLayer);
            if (satelliteLayer && map.hasLayer(satelliteLayer)) map.removeLayer(satelliteLayer);
            if (topo3dLayer && map.hasLayer(topo3dLayer)) map.removeLayer(topo3dLayer);
            if (roadViewLayer && map.hasLayer(roadViewLayer)) map.removeLayer(roadViewLayer);
            if (darkLayer && !map.hasLayer(darkLayer)) darkLayer.addTo(map);
        } else {
            if (darkLayer && map.hasLayer(darkLayer)) map.removeLayer(darkLayer);
            if (topo3dLayer && map.hasLayer(topo3dLayer)) map.removeLayer(topo3dLayer);
            if (roadViewLayer && map.hasLayer(roadViewLayer)) map.removeLayer(roadViewLayer);
            if (currentLayer === 'street') {
                if (streetLayer && !map.hasLayer(streetLayer)) streetLayer.addTo(map);
                if (satelliteLayer && map.hasLayer(satelliteLayer)) map.removeLayer(satelliteLayer);
            } else if (currentLayer === 'satellite') {
                if (satelliteLayer && !map.hasLayer(satelliteLayer)) satelliteLayer.addTo(map);
                if (streetLayer && map.hasLayer(streetLayer)) map.removeLayer(streetLayer);
            } else if (currentLayer === '3d') {
                if (topo3dLayer && !map.hasLayer(topo3dLayer)) topo3dLayer.addTo(map);
                if (streetLayer && map.hasLayer(streetLayer)) map.removeLayer(streetLayer);
                if (satelliteLayer && map.hasLayer(satelliteLayer)) map.removeLayer(satelliteLayer);
            } else if (currentLayer === 'road') {
                if (roadViewLayer && !map.hasLayer(roadViewLayer)) roadViewLayer.addTo(map);
                if (streetLayer && map.hasLayer(streetLayer)) map.removeLayer(streetLayer);
                if (satelliteLayer && map.hasLayer(satelliteLayer)) map.removeLayer(satelliteLayer);
            }
        }

        if (liveShieldMarker) {
            map.removeLayer(liveShieldMarker);
            liveShieldMarker = null;
        }

        if (currentBbox) drawRectangleOnMap(currentBbox);
    } else {
        if (tabExplorer) tabExplorer.classList.remove('active');
        if (tabLiveView) tabLiveView.classList.add('active');
        if (sidebarExplorer) sidebarExplorer.classList.add('hidden');
        if (sidebarLiveView) sidebarLiveView.classList.remove('hidden');
        if (layerSwitcher) layerSwitcher.classList.add('hidden');
        if (timestampBadge) timestampBadge.classList.remove('hidden');
        if (sidebarRight) sidebarRight.classList.add('hidden');
        liveViewActive = true;

        if (streetLayer && map.hasLayer(streetLayer)) map.removeLayer(streetLayer);
        if (satelliteLayer && map.hasLayer(satelliteLayer)) map.removeLayer(satelliteLayer);
        if (darkLayer && map.hasLayer(darkLayer)) map.removeLayer(darkLayer);

        if (currentRectangle) {
            map.removeLayer(currentRectangle);
            currentRectangle = null;
        }

        clearSearchMarkers();

        setAppStatus('waiting', 'Loading satellite tiles...');
        if (map && !map.hasLayer(gibsLayer)) {
            gibsLayer.addTo(map);
        }

        ensureDirectionalViewUI();
        updateLiveTimestamp();
    }

    handleMobileLayout();
}

// ===== Live View Timestamp Badge =====
function updateLiveTimestamp() {
    var dateStr = getGibsDate(gibsCurrentLagDays);
    var badge = document.getElementById('liveTimestampDate');
    if (badge) badge.textContent = dateStr;

    var refresh = document.getElementById('liveViewLastRefresh');
    if (refresh) refresh.textContent = getTimestampDisplay();
}

function refreshLiveView() {
    if (!liveViewActive) return;
    gibsCurrentLagDays = GIBS_DEFAULT_LAG_DAYS;
    if (map && map.hasLayer(gibsLayer)) map.removeLayer(gibsLayer);
    gibsLayer = createGibsLayer(gibsCurrentLagDays);
    if (map) gibsLayer.addTo(map);
    updateLiveTimestamp();
    showToast('Live view refreshed — ' + getGibsDate(gibsCurrentLagDays), 'success');
}

// ===== Layer Switching =====
function switchLayer(layer) {
    if (layer === currentLayer || liveViewActive) return;
    currentLayer = layer;

    var streetBtn = document.getElementById('layerStreet');
    var satelliteBtn = document.getElementById('layerSatellite');
    var topo3dBtn = document.getElementById('layer3d');
    var roadBtn = document.getElementById('layerRoad');

    if (isDarkMode) {
        if (streetBtn) streetBtn.classList.toggle('active', layer === 'street');
        if (satelliteBtn) satelliteBtn.classList.toggle('active', layer === 'satellite');
        if (topo3dBtn) topo3dBtn.classList.toggle('active', layer === '3d');
        if (roadBtn) roadBtn.classList.toggle('active', layer === 'road');
        return;
    }

    // Remove all base layers
    if (streetLayer && map.hasLayer(streetLayer)) map.removeLayer(streetLayer);
    if (satelliteLayer && map.hasLayer(satelliteLayer)) map.removeLayer(satelliteLayer);
    if (darkLayer && map.hasLayer(darkLayer)) map.removeLayer(darkLayer);
    if (topo3dLayer && map.hasLayer(topo3dLayer)) map.removeLayer(topo3dLayer);
    if (roadViewLayer && map.hasLayer(roadViewLayer)) map.removeLayer(roadViewLayer);

    // Deactivate all buttons
    if (streetBtn) streetBtn.classList.remove('active');
    if (satelliteBtn) satelliteBtn.classList.remove('active');
    if (topo3dBtn) topo3dBtn.classList.remove('active');
    if (roadBtn) roadBtn.classList.remove('active');

    // Add the selected layer and activate its button
    if (layer === 'street') {
        if (streetLayer) streetLayer.addTo(map);
        if (streetBtn) streetBtn.classList.add('active');
    } else if (layer === 'satellite') {
        if (satelliteLayer) satelliteLayer.addTo(map);
        if (satelliteBtn) satelliteBtn.classList.add('active');
    } else if (layer === '3d') {
        if (topo3dLayer) topo3dLayer.addTo(map);
        if (topo3dBtn) topo3dBtn.classList.add('active');
    } else if (layer === 'road') {
        if (roadViewLayer) roadViewLayer.addTo(map);
        if (roadBtn) roadBtn.classList.add('active');
    }
}

// ===== Dark Mode Toggle =====
function toggleDarkMode() {
    isDarkMode = !isDarkMode;
    setDarkMode(isDarkMode);
}

function setDarkMode(enable) {
    isDarkMode = enable;
    if (isDarkMode) {
        document.body.classList.add('dark-mode');
        localStorage.setItem('darkMode', 'true');
    } else {
        document.body.classList.remove('dark-mode');
        localStorage.setItem('darkMode', 'false');
    }

    var sunIcon = document.querySelector('#darkModeToggle .sun-icon');
    var moonIcon = document.querySelector('#darkModeToggle .moon-icon');
    if (sunIcon && moonIcon) {
        sunIcon.style.display = isDarkMode ? 'none' : '';
        moonIcon.style.display = isDarkMode ? '' : 'none';
    }
    var icon = document.getElementById('darkModeIcon');
    if (icon) icon.textContent = isDarkMode ? '☀️' : '🌙';

    var toggleBtn = document.getElementById('darkModeToggle');
    if (toggleBtn) {
        if (isDarkMode) toggleBtn.classList.add('active');
        else toggleBtn.classList.remove('active');
    }

    if (currentTab === 'explorer' && !liveViewActive && map) {
        if (isDarkMode) {
            if (streetLayer && map.hasLayer(streetLayer)) map.removeLayer(streetLayer);
            if (satelliteLayer && map.hasLayer(satelliteLayer)) map.removeLayer(satelliteLayer);
            if (topo3dLayer && map.hasLayer(topo3dLayer)) map.removeLayer(topo3dLayer);
            if (roadViewLayer && map.hasLayer(roadViewLayer)) map.removeLayer(roadViewLayer);
            if (!darkLayer) {
                darkLayer = L.tileLayer(darkTilesUrl, { attribution: cartoAttribution, maxZoom: 19, subdomains: 'abcd' });
            }
            if (!map.hasLayer(darkLayer)) darkLayer.addTo(map);
        } else {
            if (darkLayer && map.hasLayer(darkLayer)) map.removeLayer(darkLayer);
            if (currentLayer === 'street') {
                if (streetLayer && !map.hasLayer(streetLayer)) streetLayer.addTo(map);
            } else if (currentLayer === 'satellite') {
                if (satelliteLayer && !map.hasLayer(satelliteLayer)) satelliteLayer.addTo(map);
            } else if (currentLayer === '3d') {
                if (topo3dLayer && !map.hasLayer(topo3dLayer)) topo3dLayer.addTo(map);
            } else if (currentLayer === 'road') {
                if (roadViewLayer && !map.hasLayer(roadViewLayer)) roadViewLayer.addTo(map);
            }
        }
    }
}

// ===== Map Click =====
function onMapClick(e) {
    if (liveViewActive) return;
    if (currentRectangle) return;
    var lat = e.latlng.lat, lng = e.latlng.lng, delta = 0.5;
    currentBbox = [Math.max(-180, lng - delta), Math.max(-90, lat - delta), Math.min(180, lng + delta), Math.min(90, lat + delta)];
    drawRectangleOnMap(currentBbox);
    enableSearch();
}

function drawRectangleOnMap(bbox) {
    if (!map) return;
    if (currentRectangle) map.removeLayer(currentRectangle);
    currentRectangle = L.rectangle([[bbox[1], bbox[0]], [bbox[3], bbox[2]]], {
        color: BORDER_COLOR,
        weight: 2,
        fillColor: BORDER_FILL_COLOR,
        fillOpacity: BORDER_FILL_OPACITY
    }).addTo(map);
}

// ===== Leaflet Draw Plugin for Custom AOI =====
function loadLeafletDraw() {
    if (!document.querySelector('link[href*="leaflet.draw"]')) {
        var css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.css';
        document.head.appendChild(css);
    }
    if (!document.querySelector('script[src*="leaflet.draw"]')) {
        var js = document.createElement('script');
        js.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.js';
        js.onload = function() {
            initDrawEvents();
        };
        document.head.appendChild(js);
    } else {
        initDrawEvents();
    }
}

function initDrawEvents() {
    if (!map) return;
    map.off('draw:created');
    map.on('draw:created', function(e) {
        var layer = e.layer;
        var bounds = layer.getBounds();
        var sw = bounds.getSouthWest();
        var ne = bounds.getNorthEast();

        currentBbox = [
            Math.max(-180, parseFloat(sw.lng.toFixed(6))),
            Math.max(-90, parseFloat(sw.lat.toFixed(6))),
            Math.min(180, parseFloat(ne.lng.toFixed(6))),
            Math.min(90, parseFloat(ne.lat.toFixed(6)))
        ];

        drawRectangleOnMap(currentBbox);
        enableSearch();
        showToast('Custom area drawn successfully', 'success');

        if (drawHandler) {
            drawHandler.disable();
            drawHandler = null;
        }
    });
}

function enableDrawMode() {
    if (liveViewActive) switchTab('explorer');

    if (window.L && window.L.Draw && window.L.Draw.Rectangle) {
        initDrawEvents();
        if (drawHandler) drawHandler.disable();
        drawHandler = new L.Draw.Rectangle(map, {
            shapeOptions: {
                color: BORDER_COLOR,
                weight: 2,
                fillColor: BORDER_FILL_COLOR,
                fillOpacity: BORDER_FILL_OPACITY
            }
        });
        drawHandler.enable();
        showToast('Click and drag on the map to draw a custom area', 'info');
    } else {
        loadLeafletDraw();
        showToast('Loading drawing tools...', 'info');
        setTimeout(function() {
            if (window.L && window.L.Draw && window.L.Draw.Rectangle) {
                enableDrawMode();
            }
        }, 500);
    }
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

    if (geoGroup) {
        geoGroup.style.display = 'block';
        document.getElementById('geographyTypeSelect').value = '';
    }

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

function onGeographyTypeSelected() {
    var geoType = document.getElementById('geographyTypeSelect').value;
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

    var bboxStr = option.getAttribute('data-bbox');
    if (bboxStr) {
        var bbox = bboxStr.split(',').map(parseFloat);
        map.fitBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]], { padding: [40, 40] });
    }

    if (liveShieldMarker) {
        map.removeLayer(liveShieldMarker);
        liveShieldMarker = null;
    }
}

// ===== City Autocomplete =====
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
    var country = countrySelect.options[countrySelect.selectedIndex] ? countrySelect.options[countrySelect.selectedIndex].text : '';
    if (!city) { showToast('Enter a city name', 'error'); return; }

    var query = city + (country ? ', ' + country : '');
    var btn = document.getElementById('explorerCitySearchBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="mini-spinner"></div>'; }
    setAppStatus('processing', 'Locating city...');

    try {
        var response = await fetch('/api/geocode?q=' + encodeURIComponent(query));
        if (!response.ok) throw new Error('Geocoding failed');
        var results = await response.json();
        if (!results || results.length === 0) {
            response = await fetch('/api/geocode?q=' + encodeURIComponent(city));
            results = await response.json();
        }
        if (!results || results.length === 0) { showToast('City not found: ' + city, 'error'); setAppStatus('error', 'City not found'); return; }

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
        setAppStatus('idle');
    } catch (err) {
        showToast('Search error: ' + err.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
        }
        var st = document.getElementById('appStatus');
        if (st && st.classList.contains('processing')) setAppStatus('idle');
    }
}

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
    if (citySuggestions.length === 0) { dropdown.style.display = 'none'; return; }

    var html = '';
    for (var i = 0; i < citySuggestions.length; i++) {
        var item = citySuggestions[i];
        var name = item.name || item.display_name.split(',')[0] || 'Unknown';
        var desc = item.display_name || '';
        if (desc.length > 60) desc = desc.substring(0, 57) + '...';
        html += '<div class="city-suggestion-item" data-index="' + i + '" onclick="selectCitySuggestion(' + i + ')">' +
            '<div class="city-suggestion-item__name">' + escapeHtml(name) + '</div>' +
            '<div class="city-suggestion-item__desc">' + escapeHtml(desc) + '</div></div>';
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
        if (citySelectedIndex >= 0) selectCitySuggestion(citySelectedIndex);
        else searchLiveCity();
    } else if (event.key === 'Escape') {
        dropdown.style.display = 'none';
        citySelectedIndex = -1;
    }
}

function highlightCitySuggestion() {
    var items = document.querySelectorAll('#citySuggestions .city-suggestion-item');
    for (var i = 0; i < items.length; i++) items[i].classList.remove('selected');
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

document.addEventListener('click', function(e) {
    if (!e.target.closest('.city-search-wrapper')) {
        var d1 = document.getElementById('citySuggestions');
        if (d1) d1.style.display = 'none';
        var d2 = document.getElementById('explorerCitySuggestions');
        if (d2) d2.style.display = 'none';
    }
});

async function searchLiveCity() {
    var cityInput = document.getElementById('liveCityInput');
    var countrySelect = document.getElementById('liveCountrySelect');
    var city = cityInput.value.trim();
    var country = countrySelect.options[countrySelect.selectedIndex] ? countrySelect.options[countrySelect.selectedIndex].text : '';

    if (!city) {
        showToast('Enter a city name', 'error');
        return;
    }

    var query = city + (country ? ', ' + country : '');
    cityInput.disabled = true;
    var cityBtn = document.getElementById('liveCitySearchBtn');
    if (cityBtn) { cityBtn.disabled = true; cityBtn.innerHTML = '<div class="mini-spinner"></div>'; }
    setAppStatus('processing', 'Locating city...');

    try {
        var response = await fetch('/api/geocode?q=' + encodeURIComponent(query));
        if (!response.ok) throw new Error('Geocoding failed');
        var results = await response.json();

        if (!results || results.length === 0) {
            response = await fetch('/api/geocode?q=' + encodeURIComponent(city));
            results = await response.json();
        }

        if (!results || results.length === 0) {
            showToast('City not found: ' + city, 'error');
            setAppStatus('error', 'City not found');
            return;
        }

        var best = results[0];
        var lat = parseFloat(best.lat);
        var lng = parseFloat(best.lon);

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

        setAppStatus('idle');
        liveShieldMarker = L.marker([lat, lng], { icon: shieldIcon }).addTo(map);
        liveShieldMarker.bindPopup(
            '<div style="font-size:13px;color:#111827"><strong>' + (best.display_name || city) + '</strong><br>' +
            'Lat: ' + lat.toFixed(4) + ', Lng: ' + lng.toFixed(4) + '<br>' +
            '<span style="color:#2563eb;font-weight:600">Live ' + currentDirection.toUpperCase() + ' satellite imagery</span></div>'
        );

        map.setView([lat, lng], 8, { animate: true });
        showToast('Located: ' + city, 'success');

    } catch (err) {
        showToast('Search error: ' + err.message, 'error');
    } finally {
        cityInput.disabled = false;
        if (cityBtn) {
            cityBtn.disabled = false;
            cityBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
        }
        var st = document.getElementById('appStatus');
        if (st && st.classList.contains('processing')) setAppStatus('idle');
    }
}

// ===== Cloud Slider =====
function onCloudSliderChanged(value) {
    var elem = document.getElementById('cloudValue');
    if (elem) elem.textContent = value + '%';
}

// ===== Search Enable/Disable =====
function enableSearch() {
    var btn = document.getElementById('searchBtn');
    if (btn) btn.disabled = false;
    var hint = document.getElementById('searchHint');
    if (hint) hint.textContent = 'Ready to search';
}
function disableSearch() {
    var btn = document.getElementById('searchBtn');
    if (btn) btn.disabled = true;
    var hint = document.getElementById('searchHint');
    if (hint) hint.textContent = 'Select a location to start';
}

// ===== Search Imagery (with Pagination support) =====
async function searchImagery(isLoadMore) {
    if (!currentBbox) { showToast('Select a location first', 'error'); return; }

    if (isLoadMore) {
        currentPage++;
    } else {
        currentPage = 1;
        searchResults = [];
    }

    var payload = {
        bbox: currentBbox,
        satelliteSource: document.getElementById('sourceSelect') ? document.getElementById('sourceSelect').value : '',
        startDate: formatDateForApi(document.getElementById('startDate') ? document.getElementById('startDate').value : ''),
        endDate: formatDateForApi(document.getElementById('endDate') ? document.getElementById('endDate').value : ''),
        maxCloudCover: document.getElementById('cloudSlider') ? parseInt(document.getElementById('cloudSlider').value) : 100,
        page: currentPage,
        sortBy: currentSortBy
    };

    if (!isLoadMore) showLoading();
    setAppStatus('processing', isLoadMore ? 'Loading page ' + currentPage + '...' : 'Searching imagery...');

    var btn = document.getElementById('searchBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<div class="mini-spinner" style="margin:0 auto"></div> Searching...';
    }

    if (!isLoadMore) clearSearchMarkers();

    try {
        var response = await fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        var data = await response.json();

        if (!response.ok || data.error) {
            showToast(data.error || 'Search failed', 'error');
            if (!isLoadMore) showEmptyState();
            return;
        }

        var newItems = data.items || [];
        var maxCloud = document.getElementById('cloudSlider') ? parseInt(document.getElementById('cloudSlider').value) : 100;
        var filteredNew = newItems.filter(function(item) {
            if (item.cloudCover == null) return true;
            return item.cloudCover <= maxCloud;
        });

        if (isLoadMore) {
            searchResults = searchResults.concat(filteredNew);
        } else {
            searchResults = filteredNew;
        }

        searchResults = sortSearchResults(searchResults, currentSortBy);

        hasMore = data.hasMore !== undefined
            ? data.hasMore
            : (data.total ? searchResults.length < data.total : (newItems.length >= 10));

        var totalCount = data.total || searchResults.length;
        displayResults(searchResults, totalCount);
        addResultMarkers(searchResults);

        showToast(isLoadMore ? 'Loaded page ' + currentPage + ' (' + filteredNew.length + ' items)' : 'Found ' + searchResults.length + ' imagery items', 'success');
        setAppStatus('idle');

    } catch (err) {
        showToast('Network error: ' + err.message, 'error');
        setAppStatus('error', 'Search failed');
        if (!isLoadMore) showEmptyState();
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" style="margin-right:6px"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Search Imagery';
        }
        var st = document.getElementById('appStatus');
        if (st && st.classList.contains('processing')) setAppStatus('idle');
    }
}

function loadMoreResults() {
    searchImagery(true);
}

// ===== Results Sorting =====
function sortSearchResults(items, sortBy) {
    if (!items || !items.length) return [];
    var sorted = items.slice();
    if (sortBy === 'datetime desc' || sortBy === 'newest') {
        sorted.sort(function(a, b) {
            var da = a.dateTime ? new Date(a.dateTime).getTime() : 0;
            var db = b.dateTime ? new Date(b.dateTime).getTime() : 0;
            return db - da;
        });
    } else if (sortBy === 'datetime asc' || sortBy === 'oldest') {
        sorted.sort(function(a, b) {
            var da = a.dateTime ? new Date(a.dateTime).getTime() : 0;
            var db = b.dateTime ? new Date(b.dateTime).getTime() : 0;
            return da - db;
        });
    } else if (sortBy === 'cloudCover asc' || sortBy === 'lowest_cloud') {
        sorted.sort(function(a, b) {
            var ca = a.cloudCover != null ? a.cloudCover : 999;
            var cb = b.cloudCover != null ? b.cloudCover : 999;
            return ca - cb;
        });
    } else if (sortBy === 'cloudCover desc' || sortBy === 'highest_cloud') {
        sorted.sort(function(a, b) {
            var ca = a.cloudCover != null ? a.cloudCover : -1;
            var cb = b.cloudCover != null ? b.cloudCover : -1;
            return cb - ca;
        });
    }
    return sorted;
}

function onSortChanged(value) {
    currentSortBy = value;
    if (searchResults && searchResults.length > 0) {
        searchResults = sortSearchResults(searchResults, currentSortBy);
        displayResults(searchResults, searchResults.length);
    } else if (currentBbox) {
        currentPage = 1;
        searchImagery(false);
    }
}

// ===== Export Buttons (CSV & GeoJSON) =====
function exportResults(format) {
    if (!currentBbox) {
        showToast('Select a location and search first', 'error');
        return;
    }

    var source = document.getElementById('sourceSelect') ? document.getElementById('sourceSelect').value : '';
    var start = document.getElementById('startDate') ? formatDateForApi(document.getElementById('startDate').value) : '';
    var end = document.getElementById('endDate') ? formatDateForApi(document.getElementById('endDate').value) : '';
    var cloud = document.getElementById('cloudSlider') ? document.getElementById('cloudSlider').value : '';

    var params = new URLSearchParams();
    params.append('format', format);
    params.append('bbox', currentBbox.join(','));
    if (source) params.append('satelliteSource', source);
    if (start) params.append('startDate', start);
    if (end) params.append('endDate', end);
    if (cloud) params.append('maxCloudCover', cloud);

    var url = '/api/export?' + params.toString();
    triggerExportDownload(url, format);
}

async function triggerExportDownload(url, format) {
    try {
        setAppStatus('processing', 'Exporting ' + format.toUpperCase() + '...');
        var response = await fetch(url);
        if (response.ok) {
            var blob = await response.blob();
            var downloadUrl = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = downloadUrl;
            a.download = 'satguardview_export_' + Date.now() + '.' + (format === 'geojson' ? 'geojson' : 'csv');
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(downloadUrl);
            showToast('Export downloaded successfully', 'success');
            setAppStatus('idle');
            return;
        }
    } catch (err) {
        console.log('Backend export unavailable, falling back to client export:', err);
    }

    exportClientSide(format);
}

function exportClientSide(format) {
    if (!searchResults || searchResults.length === 0) {
        showToast('No search results to export', 'error');
        setAppStatus('idle');
        return;
    }
    var content = '';
    var mimeType = '';
    var ext = '';

    if (format === 'csv') {
        ext = 'csv';
        mimeType = 'text/csv';
        var headers = ['id', 'dateTime', 'cloudCover', 'platform', 'instruments', 'bbox'];
        content = headers.join(',') + '\n';
        searchResults.forEach(function(item) {
            var row = [
                '"' + (item.id || item.productId || '') + '"',
                '"' + (item.dateTime || '') + '"',
                item.cloudCover != null ? item.cloudCover : '',
                '"' + (item.platform || '') + '"',
                '"' + ((item.instruments || []).join(';')) + '"',
                '"' + ((item.bbox || []).join(',')) + '"'
            ];
            content += row.join(',') + '\n';
        });
    } else {
        ext = 'geojson';
        mimeType = 'application/json';
        var features = searchResults.map(function(item) {
            var bbox = item.bbox || [];
            var geometry = null;
            if (bbox.length >= 4) {
                geometry = {
                    type: 'Polygon',
                    coordinates: [[
                        [bbox[0], bbox[1]],
                        [bbox[2], bbox[1]],
                        [bbox[2], bbox[3]],
                        [bbox[0], bbox[3]],
                        [bbox[0], bbox[1]]
                    ]]
                };
            }
            return {
                type: 'Feature',
                geometry: geometry,
                properties: item
            };
        });
        content = JSON.stringify({ type: 'FeatureCollection', features: features }, null, 2);
    }

    var blob = new Blob([content], { type: mimeType });
    var downloadUrl = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = downloadUrl;
    a.download = 'satguardview_export_' + Date.now() + '.' + ext;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
    showToast('Export downloaded successfully', 'success');
    setAppStatus('idle');
}

// ===== Display Results =====
function displayResults(items, totalCount) {
    var body = document.getElementById('resultsBody');
    var footer = document.getElementById('resultsFooter');
    ensureResultsControls();

    if (!items || items.length === 0) {
        if (body) body.innerHTML = '<div class="results-empty"><svg class="results-empty__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><div class="results-empty__text">No imagery found matching your filters. Try adjusting cloud cover or date range.</div></div>';
        if (footer) footer.textContent = '';
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
    if (body) body.innerHTML = html;

    if (footer) {
        var countText = items.length + ' of ' + (totalCount || items.length) + ' items shown';
        var loadMoreBtnHtml = '';
        if (hasMore) {
            loadMoreBtnHtml = '<button type="button" id="loadMoreBtn" class="load-more-btn" onclick="loadMoreResults()" style="width:100%; margin-top:8px; padding:8px; background:#2563eb; color:#ffffff; border:none; border-radius:6px; cursor:pointer; font-weight:600;">Load More</button>';
        }
        footer.innerHTML = '<div>' + countText + '</div>' + loadMoreBtnHtml;
    }
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
    var body = document.getElementById('resultsBody');
    if (body) body.innerHTML = '<div class="results-loading"><div class="results-loading__spinner"></div><div class="results-loading__text">Searching satellite imagery...</div></div>';
    var footer = document.getElementById('resultsFooter');
    if (footer) footer.textContent = '';
}

function showEmptyState() {
    var body = document.getElementById('resultsBody');
    if (body) body.innerHTML = '<div class="results-empty"><svg class="results-empty__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><div class="results-empty__text">No imagery found. Try adjusting your search.</div></div>';
    var footer = document.getElementById('resultsFooter');
    if (footer) footer.textContent = '';
}

// ===== Sidebar Toggles =====
function toggleLeftSidebar() {
    var sidebar = currentTab === 'explorer'
        ? document.getElementById('sidebarExplorer')
        : document.getElementById('sidebarLiveView');
    if (sidebar) sidebar.classList.toggle('hidden');
    var toggle = document.getElementById('toggleLeft');
    if (toggle && sidebar) {
        if (sidebar.classList.contains('hidden')) {
            toggle.classList.add('visible');
            toggle.style.display = 'flex';
        } else {
            toggle.classList.remove('visible');
        }
    }
    setTimeout(function() { if (map) map.invalidateSize(); }, 300);
}

function toggleRightSidebar() {
    var sidebar = document.getElementById('sidebarRight');
    if (sidebar) sidebar.classList.toggle('hidden');
    setTimeout(function() { if (map) map.invalidateSize(); }, 300);
}

// ===== Mobile Responsive Handler =====
function handleMobileLayout() {
    var isMobile = window.innerWidth < 768;
    var toggleBtn = document.getElementById('toggleLeft');
    var activeSidebar = currentTab === 'explorer'
        ? document.getElementById('sidebarExplorer')
        : document.getElementById('sidebarLiveView');

    if (isMobile) {
        document.body.classList.add('is-mobile');
        if (toggleBtn && activeSidebar) {
            if (activeSidebar.classList.contains('hidden')) {
                toggleBtn.classList.add('visible');
                toggleBtn.style.display = 'flex';
            }
        }
    } else {
        document.body.classList.remove('is-mobile');
    }
    if (map) map.invalidateSize();
}

// ===== Toast =====
function showToast(msg, type) {
    var toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.className = 'toast visible' + (type ? ' ' + type : '');
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(function() {
        toast.className = 'toast' + (type ? ' ' + type : '');
    }, 3000);
}

// ===== Dynamic UI Injection Helpers =====
function ensureDirectionalViewUI() {
    var sidebar = document.getElementById('sidebarLiveView');
    if (!sidebar || document.getElementById('directionalViewSection') || document.getElementById('directionalViewSelector')) return;

    var sec = document.createElement('div');
    sec.className = 'sidebar-left__section';
    sec.id = 'directionalViewSection';
    sec.innerHTML = '<div class="sidebar-left__section-title">Directional View</div>' +
        '<div class="directional-view-buttons" style="display:flex; gap:6px; margin-top:8px;">' +
        '<button type="button" class="directional-btn active" id="dirBtnNorth" data-direction="north" onclick="switchDirectionalView(\'north\')" style="flex:1; padding:6px; font-size:11px; font-weight:600; cursor:pointer; border-radius:4px; border:1px solid #cbd5e1; background:#2563eb; color:#ffffff;">North</button>' +
        '<button type="button" class="directional-btn" id="dirBtnSouth" data-direction="south" onclick="switchDirectionalView(\'south\')" style="flex:1; padding:6px; font-size:11px; font-weight:600; cursor:pointer; border-radius:4px; border:1px solid #cbd5e1;">South</button>' +
        '<button type="button" class="directional-btn" id="dirBtnEast" data-direction="east" onclick="switchDirectionalView(\'east\')" style="flex:1; padding:6px; font-size:11px; font-weight:600; cursor:pointer; border-radius:4px; border:1px solid #cbd5e1;">East</button>' +
        '<button type="button" class="directional-btn" id="dirBtnWest" data-direction="west" onclick="switchDirectionalView(\'west\')" style="flex:1; padding:6px; font-size:11px; font-weight:600; cursor:pointer; border-radius:4px; border:1px solid #cbd5e1;">West</button>' +
        '</div>' +
        '<div class="form-hint" style="margin-top:6px; font-size:11px; color:#64748b;">Select orbital view angle (N: Terra, S: Aqua, E: SNPP, W: NOAA20)</div>';

    var subtitle = sidebar.querySelector('.sidebar-left__subtitle');
    if (subtitle && subtitle.nextSibling) {
        sidebar.insertBefore(sec, subtitle.nextSibling);
    } else {
        sidebar.appendChild(sec);
    }
}

function ensureDarkModeUI() {
    if (document.getElementById('darkModeToggle')) return;
    var container = document.querySelector('.app-header__right');
    if (!container) return;

    var btn = document.createElement('button');
    btn.id = 'darkModeToggle';
    btn.className = 'dark-mode-toggle';
    btn.onclick = toggleDarkMode;
    btn.title = 'Toggle Dark Mode (Hotkey: D)';
    btn.style.cssText = 'background:transparent; border:1px solid rgba(255,255,255,0.3); border-radius:6px; padding:4px 10px; cursor:pointer; color:inherit; display:flex; align-items:center; gap:6px; font-size:12px; font-weight:500; margin-right:8px;';
    btn.innerHTML = '<span id="darkModeIcon">🌙</span> <span>Dark Mode</span>';

    container.insertBefore(btn, container.firstChild);
}

function ensureDrawAreaUI() {
    if (document.getElementById('drawAreaBtn')) return;
    var sidebar = document.getElementById('sidebarExplorer');
    if (!sidebar) return;

    var sections = sidebar.querySelectorAll('.sidebar-left__section');
    if (!sections || sections.length === 0) return;
    var locationSection = sections[0];

    var group = document.createElement('div');
    group.className = 'form-group';
    group.style.marginTop = '10px';
    group.innerHTML = '<button type="button" class="draw-area-btn" id="drawAreaBtn" onclick="enableDrawMode()" style="width:100%; padding:8px; background:var(--bg-secondary, #f1f5f9); border:1px solid var(--border-color, #cbd5e1); border-radius:6px; cursor:pointer; font-weight:600; display:flex; align-items:center; justify-content:center; gap:6px; font-size:12px; color:inherit;">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke-dasharray="4 2"/></svg>' +
        'Draw Area (AOI)' +
        '</button>';

    locationSection.appendChild(group);
}

function ensureResultsControls() {
    var sidebar = document.getElementById('sidebarRight');
    if (!sidebar || document.getElementById('resultsControlsBar') || document.getElementById('sortSelect')) return;

    var header = sidebar.querySelector('.sidebar-right__header');
    if (!header) return;

    var controls = document.createElement('div');
    controls.id = 'resultsControlsBar';
    controls.style.cssText = 'padding:10px 12px; border-bottom:1px solid var(--border-color, #e2e8f0); display:flex; flex-direction:column; gap:8px; background:var(--bg-primary, #ffffff);';
    controls.innerHTML =
        '<div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">' +
            '<label style="font-size:12px; font-weight:600;" for="resultsSortSelect">Sort By:</label>' +
            '<select id="resultsSortSelect" class="form-select" onchange="onSortChanged(this.value)" style="font-size:12px; padding:4px 8px; flex:1;">' +
                '<option value="datetime desc">Newest First</option>' +
                '<option value="datetime asc">Oldest First</option>' +
                '<option value="cloudCover asc">Lowest Cloud Cover</option>' +
                '<option value="cloudCover desc">Highest Cloud Cover</option>' +
            '</select>' +
        '</div>' +
        '<div style="display:flex; gap:6px;">' +
            '<button type="button" class="export-btn" onclick="exportResults(\'csv\')" style="flex:1; padding:6px; font-size:11px; font-weight:600; border-radius:4px; cursor:pointer; background:#f8fafc; border:1px solid #cbd5e1; color:#334155;">Export CSV</button>' +
            '<button type="button" class="export-btn" onclick="exportResults(\'geojson\')" style="flex:1; padding:6px; font-size:11px; font-weight:600; border-radius:4px; cursor:pointer; background:#f8fafc; border:1px solid #cbd5e1; color:#334155;">Export GeoJSON</button>' +
        '</div>';

    header.after(controls);
}

// ===== Keyboard Shortcuts =====
document.addEventListener('keydown', function(e) {
    var activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        if (e.key === 'Escape') {
            document.activeElement.blur();
            var d1 = document.getElementById('citySuggestions');
            if (d1) d1.style.display = 'none';
            var d2 = document.getElementById('explorerCitySuggestions');
            if (d2) d2.style.display = 'none';
        }
        return;
    }

    var key = e.key;

    if (key === 's' || key === 'S') {
        e.preventDefault();
        var searchInput = currentTab === 'explorer'
            ? document.getElementById('explorerCityInput')
            : document.getElementById('liveCityInput');
        if (searchInput && !searchInput.disabled && searchInput.offsetParent !== null) {
            searchInput.focus();
        } else {
            var btn = document.getElementById('searchBtn');
            if (btn) btn.focus();
        }
    } else if (key === 'l' || key === 'L') {
        e.preventDefault();
        if (currentTab === 'explorer' && !liveViewActive) {
            var layers = ['street', 'satellite', '3d', 'road'];
            var idx = layers.indexOf(currentLayer);
            if (idx === -1) idx = 0;
            idx = (idx + 1) % layers.length;
            switchLayer(layers[idx]);
        }
    } else if (key === 'd' || key === 'D') {
        e.preventDefault();
        toggleDarkMode();
    } else if (key === 'r' || key === 'R') {
        e.preventDefault();
        if (currentTab === 'liveview' || liveViewActive) {
            refreshLiveView();
        }
    } else if (key === 'Escape') {
        e.preventDefault();
        var sbLeft = currentTab === 'explorer'
            ? document.getElementById('sidebarExplorer')
            : document.getElementById('sidebarLiveView');
        var sbRight = document.getElementById('sidebarRight');
        if (sbLeft && !sbLeft.classList.contains('hidden')) {
            toggleLeftSidebar();
        }
        if (sbRight && !sbRight.classList.contains('hidden')) {
            toggleRightSidebar();
        }
    }
});

// ===== App Initialization =====
document.addEventListener('DOMContentLoaded', function() {
    initMap();
    setDefaultDateRange();

    fetchDirectionalViews();
    loadLeafletDraw();

    ensureDirectionalViewUI();
    ensureDarkModeUI();
    ensureDrawAreaUI();
    ensureResultsControls();

    if (localStorage.getItem('darkMode') === 'true') {
        setDarkMode(true);
    }

    handleMobileLayout();
    window.addEventListener('resize', handleMobileLayout);

    var toggleBtn = document.getElementById('toggleLeft');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', function() {
            var sidebar = currentTab === 'explorer'
                ? document.getElementById('sidebarExplorer')
                : document.getElementById('sidebarLiveView');
            if (sidebar) sidebar.classList.remove('hidden');
            this.classList.remove('visible');
            setTimeout(function() { if (map) map.invalidateSize(); }, 300);
        });
    }
});

// ===== HTML Compatibility Aliases =====
// These functions bridge the static HTML onclick handlers with the JS implementations

function setDirectionalView(direction) {
    switchDirectionalView(direction);
}

function toggleDrawMode() {
    enableDrawMode();
}

function toggleMobileMenu() {
    var sidebar = currentTab === 'explorer'
        ? document.getElementById('sidebarExplorer')
        : document.getElementById('sidebarLiveView');
    if (sidebar) {
        sidebar.classList.toggle('hidden');
        setTimeout(function() { if (map) map.invalidateSize(); }, 300);
    }
}

function sortResults(value) {
    // Map HTML sort values to JS sort values
    var sortBy = value;
    if (value === 'date-desc') sortBy = 'datetime desc';
    else if (value === 'date-asc') sortBy = 'datetime asc';
    else if (value === 'cloud-asc') sortBy = 'cloudCover asc';
    else if (value === 'cloud-desc') sortBy = 'cloudCover desc';
    onSortChanged(sortBy);
}

