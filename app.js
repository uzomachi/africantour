/* UI + Cesium rendering. Rules live in tour-core.js and flight-core.js; data lives in places.js;
   your Google key lives in config.js. Nothing here invents facts. */
(() => {
  const $ = id => document.getElementById(id);
  const all = typeof PLACES !== 'undefined' ? PLACES : [];
  const key = String((window.APP_CONFIG || {}).GOOGLE_MAPS_API_KEY || '').trim();
  const hasKey = key.length > 0 && !/^YOUR_/i.test(key);
  const rad = deg => deg * Math.PI / 180;

  // 1. Check the data before drawing anything (same idea as the starter).
  const problems = all
    .map((p, n) => ({ label: (p && p.name) || 'Record ' + (n + 1), issues: Tour.validatePlace(p) }))
    .filter(r => r.issues.length);
  const probBox = $('problems');
  if (problems.length) {
    const strong = document.createElement('strong');
    strong.textContent = 'Needs verification (not shown on the map):';
    const ul = document.createElement('ul');
    problems.forEach(r => { const li = document.createElement('li'); li.textContent = `${r.label}: ${r.issues.join('; ')}`; ul.appendChild(li); });
    probBox.append(strong, ul);
  }
  const stops = Tour.usable(all);

  // 2. State
  let i = 0;                    // selected stop
  let mode = 'tour';            // 'tour' | 'flight'
  let viewer = null, tileset = null, markers = [], plane = null;
  let navToken = 0;             // lets a newer camera move cancel an older one
  let ground = 0;               // metres above the ellipsoid of the surface under the camera target
  let fstate = Flight.initial();
  let autoTimer = null, autoRemaining = 0;

  let notice = '';              // persistent explanation shown when 3D scans are missing
  const say = t => { $('message').textContent = t; };

  // ---------- Stop panel (works even if the globe fails) ----------
  function renderSource(el, p) {
    el.textContent = '';
    el.append('Source: ');
    String(p.source).split(/(https?:\/\/[^\s)]+)/).forEach(part => {
      if (/^https?:\/\//.test(part)) {
        const a = document.createElement('a');
        a.href = part; a.textContent = part; a.target = '_blank'; a.rel = 'noopener noreferrer';
        el.appendChild(a);
      } else el.append(part);
    });
    el.append(` · Checked: ${p.checked}`);
  }

  function renderStop() {
    if (!stops.length) { $('name').textContent = 'No usable stops yet'; $('desc').textContent = 'Fix the records in places.js.'; return; }
    const p = stops[i];
    $('count').textContent = `Stop ${i + 1} of ${stops.length}`;
    const chips = $('chips'); chips.textContent = '';
    [p.era, p.country, p.category].filter(Boolean).forEach(t => { const s = document.createElement('span'); s.className = 'chip'; s.textContent = t; chips.appendChild(s); });
    $('name').textContent = p.name;
    $('desc').textContent = p.description;
    $('explore').textContent = p.explore ? 'Try this: ' + p.explore : '';
    $('explore').hidden = !p.explore;
    renderSource($('source'), p);
    const img = $('photo');
    if (p.photo) { img.src = p.photo; img.alt = p.photoAlt; img.hidden = false; }
    else { img.hidden = true; img.removeAttribute('src'); }
    document.querySelectorAll('#stoplist button').forEach((b, n) => { if (n === i) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
    markers.forEach((m, n) => { m.point.color = n === i ? Cesium.Color.GOLD : markerColor(stops[n]); m.point.pixelSize = n === i ? 18 : 12; });
  }

  function buildStopList() {
    const ol = $('stoplist');
    stops.forEach((p, n) => {
      const li = document.createElement('li'), b = document.createElement('button');
      b.textContent = `${n + 1}. ${p.name} (${p.era || p.country || ''})`;
      b.onclick = () => go(n);
      li.appendChild(b); ol.appendChild(li);
    });
  }

  function go(n) { i = n; resetAuto(); renderStop(); if (viewer && mode === 'tour') goToStop(stops[i]); }
  $('next').onclick = () => go(Tour.nextIndex(i, stops.length));
  $('prev').onclick = () => go(Tour.prevIndex(i, stops.length));

  // ---------- Auto-tour (the lab's added feature) ----------
  const interval = () => Number($('interval').value) || 25;
  function resetAuto() { autoRemaining = interval(); paintCountdown(); }
  function paintCountdown() { $('countdown').textContent = autoTimer ? `Next stop in ${Math.ceil(autoRemaining)} s` : ''; }
  function startAuto() {
    resetAuto();
    $('auto').setAttribute('aria-pressed', 'true'); $('auto').textContent = '■ Stop auto-tour';
    autoTimer = setInterval(() => {
      const r = Tour.autoTourStep({ index: i, remaining: autoRemaining }, 1, interval(), stops.length);
      autoRemaining = r.remaining;
      if (r.advanced) go(r.index);       // go() resets the countdown and flies the camera
      paintCountdown();
    }, 1000);
    paintCountdown();
  }
  function stopAuto() {
    clearInterval(autoTimer); autoTimer = null;
    $('auto').setAttribute('aria-pressed', 'false'); $('auto').textContent = '▶ Auto-tour';
    paintCountdown();
  }
  $('auto').onclick = () => (autoTimer ? stopAuto() : startAuto());
  $('interval').onchange = resetAuto;
  $('auto').disabled = stops.length < 2;
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stopAuto(); fstate.paused = true; paintFlight(); } });

  // ---------- Globe ----------
  const markerColor = p => (p && p.category === 'Modern city' ? Cesium.Color.CYAN : Cesium.Color.ORANGE);

  function flyView(center, headingDeg, pitchDeg, range, duration) {
    return new Promise(resolve => viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(center, 1), {
      offset: new Cesium.HeadingPitchRange(rad(headingDeg), rad(pitchDeg), range),
      duration, complete: resolve, cancel: resolve
    }));
  }

  // Height of the surface (ground or rooftop) in metres above the ellipsoid.
  // Needed because many stops are high above sea level (Nairobi, Lalibela, Johannesburg).
  async function surfaceHeight(lon, lat) {
    if (!tileset || !viewer.scene.sampleHeightSupported) return 0;
    const pos = Cesium.Cartographic.fromDegrees(lon, lat);
    try {
      const res = await Promise.race([
        viewer.scene.sampleHeightMostDetailed([pos]),
        new Promise(r => setTimeout(() => r(null), 8000))
      ]);
      const h = res && res[0] && res[0].height;
      if (Number.isFinite(h)) return h;
    } catch (e) { console.warn('sampleHeightMostDetailed failed', e); }
    const quick = viewer.scene.sampleHeight(Cesium.Cartographic.fromDegrees(lon, lat));
    return Number.isFinite(quick) ? quick : 0;
  }

  async function goToStop(p) {
    const token = ++navToken;
    const cam = Tour.cameraFor(p);
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);   // release any flight-mode lock
    if (tileset) {
      say('Flying in… loading the 3D scan.');
      // Approach high enough to be above any ground in Africa, so tiles load before we get close.
      await flyView(Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 0), cam.heading, -45, 20000, 2);
      if (token !== navToken) return;
      ground = await surfaceHeight(p.lon, p.lat);
      if (token !== navToken) return;
    }
    await flyView(Cesium.Cartesian3.fromDegrees(p.lon, p.lat, ground), cam.heading, cam.pitch, cam.range, tileset ? 3 : 2.5);
    if (token === navToken) say((tileset
      ? 'Virtual tour over Google 3D scans. Drag to orbit, scroll to zoom. '
      : 'Grid globe, no 3D scans. ') + notice + 'A camera flight is not a walking route.');
  }

  // ---------- Free flight ----------
  const surfaceNow = () => ground;
  const flightPosition = () => Cesium.Cartesian3.fromDegrees(fstate.lon, fstate.lat, surfaceNow() + fstate.height);
  function follow() {
    viewer.camera.lookAt(flightPosition(), new Cesium.HeadingPitchRange(rad(fstate.heading), rad(-30), 1500));
  }
  function paintFlight() {
    if (mode !== 'flight') return;
    say(fstate.paused ? 'Paused — ready to inspect' : 'Flying — simulated movement');
    $('readout').textContent = `Heading ${fstate.heading.toFixed(0)}° · Lon ${fstate.lon.toFixed(5)} · Lat ${fstate.lat.toFixed(5)} · ${fstate.height.toFixed(0)} m above ground · ${fstate.speed.toFixed(0)} m/s`;
    const nb = Tour.nearest(fstate, stops);
    $('nearest').textContent = nb ? `Nearest stop: ${nb.place.name}, ${nb.km.toFixed(1)} km away (straight line)` : '';
  }
  let lastSample = 0;
  function sampleGround(now) {
    if (!tileset || now - lastSample < 300) return;
    lastSample = now;
    const h = viewer.scene.sampleHeight(Cesium.Cartographic.fromDegrees(fstate.lon, fstate.lat));
    if (Number.isFinite(h)) ground += (h - ground) * (h > ground ? 0.5 : 0.1);   // rise fast, sink slowly: stay above rooftops
  }

  function setMode(next) {
    if (next === mode || !viewer && next === 'flight') return;
    mode = next;
    $('modeTour').setAttribute('aria-pressed', String(next === 'tour'));
    $('modeFlight').setAttribute('aria-pressed', String(next === 'flight'));
    $('tourPanel').hidden = next !== 'tour';
    $('flightPanel').hidden = next !== 'flight';
    plane.show = next === 'flight';
    navToken++;                        // cancel any camera move in progress
    viewer.camera.cancelFlight();
    if (next === 'flight') {
      stopAuto();
      const p = stops[i], cam = Tour.cameraFor(p);
      fstate = { ...Flight.initial(), lon: p.lon, lat: p.lat, heading: cam.heading };
      $('speed').value = fstate.speed; $('height').value = fstate.height;
      paintFlight(); follow();
    } else {
      renderStop(); goToStop(stops[i]);
    }
  }
  $('modeTour').onclick = () => setMode('tour');
  $('modeFlight').onclick = () => setMode('flight');

  const turn = d => { if (mode !== 'flight') return; fstate.heading = Flight.wrap(fstate.heading + d); paintFlight(); follow(); };
  $('fly').onclick = () => { fstate.paused = false; paintFlight(); };
  $('pause').onclick = () => { fstate.paused = true; paintFlight(); };
  $('left').onclick = () => turn(-10);
  $('right').onclick = () => turn(10);
  $('reset').onclick = () => {
    const p = stops[i], cam = Tour.cameraFor(p);
    fstate = { ...Flight.initial(), lon: p.lon, lat: p.lat, heading: cam.heading };
    $('speed').value = fstate.speed; $('height').value = fstate.height; paintFlight(); follow();
  };
  for (const [id, min, max] of [['speed', 0, 250], ['height', 50, 5000]]) {
    $(id).onchange = () => { const n = Number($(id).value); if (Number.isFinite(n)) fstate[id] = Flight.clamp(n, min, max); $(id).value = fstate[id]; paintFlight(); follow(); };
  }
  document.addEventListener('keydown', e => {
    if (mode !== 'flight' || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') { turn(-10); e.preventDefault(); }
    if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') { turn(10); e.preventDefault(); }
  });

  // ---------- Start-up ----------
  buildStopList();
  renderStop();
  resetAuto();

  async function startGlobe() {
    if (typeof Cesium === 'undefined') {
      say('Cesium did not load. The stop list still works; check internet or CDN access for the globe.');
      $('modeFlight').disabled = true; return;
    }
    try {
      viewer = new Cesium.Viewer('globe', {
        baseLayer: false, baseLayerPicker: false, geocoder: false, animation: false,   // geocoder:false is required by Google's terms
        timeline: false, homeButton: false, sceneModePicker: false, navigationHelpButton: false,
        fullscreenButton: false, infoBox: false, selectionIndicator: false,
        terrainProvider: new Cesium.EllipsoidTerrainProvider()
      });
      viewer.imageryLayers.addImageryProvider(new Cesium.GridImageryProvider());   // fallback globe
      markers = stops.map((p, n) => viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 0),                    // longitude FIRST
        point: { pixelSize: 12, color: markerColor(p), outlineColor: Cesium.Color.BLACK, outlineWidth: 2,
                 heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: { text: `${n + 1}. ${p.name}`, font: '14px sans-serif', pixelOffset: new Cesium.Cartesian2(0, -24), showBackground: true,
                 heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY,
                 distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 4000000) }
      }));
      plane = viewer.entities.add({
        show: false,
        position: new Cesium.CallbackProperty(flightPosition, false),
        point: { pixelSize: 16, color: Cesium.Color.GOLD, outlineColor: Cesium.Color.BLACK, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: { text: 'SIMULATED FLIGHT', font: '14px sans-serif', pixelOffset: new Cesium.Cartesian2(0, -28), showBackground: true, disableDepthTestDistance: Number.POSITIVE_INFINITY }
      });
      viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(18, 3, 9000000) });   // whole continent

      let last = performance.now(), lastPaint = 0;
      viewer.scene.preRender.addEventListener(() => {
        const now = performance.now(), dt = Math.min((now - last) / 1000, 0.1); last = now;
        if (mode !== 'flight') return;
        fstate = Flight.step(fstate, dt);
        sampleGround(now);
        if (!fstate.paused) follow();
        if (now - lastPaint > 150) { paintFlight(); lastPaint = now; }
      });
      renderStop();
    } catch (e) {
      viewer = null; console.error(e);
      say('The globe could not start (WebGL?). The stop list still works.');
      $('modeFlight').disabled = true; return;
    }

    if (!hasKey) {
      notice = 'Add your Google Map Tiles API key in config.js to see photorealistic scans. ';
      say(notice);
    } else {
      say('Loading Google Photorealistic 3D Tiles…');
      try {
        tileset = await Cesium.createGooglePhotorealistic3DTileset(
          { key, onlyUsingWithGoogleGeocoder: true },        // we use no other geocoder (Google's terms)
          { showCreditsOnScreen: true }                      // Google requires its attributions to be visible
        );
        viewer.scene.primitives.add(tileset);
        viewer.scene.globe.show = false;                     // the tiles replace the grid globe
      } catch (e) {
        tileset = null; console.error(e);
        notice = 'Google 3D scans did not load (check the key, billing, the Map Tiles API and referrer restrictions). ';
        say(notice);
      }
    }
    if (stops.length) goToStop(stops[i]);
  }
  startGlobe();
})();
