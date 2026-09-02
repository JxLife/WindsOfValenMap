(() => {
  const viewport = document.getElementById('viewport');
  const mapLayer = document.getElementById('map-layer');
  const mapImage = document.getElementById('map-image');
  const markerLayer = document.getElementById('marker-layer');
  const searchInput = document.getElementById('search');
  const legendEl = document.getElementById('legend');

  const WIKI_BASE = 'https://windsofvalenwiki.com/w/';
  const MIN_SCALE = 0.15;
  const MAX_SCALE = 6;
  const TYPE_LABELS = {
    area: 'City / Area',
    location: 'Location',
    boss: 'Boss',
    enemy: 'Enemy',
    ore: 'Ore / Mining',
    fishing: 'Fishing Spot',
  };

  const CLUSTER_PIXELS = 45;

  let markers = [];
  let activeTypes = new Set(Object.keys(TYPE_LABELS));
  let scale = 1;
  let lastClusterScale = null;
  let offsetX = 0;
  let offsetY = 0;
  let dragging = false;
  let didDrag = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragOffsetStartX = 0;
  let dragOffsetStartY = 0;

  function applyTransform() {
    mapLayer.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    if (scale !== lastClusterScale) {
      lastClusterScale = scale;
      renderMarkers();
    } else {
      updateMarkerPositions();
    }
  }

  // Same-type markers that would overlap on screen at the current zoom level
  // are grouped into a single cluster dot (single-linkage: a marker joins a
  // group if it's close enough to ANY member already in it, so a loose chain
  // of nearby dots still collapses into one blob).
  function computeClusters() {
    const byType = {};
    markers.forEach((m) => {
      const t = m.type || 'location';
      (byType[t] = byType[t] || []).push(m);
    });
    const clusters = [];
    Object.values(byType).forEach((list) => {
      const used = new Array(list.length).fill(false);
      for (let i = 0; i < list.length; i++) {
        if (used[i]) continue;
        const group = [list[i]];
        used[i] = true;
        for (let j = i + 1; j < list.length; j++) {
          if (used[j]) continue;
          const closeToGroup = group.some((g) => {
            const dx = (g.x - list[j].x) * scale;
            const dy = (g.y - list[j].y) * scale;
            return Math.hypot(dx, dy) < CLUSTER_PIXELS;
          });
          if (closeToGroup) {
            group.push(list[j]);
            used[j] = true;
          }
        }
        clusters.push(group);
      }
    });
    return clusters;
  }

  function updateMarkerPositions() {
    markerLayer.querySelectorAll('.map-marker').forEach((el) => {
      const x = Number(el.dataset.x);
      const y = Number(el.dataset.y);
      el.style.left = (offsetX + x * scale) + 'px';
      el.style.top = (offsetY + y * scale) + 'px';
    });
  }

  function fitToViewport() {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const iw = mapImage.naturalWidth || 4992;
    const ih = mapImage.naturalHeight || 5376;
    scale = Math.min(vw / iw, vh / ih);
    offsetX = (vw - iw * scale) / 2;
    offsetY = (vh - ih * scale) / 2;
    applyTransform();
  }

  function zoomAt(clientX, clientY, factor) {
    const rect = viewport.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;
    const imgX = (mouseX - offsetX) / scale;
    const imgY = (mouseY - offsetY) / scale;
    scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * factor));
    offsetX = mouseX - imgX * scale;
    offsetY = mouseY - imgY * scale;
    applyTransform();
  }

  function buildLegend() {
    legendEl.innerHTML = '';
    Object.entries(TYPE_LABELS).forEach(([type, label]) => {
      const item = document.createElement('div');
      item.className = 'legend-item active';
      item.dataset.type = type;
      item.innerHTML = `<span class="legend-dot" style="background:var(--legend-${type})"></span>${label}`;
      item.addEventListener('click', () => {
        if (activeTypes.has(type)) {
          activeTypes.delete(type);
          item.classList.remove('active');
        } else {
          activeTypes.add(type);
          item.classList.add('active');
        }
        applyFilters();
      });
      legendEl.appendChild(item);
    });
  }

  function applyFilters() {
    const query = searchInput.value.trim().toLowerCase();
    markerLayer.querySelectorAll('.map-marker').forEach((el) => {
      const type = el.dataset.type;
      const label = el.dataset.label.toLowerCase();
      const typeOk = activeTypes.has(type);
      const queryOk = !query || label.includes(query);
      el.classList.toggle('hidden', !(typeOk && queryOk));
      el.classList.toggle('match', queryOk && query.length > 0 && typeOk);
    });
  }

  function renderSingleMarker(m) {
    const el = document.createElement('div');
    el.className = 'map-marker';
    el.dataset.type = m.type || 'location';
    el.dataset.x = m.x;
    el.dataset.y = m.y;
    el.dataset.label = m.label;
    el.innerHTML = '<div class="map-marker-dot"></div><div class="map-marker-label"></div>';
    el.querySelector('.map-marker-label').textContent = m.label;
    el.title = m.wikiTitle ? `${m.label} — click to open wiki page` : m.label;

    if (m.wikiTitle) {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        window.open(WIKI_BASE + encodeURIComponent(m.wikiTitle.replace(/ /g, '_')), '_blank', 'noopener');
      });
    }
    return el;
  }

  function renderClusterMarker(group) {
    const cx = group.reduce((s, m) => s + m.x, 0) / group.length;
    const cy = group.reduce((s, m) => s + m.y, 0) / group.length;
    const type = group[0].type || 'location';
    const el = document.createElement('div');
    el.className = 'map-marker map-marker-cluster';
    el.dataset.type = type;
    el.dataset.x = cx;
    el.dataset.y = cy;
    el.dataset.label = group.map((m) => m.label).join(', ');
    el.innerHTML = '<div class="map-marker-dot"><span class="cluster-count"></span></div><div class="map-marker-label"></div>';
    el.querySelector('.cluster-count').textContent = group.length;
    el.querySelector('.map-marker-label').textContent = `${group.length} ${TYPE_LABELS[type] || 'markers'}`;
    el.title = `${group.length} markers here — click to zoom in`;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const rect = viewport.getBoundingClientRect();
      const screenX = rect.left + offsetX + cx * scale;
      const screenY = rect.top + offsetY + cy * scale;
      zoomAt(screenX, screenY, 2.2);
    });
    return el;
  }

  function renderMarkers() {
    markerLayer.innerHTML = '';
    const searching = searchInput.value.trim().length > 0;
    const fullyZoomedIn = scale >= MAX_SCALE - 0.001;
    const groups = (searching || fullyZoomedIn) ? markers.map((m) => [m]) : computeClusters();
    groups.forEach((group) => {
      const el = group.length === 1 ? renderSingleMarker(group[0]) : renderClusterMarker(group);
      markerLayer.appendChild(el);
    });
    updateMarkerPositions();
    applyFilters();
  }

  viewport.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    didDrag = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragOffsetStartX = offsetX;
    dragOffsetStartY = offsetY;
    viewport.classList.add('dragging');
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    if (Math.abs(e.clientX - dragStartX) > 3 || Math.abs(e.clientY - dragStartY) > 3) didDrag = true;
    offsetX = dragOffsetStartX + (e.clientX - dragStartX);
    offsetY = dragOffsetStartY + (e.clientY - dragStartY);
    applyTransform();
  });

  window.addEventListener('mouseup', () => {
    dragging = false;
    viewport.classList.remove('dragging');
  });

  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    zoomAt(e.clientX, e.clientY, factor);
  }, { passive: false });

  // Touch support: one-finger pan, two-finger pinch zoom.
  let pinchStartDist = 0;
  let pinchStartScale = 1;
  viewport.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      dragging = true;
      dragStartX = e.touches[0].clientX;
      dragStartY = e.touches[0].clientY;
      dragOffsetStartX = offsetX;
      dragOffsetStartY = offsetY;
    } else if (e.touches.length === 2) {
      dragging = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDist = Math.hypot(dx, dy);
      pinchStartScale = scale;
    }
  }, { passive: true });
  viewport.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1 && dragging) {
      offsetX = dragOffsetStartX + (e.touches[0].clientX - dragStartX);
      offsetY = dragOffsetStartY + (e.touches[0].clientY - dragStartY);
      applyTransform();
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      zoomAt(midX, midY, (dist / pinchStartDist) * (pinchStartScale / scale));
    }
  }, { passive: true });
  viewport.addEventListener('touchend', () => { dragging = false; });

  document.getElementById('zoom-in').addEventListener('click', () => {
    const rect = viewport.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.25);
  });
  document.getElementById('zoom-out').addEventListener('click', () => {
    const rect = viewport.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1 / 1.25);
  });
  document.getElementById('zoom-reset').addEventListener('click', fitToViewport);

  searchInput.addEventListener('input', renderMarkers);

  window.addEventListener('resize', fitToViewport);

  async function loadMarkers() {
    const res = await fetch('map_markers.json');
    markers = await res.json();
  }

  function setLegendColors() {
    const root = document.documentElement.style;
    root.setProperty('--legend-area', '#fdf6e3');
    root.setProperty('--legend-location', '#ffb000');
    root.setProperty('--legend-boss', '#e13a3a');
    root.setProperty('--legend-enemy', '#b45ae1');
    root.setProperty('--legend-ore', '#b08968');
    root.setProperty('--legend-fishing', '#3a9be1');
  }

  async function init() {
    setLegendColors();
    buildLegend();
    await loadMarkers();
    fitToViewport();
    renderMarkers();
  }

  if (mapImage.complete) {
    init();
  } else {
    mapImage.addEventListener('load', init);
  }
})();
