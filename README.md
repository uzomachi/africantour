# Africa: Cities & Civilizations — Tour + Flight Lab (AI 101, Path B)

A virtual tour and simulated flight over **Google Photorealistic 3D Tiles**, built on the supplied Tour Lab and Flight Lab starters. Twelve stops, from the Great Pyramid (c. 2600 BC) to Kigali and Lagos, each with a description, source and date checked.

**CesiumJS version: 1.145** (loaded from Cesium's CDN, no build step, no Cesium ion token).

## Run (exact steps)
1. Get a Google key: Google Cloud Console → create/select a project → **enable billing** → enable **Map Tiles API** → Credentials → Create API key.
2. **Restrict the key** (it will be public in a GitHub repo): *API restrictions* → Map Tiles API only; *Website restrictions* → add `https://YOUR-USERNAME.github.io/*` and `http://localhost:8000/*`. Add a budget alert in Billing.
3. Open `config.js` and replace `YOUR_GOOGLE_MAP_TILES_API_KEY` with your key. This is the only file you change to switch keys.
4. Serve the folder: `python -m http.server 8000`, open http://localhost:8000. Internet and WebGL required.
5. **Publish:** new public GitHub repo → upload all files to the repo root → Settings → Pages → Deploy from a branch → `main` / `(root)` → open the Pages URL.

No key set? The app still runs on a plain grid globe (tour, flight and tests all work), and says so on screen. If Google's tiles fail to load, it falls back the same way and tells you why.

## Use
- **Guided tour:** Previous / Next, or click any stop in the list. **Auto-tour** advances every 15, 25 or 40 s (Fast / Normal / Slow).
- **Free flight:** starts at the stop you last viewed. Fly / Pause / Reset, Left/Right 10° (also ←/→ or A/D), speed 0–250 m/s, height 50–5000 m **above local ground**. The panel shows the nearest tour stop.
- Drag to orbit, scroll to zoom. Keep Cesium's and Google's on-screen credits visible.

## What I changed from the starters
| Area | Change |
|---|---|
| `places.js` | 12 sourced records (source URLs + `checked: 2026-10-05`); extra optional fields `country`, `category`, `era`, `explore`, `view` |
| `tour-core.js` | Project area changed from a Pennsylvania box to Africa; added `autoTourStep`, `cameraFor`, `distanceKm`, `nearest` |
| `flight-core.js` | Unchanged from Flight Lab (reused for Free flight) |
| `app.js` | Google 3D Tiles with fallback; ground-height sampling; two-phase camera approach; auto-tour; flight mode |
| `tests.js` | Original 12 tour checks (fixture moved to Giza) + 7 flight checks + 12 new = 31 |
| `config.js` | New: the API key |

**Assignment feature (small, observable): Auto-tour with a pace selector and countdown.** Everything else (flight mode, stop list, keys) is an extension of the starters.

**Why height is "above local ground":** many stops are high above sea level (Lalibela ≈ 2,500 m, Nairobi, Johannesburg). A height measured from the ellipsoid would put the camera underground, so the app samples the surface height with `scene.sampleHeightMostDetailed` and adds your height to it.

**Why no Three.js:** Cesium already draws the scans, markers and camera. Adding a second renderer would add a dependency and sync problems without a clear benefit for this lab.

## Test
- Open `tests.html` (31 checks) or run `node tests.js`.
- Record results in `Test_Log.csv`; complete the six manual tour checks from Canvas page 05.
- **Missing-data exercise (on a copy):** in `places.js`, delete the `MISSING-DATA EXERCISE` line and the `END OF EXERCISE` line, reload. Expected: page shows *"Unverified Stop: missing source; missing checked; longitude must be a number from -180 to 180"* under "Needs verification", the map shows 12 of 13 stops, and tests 12 and 14 fail. Restore the comments and confirm 31/31.

## Limits (read before sharing)
- **Virtual tour only.** Camera flights are not routes, travel times or accessibility guides. Flight is a point moving on a sphere: no lift, drag, bank, collision or real navigation.
- **Scan age and detail vary by place.** Google's scans can predate new buildings (see Iconic Tower, Eko Atlantic) and some sites may look coarser than others. Not checked against live tiles by the author of this starter (see `Test_Log.csv`).
- **Camera targets the surface at the stop's coordinates**, which for tall towers is the roof.
- **Coordinates:** most are from Wikipedia or UNESCO pages named in each record; Eko Atlantic's source gives only rounded values, Lalibela's point is the town, and Timbuktu's two sources differ by about 1 km. The Africa-wide check box cannot catch a swapped longitude/latitude for most African points (swapped Giza is still inside Africa), so verify against the source.
- **Claims:** Wikipedia is a secondary source; replace with primary sources (UNESCO, museum, official site) where you can. "Second-oldest university" is how Wikipedia words it and depends on definitions.
- **Google terms:** 3D tiles may not be cached, scraped or analysed; no other geocoder may be used; attributions must stay visible. Check current pricing and quotas yourself: billing is required and I could not confirm current free-tier terms.

## Student additions — complete before submission
Audience and purpose: *(draft in `lab-docs/SUBMISSION_NOTES.md`, edit to be yours)*
Stops and sources (with date checked): see `places.js`
Feature changed: Auto-tour (pace selector + countdown)
AI assistance accepted/rejected: *(your three excerpts)*
Tests and evidence: `Test_Log.csv`
Partner reproduction feedback: *(pending)*
Known limitations: see Limits above

## References
- https://cesium.com/learn/cesiumjs/ref-doc/Camera.html#flyToBoundingSphere
- https://cesium.com/learn/cesiumjs/ref-doc/Scene.html#sampleHeightMostDetailed
- https://cesium.com/learn/cesiumjs/ref-doc/createGooglePhotorealistic3DTileset.html
- https://developers.google.com/maps/documentation/tile/policies
- https://developers.google.com/maps/documentation/tile/usage-and-billing
- https://whc.unesco.org/en/list/ (UNESCO World Heritage List, individual entries cited per stop)

CesiumJS is an external dependency with its own license and notices. Google imagery and attributions belong to Google and its data providers.
