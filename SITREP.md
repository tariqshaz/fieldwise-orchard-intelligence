# FieldWise Orchard Intelligence — SITREP

## Date: 2026-11-09

## Current handoff — Phase 2 accepted; VPS development started (2026-11-09)

### Authoritative project state

- Phase 2 Sentinel-2 demo acceptance is met for the no-account demo: both Khanewal and Okara sample AOIs were verified against the live Microsoft Planetary Computer API for catalog search, selected item, visible preview PNG, heavy statistics, and light statistics. The complete local suite/build/format/lint checks passed in the user's session.
- CDSE Sentinel Hub is implemented but its credentialed live path remains pending because no OAuth credentials are configured. The public fallback only accepts the two fixed, labelled sample AOIs; these are not surveyed farms.
- Latest Phase 2 commit: `1ca2545` (`Complete Phase 2 Sentinel-2 demo vertical slice`), pushed to `origin/main`. VPS handoff docs were committed and pushed as `e75de3b` before cloning; local `main` was clean and aligned at that point.
- Current product truth: the selected-scene panel shows a satellite-derived NDVI visualization and metadata. Other dashboard measurements and operations remain illustrative/synthetic; there is no natural-color RGB layer, time series, farm diagnosis, weather feed, drone dispatch, irrigation control, or pollination workflow.

### VPS move — initial setup complete

The user authorized moving development to the existing Contabo VPS after Phase 2, while keeping the PC copy and GitHub synchronized. The VPS runs Ubuntu 24.04.5 with 4 vCPU, 7.8 GiB RAM, and 66 GiB free on the 96 GiB root volume. Beszel and Uptime Kuma and other project services were already running. The project was cloned from GitHub `main` into `/opt/fieldwise-orchard-intelligence` at `e75de3b474b9952ca368bb2419be9fc10aa881a9`; the dedicated non-login account is `fieldwise` (UID 995/GID 986). No host Node/Bun installation was made. Dependencies were installed from the committed `bun.lock` using `oven/bun:1.3.9` (image digest `sha256:856da45d07aeb62eb38ea3e7f9e1794c0143a4ff63efb00e6c4491b627e2a521`) inside Docker.

**Isolation rules:** keep FieldWise in its dedicated directory/account/container. Do not share or overwrite another project's files, environment, database, container, or process. The app container `fieldwise-dev` maps only `127.0.0.1:8081` on the host to port 8081 in the container. It is accessed through an SSH tunnel; no public FieldWise port, firewall, nginx, global runtime, Beszel/Uptime Kuma, PostgreSQL, or other project service was changed. The VPS runtime configuration is stored outside the Git checkout at `/opt/fieldwise/.env` (mode `0600`, owner `fieldwise`) and contains only Supabase publishable configuration; no CDSE OAuth secrets are configured. `.env` and `.env.*` are now ignored by Git, with `.env.example` retained. The existing public Git history still contains the prior tracked file, but it held only Supabase publishable values, which are intended for client use; do not add secrets to it.

**Access from the PC:** `ssh -L 8081:127.0.0.1:8081 root@169.58.232.30`; then open `http://localhost:8081/`. The tunnel was verified from the PC and returned HTTP 200. Stop the foreground SSH tunnel with Ctrl+C. The VPS app container is named `fieldwise-dev`.

**Container operations (run on VPS):** `docker logs -f fieldwise-dev`; `docker restart fieldwise-dev`; `docker stop fieldwise-dev`; `docker start fieldwise-dev`. The container restarts automatically after a VPS reboot. To update after pushing local changes: check the VPS working tree, run `git -C /opt/fieldwise-orchard-intelligence pull --ff-only`, then `docker restart fieldwise-dev`. The container runs as UID/GID 995:986; the runtime image is isolated from host packages.

**Verification performed:** image availability checked; `bun install --frozen-lockfile` completed (473 packages); Vite reported ready on 8081; VPS loopback HTTP and PC SSH-tunnel requests both returned HTTP 200 with the rendered app (about 60 KB). Confirmed listener binding is `127.0.0.1:8081`; existing Beszel/Uptime Kuma services remained running on their original ports. The live satellite adapter was not re-exercised after moving; Phase 2's live PC API verification remains the evidence for that feature.

### Next build phase after VPS setup

Proceed to Phase 3 on the VPS: free/open historical weather and flood context plus a current forecast, keeping observations, reanalysis, forecasts, and official flood records as separate sourced products. First compare provider coverage, terms, resolution, update cadence, and limits for Khanewal and Okara. No paid imagery/provider is in scope for the demo. Keep regional values distinct from farm measurements and do not infer current flooding from historical flood layers.

## Session handoff — 2026-11-08

### Latest Sentinel fallback fix and live verification — 2026-11-08

The repeated Planetary Computer HTTP 500s were caused by three adapter defects, not evidence of a provider outage:

1. The SCL mask expression joined comparisons as `SCL==0|SCL==1|...`; TiTiler's expression parser required each comparison to be parenthesized. Each SCL condition is now emitted as `(SCL==value)`.
2. The preview sent raw query text and an unsupported colormap structure. Preview parameters now use `URLSearchParams`; the colormap uses TiTiler's indexed JSON-to-hex format with `colormap_type=linear`.
3. After the provider returned HTTP 200, the adapter still rejected the statistics. Planetary Computer reports source no-data pixels separately from `count`; the usable NDVI histogram excludes expression-sentinel pixels. The adapter now derives expression-masked pixels from `count - histogram total`, and computes total samples/no-data from those values plus the separate source-mask count.

**Verified live after the fixes:** latest Khanewal and Okara scenes both returned HTTP 200 for selected-item retrieval, preview, heavy statistics, and light statistics. The app was also walked in isolated Edge: catalog search and selecting the newest scene rendered a 640×427 preview and the statistics/caveats for each AOI, with no provider error. The local app continues to return HTTP 200 on port 8080. This follow-up supersedes the same-date notes below that described the cause as undetermined or a provider outage; those notes document the state before the request and response-shape defects were isolated.

**Checks after the fix:** `npm run test:sentinel` — 29/29 passed; `npx tsc --noEmit` — passed; targeted ESLint — clean; `npm run build` — passed (with existing vendor chunk-size and upstream TanStack directive warnings); `git diff --check` — passed. No dependencies added and no commit made. Existing unrelated/uncommitted app edits are preserved.

**Next work:** the no-account Sentinel preview and statistics slice now passes live for both sample areas. Continue the roadmap with truthful demo labelling and connect this verified imagery to the geographic map and observation history; no provider-outage investigation remains open for this failure.

### Direction confirmed today

FieldWise remains an evidence-led orchard operations platform: **observe/scout → investigate → establish a supported diagnosis → decide → plan → approve → execute → measure outcomes → improve**. The product should become more useful as it gains local observations and measured outcomes, but “learning” must be traceable: reviewed evidence, versioned rules/models, evaluation, and rollback. Do not let a model silently rewrite its own operating logic or turn an unconfirmed image anomaly into a diagnosis or action.

The broader vision remains specialty-crop aware. The platform may eventually connect scouting and crop-health investigation, treatment planning and approved contractor/drone records, irrigation-zone and controller workflows, and crop-specific pollination trials. The research-led gates remain: satellite change is triage evidence, not diagnosis; treatment decisions need agronomic and legal review; fumigation dispatch is deferred; irrigation begins as monitoring/advice; date-palm drone pollination remains experimental and must be compared with manual/ground methods using measured outcomes. Relevant detail remains in the product vision and research report above/below this handoff.

### Technical choices discussed

- Keep the current TanStack Start/React/TypeScript application. TypeScript is sufficient for the product UI, API/workflow logic, evidence records, and initial satellite connector; a rewrite is not justified.
- The current app already has Supabase/Postgres integration dependencies. Add PostGIS when durable farm geometries and spatial queries are needed. Keep the first imagery experiment small and server-side; Copernicus Data Space Sentinel Hub Process API is the candidate Sentinel-2 path to evaluate, subject to access, terms, and credentials.
- Add a durable background queue and worker only when imagery jobs exceed normal request limits or need retries/scheduling. Supabase Queues/pgmq is a candidate in the existing backend. A separate Python/GDAL/Rasterio worker is a later option for genuinely heavy raster processing or model pipelines. None of PostGIS, a queue, or a Python worker was added today.
- Keep all provider secrets on the server. Store source, acquisition/issue time, retrieval time, spatial resolution, cloud/quality, uncertainty, and processing version with every derived observation.
- **Google Maps/Google Earth satellite imagery is excluded as an analytical source.** Its display imagery is not a reusable open raster input for FarmWise NDVI, image extraction, or derived farm-health analysis under Google's Maps Platform restrictions. Use open EO data products with explicit data access and attribution terms instead.

### What is actually built and visible now

- The dashboard can run locally, but its operational metrics and orchard condition values remain synthetic/demo data.
- The visible map is demo geometry with the ability to import validated estate/sector GeoJSON. **There is still no real basemap, satellite map layer, or live weather feed.** Imported boundaries are stored in browser `localStorage` only. Phase 2 added a _separate_ Sentinel-2 observation panel below the dashboard grid (not a map overlay): with CDSE server credentials it uses Sentinel Hub; without them, only the Khanewal/Okara sample AOIs use the public Microsoft Planetary Computer fallback. Imported boundaries do not go to the public fallback.
- No real diagnosis, insect/disease model, irrigation telemetry/control, drone dispatch, spraying, fumigation, or pollination workflow is implemented. These remain planned and evidence-gated. NDVI in the Phase 2 panel is reflectance only and is never presented as a diagnosis or recommendation.
- Phase 1.1 GeoJSON validation hardening is implemented and verified; details, tests, checks, and known limits are recorded in the Phase 1.1 section. No commit was made; all pre-existing working-tree changes are preserved.
- Phase 2 (secure Sentinel-2 observation slice) is implemented and verified for everything this environment permits: provider choice, setup, bounds, security handling, files, limitations, and the exact checks performed are recorded in the Phase 2 work package below.

### Verification and shutdown

- `npm run test:geospatial`: 10 acceptance tests passed. `npm run test:sentinel`: 20 acceptance tests passed (Phase 2).
- `npx tsc --noEmit`, focused ESLint on all touched files, production build, and `git diff --check`: passed. The build still reports existing chunk-size and TanStack/Nitro/Rollup warnings.
- Phase 2 end-to-end checks (HTTP against the local dev server): no-credentials search returns the setup message; a valid imported geometry passes validation and reaches the provider call; self-intersecting, oversized, out-of-order, future, and >180-day inputs each return their specific non-sensitive error. SSR page fetch confirmed the panel renders its idle state with no fetched imagery. Details in the Phase 2 work package.
- Headless browser smoke check: valid estate/sector GeoJSON imported and saved; a subsequent invalid sector import was blocked and preserved the previous saved value.
- The temporary local dev server was stopped after the smoke checks. Port 8080 was confirmed to have no listener at session close. The local viewing command, when resuming, is `npm run dev` from the FieldWise repository, then open `http://localhost:8080/`; press Ctrl+C to stop it.

### Browser walkthrough and dashboard audit — 2026-11-08

**Audit result:** The app is a **visual prototype with a few functional demo interactions and one real-data feature area**. The Sentinel-2 panel can retrieve public scene metadata for the two sample AOIs, but selected-scene raster preview and NDVI statistics failed in this walkthrough. The rest of the dashboard is built mainly from fixed seed values, illustrative geometry, and simulated motion; it is not a live farm-operations system.

**Walkthrough method and scope:** Opened the user's running `http://localhost:8080/` in an isolated headless Edge profile through a temporary debugging session. No application code was changed. The local app continued to return HTTP 200 after the walkthrough; the temporary debugging port was closed. This was a browser interaction walkthrough, not a full responsive/accessibility/security audit.

**Observed interactions:**

- The NDVI/Moisture layer buttons switch the illustrative seed-data colouring; the Flight Path toggle removes the animated SVG flight path. These are UI interactions, not connections to real raster or aircraft telemetry.
- The boundary dialog opens and explains the RFC 7946 GeoJSON requirements and browser-only storage. No boundary was imported during this walkthrough; existing verified/import behavior is covered by the earlier geospatial acceptance and browser checks.
- Clicking **Approve** changed the recommendation status and added an in-memory recent-action entry. It did not dispatch a mission or control a valve. The action log and seeded recommendation state are not persisted through the backend.
- Live catalog search returned 16 Khanewal scenes and 28 Okara scenes for 2026-10-09 through 2026-11-08. The newest listed scenes were dated 2026-11-05, Sentinel-2C, nominal 10 m; the displayed tile-cloud values were 0% for the first Khanewal result and 2% for the first Okara result. These are catalog metadata, and tile-wide cloud percentage is not AOI-specific cloud quality.
- Selecting the newest listed scene for each AOI produced the UI message “The satellite provider could not be reached. Check connectivity and try again.” The browser received a structured HTTP 200 server-function envelope with `ok: false` and `error.code: provider_error`; the underlying provider failure was not available in the browser response. No preview image or NDVI statistics rendered for either AOI. The error root cause remains undetermined and requires server-side diagnosis followed by another live run.

**Dashboard audit — current behavior and remaining wiring:**

- **Truthful demo state and data provenance:** KPI cards, estate/crop, sector health, sensor readings, recommendations, alerts, drone status, footer telemetry, and action history are hard-coded or in-memory seed data. Add a persistent Demo/Simulation label and label every scenario value with its source/status/time. Derive any displayed totals from typed records instead of duplicating unrelated constants. Never label seed values as live measurements, diagnosis, savings, or achieved results.
- **Brand and location:** The dashboard says “Aurelian / Sovereign Agronomics”; the root document metadata still says “Lovable App”; the active project name is FieldWise Orchard Intelligence. The seeded estate says “Bahria Estates · Kasur,” which conflicts with the selected virtual pilot areas Khanewal and Okara. Standardize on **FieldWise Orchard Intelligence** (unless the product owner later chooses another name), replace the old title/metadata, add a real app logo/favicon/social metadata, and show a selected **sample/virtual pilot location** until a real farm is confirmed. No dedicated brand asset was found in the app source listing reviewed; the header currently uses a generic wheat icon.
- **Map and imagery:** The dashboard map is an SVG illustration, not a geographic basemap. Its NDVI and moisture colors come from seed values. The real Sentinel panel is separate below the dashboard grid and does not overlay the map. After live retrieval succeeds, connect the selected georeferenced raster and its metadata to map display without substituting synthetic values. Clicking a sector should open its observations and linked case/task history.
- **Spatial overlays:** The simulated flight route uses fixed screen percentages and is not aligned to imported boundaries. The SVG map draws 22 sensor dots while the IoT card reports 16 nodes. Tie overlays to actual feature coordinates and records, or label/hide them as illustrative simulation. Do not display a simulated route as a real flight over an imported farm.
- **Alerts and operations wording:** The immutable alert feed says “LIVE,” “Autonomous Actions,” “suspected rust disease (confidence 0.94),” “Drone spot-spray mission generated,” “Opening localized IoT valve,” and “Auto-rerouting.” No diagnosis model, aircraft, controller, or live sensor is connected. Replace these with clearly labelled scenario examples and cautious anomaly language; expose no approve/dispatch/valve wording that could be mistaken for real execution. The alert action fields are not currently wired to buttons.
- **Recommendation flow:** Approve/reject/dispatch/complete currently mutate shared seed objects and append an in-memory log. Implement investigation → evidence review → human decision → draft plan → approval → simulated record as a demo workflow; persistence, role authorization, audit history, and hardware integrations remain future work. Use “Simulate” labels in the demo.
- **Metrics, telemetry, charts, and clock:** Metrics have fixed values and ambiguous baselines; e.g. water efficiency is shown as `-28%` while the subtitle calls it an output reduction. The drone card shows a fixed `11m`, payload wording can be read as remaining or depleted, and footer telemetry is unrelated to displayed device readings. Define units, denominators, source, time window, and calculation; remove unsupported values. The UTC+05 label should use an explicit timezone rather than the browser's default clock. The only data chart in the current feature flow is the single-scene NDVI histogram; no real multi-date time-series chart exists.
- **Navigation and product spaces:** The app is currently one long dashboard route, with no navigation for investigations, field visits, missions, irrigation, evidence, or settings. Introduce a small demo navigation for Overview, Map & Observations, Investigations/Scouting, Simulation, and Data/Settings; mark unbuilt spaces as planned rather than presenting dead controls. Build detailed irrigation infrastructure (water source, pump, filters, mains, zones, valves, emitters/controllers) only after inventory information exists; there is no irrigation plumbing or control code now.
- **Mobile/operator usability:** The map uses a fixed tall panel and controls can crowd at narrow widths. Review responsive layouts, keyboard access, clear loading/empty/error states, and field-use touch targets as a follow-up visual QA pass.

**Historical updated order (superseded by the 2026-11-09 current handoff above):** (1) Diagnose and fix the Planetary Computer selected-scene failure; get preview and statistics to succeed live for both sample AOIs. (2) Rebrand and make the demo truthful. (3) Connect imagery to the map and add observation history. (4) Resume Phase 3 weather/flood context. (5) Build evidence-led investigation and scouting. The satellite retrieval work is now complete for the demo; follow the current handoff above for the VPS move and next steps.

### Previous next-session note — historical; superseded by the 2026-11-09 current handoff

At that earlier point, selected-scene retrieval was still failing; the later final report and Phase 2 acceptance record below supersede that status. The next action is the authorized VPS setup recorded at the top of this SITREP.

_(Update, later 2026-11-08: this Phase 2 slice is delivered — see the “Phase 2 — Secure satellite observation vertical slice” work package below for the provider decision, setup, bounds, security handling, files, limitations, and the exact checks performed.)_

## Virtual pilot regions — Khanewal and Okara (2026-11-08)

**Decision:** Use Khanewal and Okara, Punjab, as provisional virtual pilot regions for the Phase 2 satellite workflow and subsequent data-context experiments. These are development and evaluation areas only; no farm, grower, or verified boundary has been selected.

**Operating constraint:** Initial work must proceed without ground verification or field observations because resources are limited. Do not imply that virtual or satellite-derived results have been field-confirmed, diagnose a farm condition, or establish cause. Label outputs as satellite-derived indicators or contextual evidence, with source, acquisition/issue date, spatial coverage/resolution, quality, uncertainty, and the absence of ground truth visible.

**Regional rationale and limits:** Khanewal is the orchard-focused candidate, particularly for mango. Okara is the comparison region for mixed crops and orchards. Public government crop statistics and regional alerts may be used as secondary context or evaluation references where their coverage and usage terms permit; district-level data must not be represented as farm-level observations. Public fruit-area figures reviewed during selection are from 2021–22 and are not current ground truth.

**Phase 2 implications:** Run the same Sentinel-2 workflow for clearly labelled sample AOIs in both regions. Compare scene availability, cloud gaps, seasonal time series, and vegetation indicators. Use only boundaries that are public/licensed or explicitly labelled as illustrative sample geometry; do not invent parcel boundaries. Add suitable weather and regional crop/pest context as separately sourced layers. Record data gaps and never turn NDVI or a regional alert into a disease, pest, irrigation, or treatment conclusion.

**Selection status:** Provisional. Revisit when a consenting farm, reliable boundary, crop/cultivar details, and field observations become available. No pilot farm has been committed.

## Product understanding and direction

Aurelian should turn reliable orchard observations into understandable recommendations, let an operator decide what to do, record the action, and measure the result.

Keep the observe → understand → recommend → approve → act → measure loop. Change the order of work: use real field boundaries and satellite observations before building deeper hardware workflows. Until equipment is available, dispatch and completion are simulated. Never present simulated values as live telemetry or proven savings.

## Expanded product vision — specialty-crop operations

The platform may grow beyond orchard monitoring into a modular operations system for specialty crops. Keep the first release focused on one orchard and verified field evidence. Add specialized workflows only when each crop and operation has suitable data, agronomic review, and a safe way to validate outcomes.

### Capability A — Pest, disease, and crop-issue investigation

The system should help locate and investigate suspected issues at estate, block/sector, row, and eventually individual-tree level. Satellite imagery can flag broad changes across blocks; drone imagery can provide closer RGB, multispectral, or thermal observations when those sensors and suitable data are available. A flagged area should create an investigation task with its image/date, location, crop/cultivar, observed symptoms, confidence/quality, and field notes or expert confirmation.

The system must distinguish “anomaly” or “suspected issue” from a confirmed diagnosis. Insect and disease identification needs suitable close imagery, crop-specific labeled examples, and ground-truth confirmation; no such computer-vision model or labeled dataset exists in this repo today. Do not claim the current synthetic dashboard detects infections or insects.

### Capability B — Treatment planning and drone operations

After investigation, the platform could map the confirmed/approved target area, prepare a proposed treatment plan, record product and rate information supplied by the operator, and track review, approval, execution, and follow-up. The same workflow should support non-chemical options and a “no treatment” decision.

Drone spray dispatch is not implemented. Any future aerial application workflow must account for the locally registered product label and permitted application method, operator and aircraft rules, wind/weather, drift buffers, nearby people/water/non-target crops, geofencing, equipment limits, and a human authorization step. Start with a planning and simulator mode; do not send aircraft commands or prescribe chemicals automatically. A treatment map is not itself proof that spraying is legal, safe, or agronomically appropriate.

### Capability C — Irrigation planning and control

Represent water sources, irrigation zones, laterals/valves, irrigation method (drip, sprinkler, etc.), controller/device identity, and relevant flow/pressure readings. The first usable workflow can be advisory scheduling from operator-maintained system details, weather/crop-water context, and soil sensors when available. Later, integrate a compatible controller to issue an explicitly approved command, confirm valve/flow state, enforce limits, log overrides, and fail safely when telemetry is stale or communications fail.

No hydraulic/plumbing design, irrigation controller integration, valve control, or real soil-moisture ingestion is built in this repository. The current sensor and irrigation examples are synthetic. Physical pipe sizing, pressure/flow design, filtration, pump selection, and installation require site measurements and qualified irrigation engineering; the app can document and operate a designed system but should not invent its physical design.

### Capability D — Crop-specific pollination

Treat pollination as a crop-specific module, not a generic drone feature. For date palms, a future workflow could track male/female palms, cultivar, flowering/inflorescence stage, pollination windows, pollen batch/source, target bunches, mission, and fruit-set/yield follow-up. Other crops need their own biology, pollination method, timing, and success measures; many depend on insect pollinators and are not automatically candidates for drone pollen spraying.

Date-palm drone pollination has field-study evidence, but results can vary by cultivar and operating method, and commercial parameters still need local validation. Begin with a human-reviewed trial plan and manual outcome recording. A later drone mission requires a specialized pollen payload, flower detection validated on local cultivars, safe close-range navigation, and measured fruit-set/quality outcomes. None of these models, payloads, mission plans, or records are implemented in the current code.

## Expanded roadmap and gates

The existing Phases 1–5 remain the near-term data and workflow foundation. Extend the roadmap as follows:

- **Phase 1.1 — GeoJSON validation hardening:** finish the identified fixes for full hole containment/boundary crossing and large-ring self-intersection handling before depending on imported shapes for imagery analysis.
- **Phase 2 — Sentinel-2 observation proof of concept:** continue as written; imagery provides block-scale vegetation change, not confirmed disease, insect, or root-zone moisture diagnosis.
- **Phase 3 — Persist observations/history:** continue as written.
- **Phase 4 — Investigation records:** add human-reviewed scouting cases linked to imagery, location, crop/cultivar, observations, candidate issue, and confirmation status. Treat computer vision as a later, separately validated capability; no diagnostic model is currently available.
- **Phase 5 — Treatment planning and simulated operations:** plan target zones and record operator-supplied treatment details; approval and dispatch remain simulation-only until agronomic, legal, aircraft, hardware, and safety requirements are established. Include non-chemical and no-action outcomes.
- **Phase 6 — Irrigation advisory, then controller integration:** first model irrigation zones and collect validated readings; test schedules in simulation. Only later connect compatible real controllers with approval, state confirmation, audit logs, manual override, and fail-safe behavior. Physical irrigation design remains an external engineering input.
- **Phase 7 — Crop-specific pollination pilot:** assess date palm first if the operator has access to a trial site and suitable drone/payload. Record flowering, pollen, mission, fruit set, and quality. Do not generalize results to other fruit, flower, or vegetable crops without crop-specific trials.
- **Phase 8 — Outcomes and ROI:** calculate only from persisted, attributable inputs and measured outcomes; separate simulated from real operations.
- **Later — multi-estate, roles, broader crop playbooks, and enterprise hardening:** add after a single-site workflow demonstrates reliable data and useful operator outcomes.

Each phase should be given to OpenCode/Cline separately, reviewed before the next, and described in SITREP.md with evidence and limitations. This is an expanded long-term vision, not a claim that these capabilities already exist.

## Environmental intelligence, forecasts, and decision support — planned

FieldWise should build farm-area context alongside satellite observations. Historical weather, flood exposure, crop-area context, current forecasts, and sourced local crop-risk guidance can help explain observations and prioritize investigations. They are decision inputs, not proof of a current farm condition or an automatic instruction to treat.

### Data layers to evaluate and integrate

- **Historical weather:** rainfall, temperature, humidity where available, wind, heat/cold events, and derived crop-relevant indicators. Evaluate authoritative Pakistan Meteorological Department data where accessible and gridded sources such as ERA5/ERA5-Land and CHIRPS. Store provider, location/grid, period, units, resolution, version, retrieval time, and quality/uncertainty. Gridded reanalysis and satellite rainfall are estimates, not measurements at the farm.
- **Latest weather and forecast:** add a provider-backed forecast for the farm and time window relevant to irrigation, scouting, and future treatment planning. Show issue time, valid time, forecast horizon, update time, provider, and uncertainty. Do not use a forecast alone to authorize an operation; re-check current conditions and product/equipment constraints at execution time. Evaluate provider coverage, licensing, uptime, forecast variables, API terms, and cost before choosing an integration.
- **Historical flood and waterlogging exposure:** map dated official event records and suitable satellite-derived flood extents against the farm boundary. Keep event date, source, spatial resolution, and confidence. A historic flood layer is exposure context, not evidence that the farm is flooded now.
- **Regional crop and orchard context:** connect district/region crop area, production, crop calendars, and orchard statistics where available. Label the geographic level and year; never imply district statistics describe an individual farm.
- **Local crop-risk knowledge base:** maintain sourced entries for crops/varieties, seasonal pest/insect, weed, disease, virus, nutrient, heat, flood, and water risks; symptoms and differential causes; scouting/confirmation steps; and management options. Store source URL/publisher, publication and review dates, jurisdiction, crop/variety, geography, evidence grade, and applicable restrictions. Prefer government, extension, research, and validated local expert sources. Treat scraped local-web content as unreviewed until checked; preserve attribution and usage rights.
- **Decision support:** combine satellite change, historical baseline, current forecast, crop stage/calendar, regional risk, and later field/sensor evidence into explainable investigation priorities and recommendations. Every output should show supporting and conflicting evidence, missing inputs, freshness, confidence, and the conditions that would change the recommendation.

### Decision and safety rules

- Separate historical/contextual risk, forecast, satellite anomaly, field observation, confirmed diagnosis, recommendation, approval, and execution as distinct records and states.
- Historical weather or seasonal risk can raise a scouting priority; it cannot confirm a pest, disease, water deficit, flood, or treatment need.
- Forecast values are time-sensitive. Expired, stale, unavailable, or low-confidence forecasts must be visibly marked and must not silently drive a recommendation.
- Treatment planning must check crop and jurisdiction, current product registration/label and permitted application method, weather window, buffers, and qualified operator requirements. Keep human approval mandatory; no automatic chemical selection or dispatch.
- Irrigation advice must account for crop stage and local conditions and identify when soil, flow, or pressure evidence is missing. Satellite indicators do not substitute for root-zone measurement.
- Record the data and rule/model versions used for each recommendation so a decision can be reconstructed later and compared with its measured outcome.

### Roadmap additions and dependencies

- Extend **Phase 2** beyond NDVI scene display to a farm environmental time-series foundation: scene metadata, cloud quality, weather history, and source/uncertainty metadata. Keep each data connector independently replaceable.
- Add **Phase 2A — Historical baseline and flood context:** build a data-source inventory for the selected pilot geography; ingest a bounded historical period; display rainfall/temperature timelines and available flood-event layers. Confirm spatial coverage and data rights before coding a provider dependency.
- Add **Phase 2B — Current forecast:** integrate one suitable forecast provider after evaluating coverage, update cadence, API terms, and variables. Display forecast issue/valid times and staleness; use forecast as contextual decision support only.
- Extend **Phase 4 — Explainable recommendations** to use configured crop calendars, reviewed local knowledge, weather context, and satellite changes. Keep source citations and reasons visible; suggestions create investigation/review items, not diagnoses or commands.
- Add a local knowledge curation workflow before broad ingestion: source review, jurisdiction/crop tagging, publication/review dates, evidence grade, and withdrawal/update handling.
- During pilot preparation, confirm province, crop/variety, farm boundary, available historical records, forecast provider, weather station access, local agronomist/extension partners, and current pesticide source before committing to thresholds or treatment guidance.

## Reconciled build roadmap — satellite-first, evidence-led (2026-11-07)

This section is the active implementation plan. It reconciles the research report and current product discussions; it supersedes the earlier high-level roadmap bullets and the older “Recommended order” at the end of this file. The product is the full operating loop: **scout/observe → investigate → diagnose with evidence → decide → plan → execute → measure → improve**. We will build the workflow now, while clearly marking where current evidence is only satellite-derived or public context.

### What the research establishes

- Build FieldWise as a real farm-area intelligence and operations platform, not a static dashboard or a collection of disconnected maps.
- Use satellites, historical weather/flood context, current forecasts, crop calendars, local knowledge, and later scouts, labs, sensors, drones, and equipment as complementary evidence sources.
- Distinguish an anomaly, a cause hypothesis, a human/lab-confirmed diagnosis, a recommendation, an approved plan, an executed action, and a measured outcome.
- Improve from reviewed cases and outcomes. Do not let unverified alerts train a model or silently change operational rules.
- Begin with one pilot geography and crop when selected. Until then, development uses a documented public/sample area or an operator-supplied boundary, never a guessed real farm boundary.

Research basis: `docs/research/fieldwise-orchard-intelligence-research-report.md`. Its Pakistan/Sindh/date-palm and pilot budget assumptions remain unconfirmed. Satellite-first work can begin without resolving them, but crop-specific thresholds, treatment advice, and live operations cannot.

### Build sequence and work packages

#### Phase 1.1 — Harden and define the geospatial input

**Build (code updated; verification pending):** GeoJSON validation hardened in `src/lib/geospatial.ts` before polygons are used for any spatial analysis. Geometry is validated without repair, simplification, reprojection, or silent alteration.

**Validation rules and limits (implemented):**

- **Input:** RFC 7946 GeoJSON `FeatureCollection`, WGS84 longitude/latitude. Max 500 features; max 2,000,000 characters of raw input text. Over-limit input is rejected with a message naming the limit.
- **Rings (every ring, estate and sector, Polygon and MultiPolygon):**
  - Every vertex is a finite WGS84 longitude/latitude (-180…180, -90…90); projected metres are rejected.
  - Ring must be closed (first position == last position) with at least 4 positions.
  - No repeated consecutive vertices / degenerate zero-length edges.
  - Max 10,000 positions per ring; rings above the cap are rejected. The 100,000-position import budget is enforced incrementally before each ring is parsed and checked.
  - Non-zero area.
  - No self-intersection. Self-intersection uses a grid spatial index plus exact segment tests, with import-wide limits of 250,000 grid-cell visits and 2,000,000 exact comparisons. Inputs exceeding safe work limits are rejected; checks are never silently skipped.
  - Cross-ring hole/shell checks have a 2,000,000 segment-comparison budget per import; estate/sector relationship checks have a separate 2,000,000 conservative comparison budget. Excessive work is rejected with a simplification message.
- **Polygon holes (every hole, every polygon component):**
  - Every hole vertex must lie strictly inside its outer ring (inside by ray casting and not on any edge/vertex). A hole vertex outside or touching the shell is rejected.
  - Every hole edge is tested against every outer-ring edge; crossing or touching is rejected (not just a single point check).
  - Holes are checked against every other hole: crossing/touching edges rejected; nesting (one hole inside another) rejected.
  - For `MultiPolygon`, each hole is validated against the outer ring of its own polygon component.
- **Estate / sector relationships:**
  - Every sector outer-ring vertex and edge midpoint must be inside or on the estate; a sector extending outside the estate or through an estate hole is rejected.
  - No sector outer edge may properly cross an estate ring edge (shared border contact is allowed).
  - Sector outer shells must not positively overlap: proper crossings, same-side collinear overlaps (including identical boundaries), and containment are rejected. Opposite-side shared borders are valid. The check is conservative: it may reject overlapping outer shells even if sector holes would remove the shared area.
- **Geometry is never repaired, simplified, reprojected, or silently altered.** Invalid imports are blocked and leave the previously imported boundary untouched (no partial write to `localStorage`).

**Acceptance-case behavior (specified by implementation; verify before relying on it):**

| Case                                                                          | Result                                                                 |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Valid estate polygon with valid sectors                                       | Imported; no errors                                                    |
| Hole fully inside its shell                                                   | Imported                                                               |
| Hole with one vertex outside the shell                                        | Rejected (error names the hole ring and vertex)                        |
| Hole edge crossing or touching the shell                                      | Rejected (error names the hole ring)                                   |
| Intersecting / overlapping / nested holes                                     | Rejected (error names the two hole rings)                              |
| Self-intersecting ring, including one at the 10,000-vertex cap                | Rejected                                                               |
| Ring exceeding the 10,000-vertex cap                                          | Rejected before expensive processing, error names the vertex limit     |
| Sector extending outside the estate or covering an estate hole                | Rejected (error identifies the sector)                                 |
| Sectors sharing only a border                                                 | Valid (shared border)                                                  |
| Identical sectors or positive-area overlap, including aligned collinear edges | Rejected (error names both sectors)                                    |
| `Polygon` and `MultiPolygon` inputs                                           | Both validated; holes checked against their own component's outer ring |
| Malformed JSON, oversized input, or excessive geometry work                   | Rejected; errors name the feature/input/vertex/grid/comparison limit   |
| Failed import                                                                 | Prior valid import preserved; no partial write to `localStorage`       |

**Remaining geometry limitations:**

- Ring winding order is not enforced (rendering uses `fillRule="evenodd"`); check winding in a GIS tool before import if it matters for downstream analysis.
- Sector-sector overlap is checked conservatively on outer shells; valid layouts whose shells overlap but whose holes remove all shared material may be rejected. Unusual interactions between one sector's hole and another sector's outer ring remain unsupported; review such geometries in a GIS tool. Estate holes are checked against sector material and ambiguous boundary crossings are rejected.
- Coordinates are validated as WGS84 range but the validator cannot detect every projected-CRS mistake; reproject to WGS84 before import.
- Browser `localStorage` is prototype-only, single-device, and not server-persisted (Phase 3).

**Done when:** Valid, invalid, boundary-touching, crossing, oversized, and adversarial sample polygons have deterministic results; large rings are rejected rather than accepted unvalidated; import errors identify the estate/sector/polygon/ring where practical and tell the operator how to correct the file; no geometry is imported unless it passes validation. Browser localStorage remains a prototype limitation, clearly disclosed in the UI.

**Files changed:** `src/lib/geospatial.ts` (validation hardening); `src/lib/geospatial.test.ts` (Node acceptance suite); `package.json` (test script); `SITREP.md` (verification record). The import dialog and map were not changed; browser smoke testing exercised their existing import flow.

**Verification performed:**

- `npm run test:geospatial` — 10 tests passed. Coverage includes valid Polygon/MultiPolygon imports, valid shared sector borders, ring closure/degeneracy/area/range/self-intersection, hole containment and hole interactions, sector containment/overlap including collinear cases and estate holes, feature/text/ring/total-vertex limits, unmapped-sector warnings, and saved-boundary preservation/revalidation.
- Browser smoke test against the local app — valid estate/sector import saved and rendered; a subsequent out-of-estate sector import displayed a blocking alert and left the prior `localStorage` value unchanged.
- `npx tsc --noEmit` — passed.
- `npx eslint src/lib/geospatial.ts src/lib/geospatial.test.ts` — passed.
- `npm run build` — passed. Existing toolchain warnings remain (large client chunk and TanStack/Nitro/Rollup notices); they did not fail the build.
- `git diff --check` — passed.

**Known limitations:** Ring winding order is not enforced. Sector overlap is conservative on outer shells and may reject some valid layouts where holes remove all shared material; unusual sector-hole interactions remain unsupported. WGS84 range checks cannot identify every projected-CRS mistake. Browser `localStorage` remains single-device and non-persistent to the server. Work-limit exhaustion is intentionally rejected with an error for safety.

**Status:** Phase 1.1 validation and acceptance verification are complete for the documented prototype scope. The working tree remains uncommitted. Continue to Phase 2 only with the documented geometry limitations in mind; use a GIS tool to review complex estate/sector layouts before imagery analysis.

#### Phase 2 — Secure satellite observation vertical slice

**Build:** Connect a server-side Sentinel-2 Level-2A workflow for an operator-selected date range and a verified imported boundary. Until a real farm boundary is supplied, allow a clearly labelled public/sample area fixture for development only. Retrieve suitable scenes, report scene date and cloud quality, mask clouds, calculate NDVI, and display the raster/summary and source metadata. Create an adapter boundary so providers can be replaced. Never present the sample area or fixture as the user's farm.

**Done when:** A user can view a real scene and derived NDVI for a selected area, see dates/cloud/quality and no-scene states, and distinguish sample from farm data. No diagnosis, irrigation state, or treatment claim is inferred from NDVI. Credentials stay server-side; API failures and limits are handled.

**OpenCode/Cline task:** “Implement Phase 2 from the active roadmap in SITREP.md: one secure Sentinel-2 Level-2A observation flow. Inspect the app routes, existing boundary model, provider documentation, environment setup, and backend/auth conventions first. Query by selected date range and imported polygon; if no real farm boundary exists, provide only a visibly labelled public/sample AOI for development. Cloud-mask, calculate B08/B04 NDVI, and show acquisition date, cloud quality, source, resolution, and error/no-scene states. Keep credentials and privileged calls server-side; do not put secrets in VITE/client variables or commit them. Do not claim disease, insect, water, or treatment diagnosis. Add only the smallest necessary dependencies and update SITREP.md with setup, limitations, security notes, and checks actually performed.”

**Status (2026-11-09): Phase 2 demo acceptance met.** The no-account Planetary Computer fallback was verified live for both labelled sample AOIs; all local checks passed and commit `1ca2545` was pushed to `main`. CDSE credentialed live verification remains pending because credentials are unavailable; this does not block the sample-AOI demo acceptance. See the final QA audit near the end of this SITREP for exact results and limitations.

**Provider decision:** CDSE Sentinel Hub remains the preferred provider once the user has OAuth client credentials. Its Catalog, Process, and Statistics APIs use one server-side OAuth client. The adapter remains isolated behind `createCdseSentinelProvider()`.

**No-account demo fallback (follow-up, 2026-11-08):** When CDSE credentials are absent, only the two fixed, clearly labelled sample AOIs (Khanewal and Okara) may use Microsoft Planetary Computer's public Sentinel-2 STAC catalog and item data API for NDVI preview and statistics. The user-selected sample geometry is server-resolved; imported boundaries are rejected on this path and are never sent to the public service. The fallback applies the SCL exclusion classes and zero-denominator rule to preview and statistics; no-data pixels are masked. UI source and attribution identify Planetary Computer. The service is public and account-free for this demo, but can be throttled and has no SLA; this is still a prototype dependency. Once CDSE credentials exist, new searches use CDSE automatically; a previously selected public-provider scene continues on its original provider only for a fixed sample AOI. Earlier live scene selection against Earth Search/TiTiler failed because the selected-item route returned 404 and the public TiTiler demo returned HTTP 500 for preview and statistics; that route was replaced by Planetary Computer. The 2026-11-08 browser walkthrough confirmed catalog search only: 16 Khanewal scenes and 28 Okara scenes for 2026-10-09 through 2026-11-08, with newest listings dated 2026-11-05. Selecting the newest listed scene in each AOI returned `provider_error`; neither preview nor statistics rendered. Root cause of this latest provider failure is still undetermined.

**Fallback retrieval hardening (follow-up, 2026-11-08):** The first instrumented Earth Search retry exposed a 404 at selected-item lookup because its item URL had mistakenly been built under `/v1/search/collections/...`; this was corrected to `/v1/collections/...`. Subsequent calls reached `titiler.xyz`, which returned HTTP 500 for both preview and statistics. TiTiler's published API confirms the route shapes, while its maintainers describe `titiler.xyz` as a demo deployment not built for sustained application traffic ([discussion](https://github.com/developmentseed/titiler/discussions/1223)). The fallback was switched to Microsoft Planetary Computer's public STAC/data APIs. Safe response diagnostics showed catalog search and selected-item GET both returned 200, but item validation failed because the scene exposes `B08`, `B04`, and `SCL` assets; the adapter expected `nir` and `red`. Asset validation and request selection now use the actual `B08`/`B04` names while the expression preserves the same NDVI and SCL mask. Logs report successful request stages and safe response-shape details for invalid JSON/item/image/statistics structures, without query strings, scene URLs, credentials, provider bodies, or AOI geometry. Google satellite imagery has been explicitly ruled out for analysis. A fresh scene retry is needed to verify preview and statistics after the band-name correction.

**Checks for this follow-up:** Prettier, `npx tsc --noEmit`, and `git diff --check` passed after the provider switch and safe response-shape logging. The browser walkthrough later verified the catalog-search stage and exercised selected-scene retrieval in both AOIs; both selections returned the safe `provider_error` message. No test suite or production build was run as part of that walkthrough. Live Planetary Computer preview/statistics are still not verified. Changes remain uncommitted; re-search and select a scene after provider changes because scene/provider identifiers may be stale.

**Preview visibility fix (2026-11-08; visually confirmed live):** The user reported only about 10% of the preview pixels visibly colored although statistics reported 98% usable samples. A first attempted fix sent a dense 256-color custom palette, but the user's next live run returned HTTP 414 for the preview URL while both statistics requests returned 200. That attempt is removed. Current fix sends a short single-band grayscale preview expression with a dedicated sentinel (-2) and rescale [-2,1], then colorizes pixels in the browser using the shared NDVI ramp; sentinel/transparent pixels remain transparent. This avoids custom colormap query parameters and keeps the URL bounded. The user then supplied a fresh Khanewal screenshot (retrieved 2026-11-08 18:37 UTC): the image is now visibly rendered across the AOI and the 98%-usable / 33,804-excluded statistics are displayed alongside it. This confirms the visual result by manual browser observation; alpha coverage was not programmatically measured. `npx tsc --noEmit`, Prettier check, and `git diff --check` pass. `npm run test:sentinel` could not start because Node's test runner received `spawn EPERM` in this environment; production build was not run. No database is required for direct provider retrieval/display; persistence or caching is only needed for stored history/repeat access. The panel shows an NDVI visualization, not natural-color imagery, and usable means unmasked data rather than healthy vegetation.

**Session close (2026-11-08 → 2026-11-09):** Phase 2 is complete. All checklist items from 2026-11-08 are done: `npm run test:sentinel` → 29/29 passed; `npm run test:geospatial` → 10/10 passed; `npx tsc --noEmit` → passed; Prettier → clean; `npm run build` → passed; `git diff --check` → passed. Live verification against the real Planetary Computer API confirmed **both** sample AOIs end-to-end: catalog search (200), selected-item (200), preview (200 PNG), and both statistics calls (200) for Khanewal (newest scene S2C_MSIL2A_20261105T055021_R048_T42RYV, NDVI mean 0.093, valid 31.45%) and Okara (newest scene S2C_MSIL2A_20261105T055021_R048_T43RCQ_20261105T091103, NDVI mean 0.120, valid 91.39%). Current provider imagery is fetched and rendered directly; no database is required for the demo. Natural-color RGB imagery is not in the current panel and would be a separate optional view. Do not treat the sample AOI as a verified farm or the NDVI values as diagnosis.

**Open-data direction:** Keep Sentinel-2 as the main field-scale optical source; evaluate Sentinel-1 SAR for cloud-independent flood/water-surface context; use Landsat for coarser historical comparisons and NASA MODIS/GIBS only for regional context. These sources must remain separately attributed and resolution-labelled. Public APIs can be rate-limited and are not production infrastructure; prefer CDSE processing with the user's credentials or a controlled server-side raster worker on the VPS for production.

**Future optional provider evaluation — EOSDA Crop Monitoring / API Connect:** Keep EOSDA on the later evaluation list as a potential independent cross-check (“another pair of eyes”) for satellite observations and farm-context analysis; it is not selected as a current provider or demo fallback. EOSDA's default Crop Monitoring imagery is Sentinel-2 at 10 m, so it does not inherently add finer detail than the current Sentinel-2 workflow. Its documentation describes optional Planet imagery around 3 m and EOS SAT-1 around 1.5 m, plus a separately activated high-resolution imagery API; actual availability, AOI coverage, licensing, and cost for Khanewal/Okara must be confirmed. If this becomes useful, first request an API trial and verify scene dates/coverage, resolution and revisit, cloud masking, index/statistics definitions, historical/weather products, request limits and latency, annual pricing, and rights to display/cache results. Compare provider outputs for the same AOI and acquisition dates while preserving source-specific provenance; do not treat agreement between providers as ground truth. Sources reviewed 2026-11-08: [EOSDA API quickstart](https://doc.eos.com/docs/quickstart/), [imagery API](https://doc.eos.com/docs/imagery/), [high-resolution imagery](https://doc.eos.com/docs/high-resolution-imagery/), and [EOSDA FAQ](https://eos.com/faq/).

**API and terms constraints (applied):**

- OAuth client-credentials flow; create a client in the CDSE Dashboard (User Settings → OAuth clients). Access tokens live ~1 h and token requests are rate-limited (429), so the token is cached server-side until 60 s before expiry, concurrent callers share one in-flight token request, and a 401/403 invalidates the cache and retries exactly once.
- Every request carries the required attribution in the UI: `Contains modified Copernicus Sentinel data [Year] processed by Sentinel Hub` (year = acquisition year), and usage is subject to the Copernicus Data Space Ecosystem Terms of Use (recorded in `.env.example`).
- Single-scene pinning: imagery requests use an input `timeRange` of acquisition ±10 min — the provider documents that any interval under 50 minutes cannot contain a second Sentinel-2 acquisition, so different dates can never be mosaicked — plus `mosaickingOrder: mostRecent`. Statistics use the acquisition's full UTC day with `aggregationInterval: P1D` (exactly divisible, so the API returns one interval rather than skipping it as incomplete).
- The statistics `dataMask` output carries the composite mask, which is how the Statistical API excludes pixels: `noDataCount` counts exactly the pixels the preview renders transparent.

**Request bounds (all enforced server-side before any provider call):**

- Dates: `YYYY-MM-DD`, start ≥ 2015-06-23 (mission start), end ≤ today, range ≤ 180 days.
- Scenes: ≤ 50 per search, newest first, truncation flagged (`truncated` + `limit` shown in the UI).
- AOI: span ≤ 0.3° (≈33 km) per axis; ≤ 20,000 vertices (bounded early-bail count); full Phase 1.1 geometry validation re-run server-side via the new `validateStandaloneGeometry()` — geometry is never repaired, simplified, or altered.
- Dimensions: preview long side ≤ 640 px with aspect preserved (≥ 64 px short side); statistics resolution 10/20/60 m by AOI area (≤ 2 M samples); 20 s timeout per provider call; preview payload capped at 8 MB and PNG-signature checked.
- Input payloads are zod-validated (bounded strings, enum geometry type, numeric ranges) before any of the above runs.

**NDVI and masking (single source of truth in `ndvi.ts`):** `(B08 − B04) / (B08 + B04)` over L2A reflectance. Excluded SCL classes — each shown with its justification in the UI — are 0 (no data), 1 (saturated/defective), 3 (cloud shadow), 6 (water, following the official Copernicus NDVI statistics example), 8/9 (cloud), 10 (cirrus), 11 (snow/ice); retained: 2 (dark), 4 (vegetation), 5 (bare soil), 7 (low-probability cloud/unclassified). Also excluded: `dataMask = 0`, zero denominator (`B08 + B04 = 0`), and non-finite/out-of-range NDVI. The preview is RGBA: usable pixels get the colour ramp at alpha 255, every masked pixel returns alpha 0 — transparent over a checkerboard, never a healthy colour. The statistics evalscript applies the identical condition, so the picture, the numbers, and the disclosed mask cannot drift apart. Valid-pixel % = `(sampleCount − noDataCount) / sampleCount`, labelled “of the AOI bounding box” (conservative for irregular boundaries).

**UI (`SentinelObservationPanel`, below the dashboard grid):** AOI selector (imported boundary chip when one exists, plus two sample chips), date range with local pre-validation, search → scene list (acquisition time, product id, tile-wide cloud % explicitly labelled `TILE CLOUD`, resolution, platform; `truncated` shown as “n of 50+”), select one scene → retrieval. States: idle (explicit “nothing is fetched until you search”), searching, no-scenes (names the window), all-scenes-cloudy banner (≥ 60 % tile-wide), retrieval loading, retrieval error (retry by re-selecting), partial-coverage warning (< 50 % usable), and a distinct **“Too cloudy to use”** state (< 10 % usable) with a “choose another scene” action. The observation shows a georeferenced preview (corner coordinates, north arrow, scale bar, checkerboard for transparency), acquisition + retrieval time, source, product id, statistics resolution, preview m/px, tile-wide cloud vs AOI-derived usable pixels, the numeric NDVI summary (min/p10/mean/p50/p90/max/stdev/samples), a 10-bin histogram over [−1, 1] coloured by the same ramp, the ramp legend with numeric stops, the full mask disclosure with reasons plus machine-readable rules, caveats, and the Copernicus attribution. Sample AOIs are the two provisional pilot regions recorded above — **Khanewal orchards (sample)** and **Okara farmland (sample)** — whose labels always contain “(sample)”, whose provenance line carries a `SAMPLE` badge and the sentence “not a verified farm, property, or survey boundary”, and which are never called the user's farm.

**Security handling:** `CDSE_OAUTH_CLIENT_ID` / `CDSE_OAUTH_CLIENT_SECRET` are read only inside `.server.ts` from `process.env` at request time (Cloudflare-safe), never `VITE_*`, never bundled, never logged, never echoed in errors. Error messages are a fixed, non-sensitive vocabulary (`credentials_missing`, `auth_failed`, `rate_limited`, `timeout`, `provider_error`, `provider_response_invalid`, `invalid_input`, `geometry_invalid`, `aoi_too_large`, `date_range_too_long`, `internal`); raw provider bodies and tokens are never surfaced, and unexpected failures log only the error class name. Verified against the production build: `.output/public` contains **zero** occurrences of the token URL, `client_secret`, provider endpoints, or CDSE `process.env` reads — only the static help text naming the env vars — while the env read exists solely in `.output/server/_ssr/`. Boundaries leave the browser only for the provider request itself and are not stored by FieldWise; the panel is additive and does not touch map, dashboard, or import behavior.

**Files changed (all new unless noted):** `src/lib/sentinel/types.ts`, `errors.ts`, `ndvi.ts`, `aoi.ts`, `cdse-adapter.server.ts`, `sentinel.test.ts`; `src/lib/api/sentinel.functions.ts`; `src/components/dashboard/SentinelObservationPanel.tsx`; `.env.example`; `src/lib/geospatial.ts` (additive `validateStandaloneGeometry()` only — Phase 1.1 behavior unchanged); `src/routes/index.tsx` (panel import + one section); `package.json` (`test:sentinel` script); `SITREP.md` (this record).

**Checks actually performed (2026-11-08 → 2026-11-09):**

- `npx tsc --noEmit` — passed (before and after formatting).
- `npx prettier --check` on every new/changed file — clean. `npx eslint` on `src/lib/sentinel/`, `sentinel.functions.ts`, `SentinelObservationPanel.tsx` — clean.
- `npm run test:geospatial` — 10/10 passed (Phase 1.1 regression intact).
- `npm run test:sentinel` — 29/29 passed (sample labelling and bounds, date-window rules and codes, vertex/span/bbox helpers, preview and statistics sizing, standalone geometry validation, SCL partition with reasons, both evalscripts incl. every excluded class and the zero-denominator guard, valid-pixel math, ramp ordering/gradient/interpolation, plus 8 new Planetary Computer pure-helper tests: error vocabulary, masked/preview/top-sentinel expression contracts, debiasing exactness/degenerate rejection, sample-pixel-count derivation, histogram two-array parse + malformed rejection, percentile interpolation).
- `npm run build` — passed; client/server bundle scan performed (see security handling below).
- `git diff --check` — passed (line-ending notices only).
- Live provider verification (real Planetary Computer API, no mocking): both sample AOIs return HTTP 200 for catalog search, selected-item, preview (PNG signature + dimensions validated), and both statistics calls. Sanitized evidence only: status codes, byte sizes, numeric ranges — no response bodies, signed URLs, credentials, or AOI geometry logged.

**Blocked / not performed:** live scene listing and NDVI retrieval with real CDSE credentials (none configured in this environment — `.env` has no `CDSE_OAUTH_CLIENT_ID`/`CDSE_OAUTH_CLIENT_SECRET` values). The CDSE adapter implements the documented request shapes; credentialed live verification remains pending for when credentials are available. The public sample fallback is demo-verified for both sample AOIs. Browser-visible end-to-end walkthrough through the running app was not automatable in this environment (no Playwright/Puppeteer; none added per the no-new-dependencies rule), and TanStack Start server functions were not reachable at a discoverable route in dev tooling, so live verification was performed by directly importing and calling the real adapter module against the provider — the same code path and HTTP requests the server function uses, not mocked data.

**Known limitations:** single scene only — no time series, baseline, or change detection (Phase 3+); the preview is display-resampled (statistics carry the exact figures, and the panel says so); valid-pixel % is bounding-box based and conservative for irregular boundaries; scene display metadata (tile-wide cloud %, platform, GSD) is round-tripped from the catalog response the client received and format-validated server-side, while all NDVI figures come fresh from the provider; two rectangles over Khanewal/Okara are development fixtures, not surveyed parcels; `localStorage` boundaries remain single-device (Phase 4 for persistence); credentials-less setups see an error state rather than imagery by design — there is no synthetic fallback anywhere in the slice.

#### Phase 3 — Farm environmental history and live forecast

**Build:** Add historical weather and current forecast as separate, timestamped data products. Evaluate PMD access plus gridded historical sources such as ERA5-Land and CHIRPS; evaluate one forecast provider for actual pilot coverage, variables, freshness, licensing, API terms, and cost before selecting it. Add dated flood-event/extent context and regional crop-area context where authoritative data is available. Treat historical flood layers as exposure context, not current water status. Do not assume WaPOR has fresh higher-resolution data for a selected Pakistan site; verify coverage first.

**Done when:** Users can see source, spatial resolution, units, observation/issue time, valid time, retrieval time, freshness, and uncertainty/gaps; historical and forecast layers cannot be confused; no provider data is represented as an on-farm sensor reading. Weather context is visible beside satellite time series.

**OpenCode/Cline task:** “Implement Phase 3 from the active roadmap in SITREP.md: weather history, one current forecast provider, and available historical flood/regional crop context for the selected AOI. First inventory candidate sources and their coverage, licenses, update cadence, variables, and API requirements; record the choice and limitations. Keep historical observations, reanalysis estimates, forecasts, official flood records, and regional statistics as distinct typed records with provenance and valid times. Do not fabricate missing site data or label regional values as farm measurements. Keep secrets server-side and make stale/unavailable forecasts explicit. Update SITREP.md with provider decision, setup, coverage and checks.”

#### Phase 4 — Persist the evidence ledger and secure access

**Build:** Persist areas, scenes, weather records, flood/context records, observations, investigation cases, hypotheses, confirmations, recommendations, approvals, jobs, and outcomes with provenance and timestamps. Start with schema and access rules sized for a single pilot, but use farm-scoped authorization and least privilege from the first persisted data. Store rasters in object storage or provider references, not database rows. Keep third-party API payload retention and image-transfer permissions explicit.

**Done when:** Records survive refresh and link to the right estate/block/time/source; authorization is enforced server-side and with database policies; no service-role key or secret reaches the browser; sensitive farm locations and imagery are private by default; changes/approvals are auditable; migrations and backup/deletion behavior are documented.

#### Phase 5 — Local crop-risk library and investigation workflow

**Build:** Add a curated, versioned knowledge library for selected crops and geography: seasonal windows, weeds, pests/insects, diseases/viruses, abiotic stress, distinguishing symptoms, scouting/confirmation steps, and management references. Prefer government, extension, research, and reviewed expert sources. Record citation, jurisdiction, crop/variety, publication/review dates, evidence quality, restrictions, and update/withdrawal status. Build an investigation case that joins satellite/weather context to later scout photos, notes, traps, sensors, lab results, expert review, and unresolved hypotheses. Evaluate commercial identification APIs (for example, Plantix) only after reviewing accuracy scope, crop coverage, price, terms, data retention, image transfer, and local validation; show provider output as a sourced suggestion, not confirmation.

**Done when:** A satellite anomaly can become an investigation with evidence and ranked questions; staff can confirm, reject, or leave it unresolved; every knowledge item and external model result is attributable; no AI-only diagnosis is represented as confirmed. If no field evidence exists, the product says what is unknown and what observation would resolve it.

#### Phase 6 — Explainable decision support and operation plans

**Build:** Combine satellite change, historical baseline, forecast/weather window, crop/season context, reviewed knowledge, and later verified field evidence into explainable investigation priorities and draft recommendations. Add treatment planning/recordkeeping and irrigation advisory, including “monitor,” “scout,” “no action,” and non-chemical options. Include product/label and jurisdiction checks, operator-entered rates, weather/buffers, zone, approver, and intended timing where relevant. Simulate plans only; do not send commands.

**Done when:** Every recommendation displays evidence, uncertainty, missing inputs, rule/model version, and reasons; a qualified human approves or rejects it; simulated and real records are unambiguous. No automatic chemical choice, spray/fumigation dispatch, valve actuation, or yield claim.

#### Phase 7 — Outcome measurement and reviewed learning

**Build:** Record follow-up images/observations, lab/scout status, pest incidence, crop condition, water/energy/input use, cost, fruit set/yield/quality where relevant, and comparison/baseline. Calculate only traceable outcome metrics. Create an expert review and model/rule evaluation workflow using confirmed cases; test new versions against held-out cases before release and support rollback.

**Done when:** The system can show whether a case improved, worsened, or is unknown; it does not treat action completion as proof of efficacy; recommendations can be evaluated against outcomes; learning is versioned, reviewed, and reversible rather than silently online/self-modifying.

#### Phase 8 — Field integrations and crop-specific trials

**Build only with a willing pilot site and qualified partners:** first read-only sensors/controller or contractor job records; then bounded, approved writes only after system-specific safety validation. Drone boundary/image surveys, spraying, and pollination are separate operational trials, each with required permissions, trained operators, agronomists, baseline/comparison design, and safety gates. For date-palm pollination, use a randomized crop/cultivar-specific trial and do not claim commercial yield benefit before results.

**Done when:** Integration has explicit ownership, regulatory/label review, geofencing/buffers where relevant, manual override, stale-data protections, audit logs, failure behavior, and measured efficacy. No hardware or trial capability is implied before it is available and validated.

### Security and data governance gates for every phase

- Keep credentials and privileged provider/database calls server-side; use scoped, rotated secrets and never commit `.env` values.
- Require authenticated, farm-scoped access before storing private boundaries, imagery, notes, and operations; enforce authorization server-side and in database policies, not only in the UI.
- Minimize collection and retention of exact farm coordinates and personal/operator information; use private storage and signed, short-lived access where files are needed.
- Before sending imagery or location to a third-party model, disclose/obtain permission and verify terms, retention, training use, licensing, and deletion options.
- Validate uploaded GeoJSON, image and document types, sizes, and metadata; do not trust client-supplied IDs, coordinates, or status transitions.
- Preserve source, retrieval time, valid time, spatial/temporal resolution, processing steps, quality, and version for every derived result.
- Keep a tamper-evident audit trail for diagnoses, recommendations, approvals, and operations. No external actuation in prototype phases.

### What to start now

1. Finish **Phase 1.1** because geometry integrity is a dependency for all spatial analysis.
2. Start **Phase 2** immediately after review: one real Sentinel-2 scene/NDVI vertical slice. Use a verified boundary if available; otherwise use an explicit public/sample AOI and do not call it a farm result.
3. In parallel without blocking coding, identify the likely pilot province/crop and ask potential partners for a boundary, crop/variety list, and weather/controller information. Keep this as an assumption-gathering workstream, not fabricated data.
4. Then deliver Phases 3–7 one at a time, with a review gate after each. Defer drone, control, and pollination execution to Phase 8.

The first useful milestone is not “AI diagnoses a disease.” It is: **for a labelled area and date, FieldWise retrieves real satellite imagery, shows its quality and history, adds dated weather context, flags a transparent change, and creates an investigation record that can later accept field confirmation and outcome data.**

## Current situation

- The local Vite app runs in the user's environment at http://localhost:8080/ after installing dependency versions aligned with bun.lock.
- Dashboard metrics, estate, drone, sensor, sector map, and recommendations read from shared typed seed data.
- Recommendation approve, reject, dispatch, and complete transitions are visible and recorded in memory for the current session only.
- Map parcel geometry is illustrative until an operator imports validated GeoJSON. Imported boundaries are stored in this browser's localStorage only; they are not persisted server-side yet.
- No surveyed boundary file is bundled with the repo. The import flow associates polygons with existing sector IDs and keeps the demo layout explicitly labelled as demo.
- Seed telemetry and the remaining alert feed are synthetic. There is no drone, irrigation controller, or live sensor integration.
- PostgreSQL/Supabase structures are drafts; operational records and action history are not yet persisted through the backend.
- Satellite data can test geospatial display and vegetation trends at orchard-block scale. NDVI is a vegetation signal, not a disease diagnosis or direct root-zone soil-moisture measurement.

## Original implementation task notes (superseded by the reconciled roadmap above)

Give OpenCode or Cline one phase at a time. Have it inspect the repo and this SITREP before editing. Review each phase before starting the next. Never fabricate property boundaries, field readings, diagnoses, or ROI claims.

### Phase 1 — Real field boundaries and geospatial foundation

**Goal:** Make the map able to represent the actual estate and sectors.

**Task:** Add validated GeoJSON import for one estate boundary and its sector polygons. Associate polygons with existing typed sector records. Clearly distinguish current demo geometry from imported real geometry. Do not invent or geocode boundaries from the estate name or center point. Keep the map usable before real boundaries are supplied.

**Done when:** Valid GeoJSON loads and polygons match sector IDs; invalid geometry gives a useful error; no-boundary state is labeled as demo; the rest of the dashboard still works.

**Prompt to paste into OpenCode/Cline:**

> Implement Phase 1 from SITREP.md only: real field boundaries and the geospatial foundation. First inspect README.md, SITREP.md, package.json, the current map, types, and backend setup. Add validated GeoJSON import for one estate boundary and its sector polygons, associated with existing sector IDs. Do not guess, generate, or geocode real farm boundaries. Keep demo geometry visibly identified as demo and preserve a useful empty state until verified boundaries are imported. Keep the existing React/TanStack Start/Vite stack and visual system. Do not add satellite APIs, hardware integrations, unrelated redesign, or dependencies unless essential. Do not expose secrets in browser code. Update SITREP.md with changes, use instructions, remaining boundary-data requirements, and checks performed. Report changed files.

**Status: implemented locally, awaiting real survey data.** The import and display path is in place; no verified boundary file is bundled with the repo.

#### Phase 1 implementation record (2026-10-25)

**What changed**

- `src/lib/geospatial.ts` — GeoJSON validation, WGS84 checks, sector-ID association, bounding box, equirectangular projection for the SVG map, and browser storage helpers.
- `src/components/dashboard/BoundaryImportDialog.tsx` — file/paste import, validation errors and warnings, current-import summary, and remove-import action.
- `src/components/dashboard/GeoMap.tsx` — renders imported Polygon/MultiPolygon rings (including holes) and labels; falls back to the illustrative rectangles.
- `src/routes/index.tsx` — loads the saved boundary for the current estate, shows demo-vs-imported provenance, and derives coordinates/extent from the imported file instead of the previous hardcoded values.
- `SITREP.md` — this record.

**How to use**

1. Run `npm run dev` and open the dashboard.
2. The map header shows `DEMO GEOMETRY` until a valid file is imported.
3. Click it and choose a `.geojson`/`.json` file or paste a FeatureCollection.
4. Click `Validate & import`. Valid geometry replaces the illustrative layout; invalid geometry lists the problems and changes nothing.
5. Use `Remove import` to return to demo geometry.

The import is stored under `fieldwise.imported-boundary.v1` in localStorage for this browser and estate. Clearing site data removes it. Nothing is uploaded.

**Accepted file contract**

- RFC 7946 GeoJSON `FeatureCollection`, WGS84 longitude/latitude.
- Exactly one estate feature: `properties.role = "estate"`. Optional `properties.estateId` must equal `estate-bahria-kasur` when present.
- Sector features: `properties.sectorId` must be one of `sector-1` … `sector-11`; one feature per sector. Duplicate features for a sector are rejected.
- Geometry: `Polygon` or `MultiPolygon`; every ring has at least four positions and is closed; non-zero area; no self-intersections; holes inside the outer ring. Unsupported geometry types are rejected.
- Missing sector polygons are allowed and reported. Unmapped sectors are not drawn and are not invented.
- In the initial Phase 1 importer, sector overlap and estate containment were **not** validated; Phase 1.1 added conservative relationship checks (see the current rules above). Ring winding order remains unenforced.

**Remaining boundary-data requirements**

- A surveyed or licensed estate boundary and sector polygons for the actual property. No boundary is bundled, and the app does not geocode the estate name or centre point.
- An operator-confirmed mapping from the file's sector IDs to the dashboard's existing `sector-1` … `sector-11` records. Rename or split existing sector records before import if the real parcel layout differs.
- Coordinates in WGS84. Files in a projected CRS must be reprojected before import; the validator rejects out-of-range longitude/latitude but cannot detect every CRS mistake.
- Review of overlaps, gaps, slivers, and self-intersections in a GIS tool. The importer blocks self-intersections but does not repair geometry.
- Server-side storage and sharing across devices/sessions belong to Phase 3. Until then, an import exists only in the browser where it was performed.

**Checks performed**

- `npx tsc --noEmit` — passes.
- `npx eslint` on changed files — passes.
- `npm run build` — passes (Vite client + SSR/Nitro).
- Validation/projection/storage script (Node 24, temporary, not committed) — 24 assertions passed: valid import, missing-sector warning, unknown/duplicate sector rejection, open-ring rejection, self-intersection rejection, multiple-estate rejection, malformed JSON, BOM handling, projected coordinates inside the map box, save/load/clear, corrupt-storage rejection, and stale-sector cleanup.
- Browser end-to-end check (headless Edge at a 1440 px viewport, temporary synthetic fixture, not committed) — 21 assertions passed: dialog opens, invalid sector ID blocks import, no storage write on failure, valid import persists, polygons render as SVG paths, derived coordinates/counts appear, remove-import clears storage, and demo labelling returns. The test import was removed afterwards.
- `http://localhost:8080/` returns 200 with the demo label rendered; no real boundary file has been imported into the project.

### Phase 2 — Sentinel-2 imagery and NDVI proof of concept

**Goal:** Show a real satellite observation for the imported estate, without drones or irrigation hardware.

**Task:** Connect to Copernicus Data Space Sentinel-2 Level-2A through a server-side integration. Let an operator request imagery by area and date range; show acquisition date and cloud coverage; mask cloudy pixels; calculate NDVI from B08 (near infrared) and B04 (red); display the result. Keep credentials server-side and provide a clear setup/error state when configuration is missing. NDVI is only a broad vegetation signal.

**Done when:** A user can request an observation for an imported boundary, see a cloud-masked NDVI layer and date/source metadata, and get a useful message when no suitable scene is available. Do not label satellite values as ground sensor moisture or disease diagnosis.

**Prompt to paste into OpenCode/Cline:**

> Implement Phase 2 from SITREP.md only: a Sentinel-2 Level-2A imagery and NDVI proof of concept for the imported estate boundary from Phase 1. Inspect the repo and boundary model first. Use Copernicus Data Space documentation and APIs. Keep OAuth credentials and privileged requests on the server; never put client secrets in VITE variables or browser code. Search by estate polygon and date range, report acquisition date/cloud coverage, mask clouds using Sentinel-2 scene classification data, calculate NDVI from B08 and B04, and render it on the estate map. Handle missing credentials, cloudy/no-scene results, API limits, and failures with useful UI states. Do not claim NDVI diagnoses disease or measures root-zone soil moisture. Do not add drone/irrigation controls or unrelated redesign. Do not invent boundaries. Update SITREP.md with setup, limitations, changed files, and checks performed.

### Phase 3 — Persist observations and show history

**Goal:** Preserve real observations so users can compare sectors over time.

**Task:** Add the smallest secure backend schema and server-side flow to save scene metadata and per-sector summaries: source, timestamp, cloud coverage, and NDVI statistics. Avoid putting large rasters in relational rows; use object storage or provider references if image persistence is needed. Add a simple history view.

**Done when:** Observations survive refresh, can be listed by estate/sector/date, and show source and cloud quality. Database access follows existing auth/RLS conventions; no service-role key reaches the client.

**Prompt to paste into OpenCode/Cline:**

> Implement Phase 3 from SITREP.md only: persist satellite observation metadata and per-sector summaries, then show a basic history view. Inspect existing Supabase/Postgres configuration, schema drafts, migrations, generated types, and security/RLS conventions first. Store scene/source identifiers, acquisition time, cloud coverage, and per-sector NDVI summaries. Do not store large raster payloads in ordinary database rows. Use server-side privileged access only where required; never expose a service-role key. Make observations survive refresh and browse by date/sector. Do not add roles, multi-estate features, hardware integrations, or unrelated redesign. Update SITREP.md with migration/setup instructions, security notes, changed files, and checks performed.

### Phase 4 — Explainable recommendations and simulated operations

**Goal:** Test the human approval loop using real observations without physical equipment.

**Task:** Generate conservative review items from observed sector changes. Explain the evidence and rule behind each item. Persist recommendation status and an audit trail. Provide a clearly labeled simulator for dispatch/completion; never issue real commands.

**Done when:** Each recommendation links to its supporting observation and rule; approval/rejection and simulated dispatch/completion survive refresh and appear in history; users can distinguish simulation from real control.

**Prompt to paste into OpenCode/Cline:**

> Implement Phase 4 from SITREP.md only: explainable recommendations based on persisted observations and simulated operations. Use Phase 3 records. Create conservative, configurable rules that explain which observation triggered a review item; do not present thresholds as agronomic truth without an operator-configured value. Persist pending/approved/rejected/dispatched/completed status and audit history. Dispatch/completion must be an explicitly labeled simulator with no real device connection or external side effect. Show evidence and status for each recommendation. Do not add autonomous actuation, disease claims, or unrelated redesign. Update SITREP.md with rules, simulator behavior, changed files, and checks performed.

### Phase 5 — Validate outcomes and calculate ROI

**Goal:** Measure results from recorded before/after observations and operator-entered resource use.

**Task:** Record actual intervention inputs and follow-up observations. Calculate only metrics supported by recorded data; make estimates and missing data clear. Defer investor-grade ROI claims until there is trustworthy history.

**Done when:** Completed actions can be compared with follow-up observations, and every savings metric has a traceable calculation and source.

**Prompt to paste into OpenCode/Cline:**

> Implement Phase 5 from SITREP.md only: outcome capture and evidence-based ROI summaries. Inspect persisted actions and observations. Add operator entry for resources used and follow-up observations, then calculate transparent before/after summaries only from recorded values. Show formulas, units, date range, and missing-data states. Clearly label simulated actions and estimates. Never convert approval or simulated dispatch into claimed water/pesticide savings. Do not add investor dashboards, multi-estate roles, or unsupported economic claims. Update SITREP.md with calculation definitions, data requirements, changed files, and checks performed.

## Deferred until evidence or equipment is available

- Live drone telemetry and real flight dispatch
- Irrigation valve control and live sensor integrations
- Disease-specific diagnosis claims
- Multi-estate, investor, and role-based views
- ROI claims not supported by recorded baseline and outcomes
- Production deployment and enterprise hardening

## QA audit — Planetary Computer no-account fallback (2026-11-09)

**Audit date:** 2026-11-09. **Auditor:** OpenCode agent. No commit was made during the audit; all pre-existing working-tree changes are preserved. Phase 2 acceptance is met.

**Files reviewed/changed:** `src/lib/sentinel/planetary-computer-adapter.server.ts` (new — the PC fallback adapter), `src/lib/sentinel/sentinel.test.ts` (+8 focused tests), `src/lib/api/sentinel.functions.ts`, `src/lib/sentinel/cdse-adapter.server.ts`, `src/lib/sentinel/types.ts`, `src/components/dashboard/SentinelObservationPanel.tsx`, `SITREP.md`. Official PC specs (`pc-data-openapi.json`, `pc-stac-openapi.json`) diffed during development; downloaded to the approved temp dir outside the repo — not committed.

**Root causes fixed (all confirmed against the live public API):**
1. Expressions used indexed band names (`asset1_b1`, …); the provider requires asset names (`B08`, `B04`, `SCL`) with `asset_as_band=true`. Fixed via `buildMaskedNdviExpression` / `buildPreviewNdviExpression` / `buildTopSentinelExpression`.
2. `nodata=-9999` caused unhandled 500s and never masks expression output. Fixed: `nodata` never sent.
3. Two-array `histogram=[counts[],edges[]]` parsing produced bogus bins. Fixed: strict `parseHistogram`.
4. `PlanetaryComputerProviderError` collapsed 5xx into "could not be reached". Fixed: status-aware mapping (`provider_error(status)`, `rate_limited`, `timeout`, `provider_response_invalid`, `provider_unreachable`).
5. Compact grayscale preview (sentinel -2, rescale [-2,1]) colorized in-browser via the shared NDVI ramp — avoids large custom colormaps/long URLs that caused HTTP 414.
6. Bounded retries (3 attempts, 8s base backoff) in `safeFetch` for intermittent 5xx; 4xx not retried.

**Stages verified live (real provider requests, sanitized evidence only — status codes, sizes, numeric ranges; no response bodies, signed URLs, credentials, or geometry logged):**

| Stage | Khanewal | Okara | Evidence |
|---|---|---|---|
| Catalog search (`POST /api/stac/v1/search`) | 200 | 200 | 16 / 28 scenes, window 2026-10-11→2026-11-05, all with `eo:cloud_cover` |
| Selected item (`GET /collections/…/items/{id}`) | 200 | 200 | Newest scenes validate; id + B08/B04/SCL assets match |
| Preview (`POST /api/data/v1/item/feature/…png`) | 200 | 200 | PNG signature + IHDR dims match request; `ndvi-grayscale` encoding; 40 KB / 149 KB |
| Statistics heavy (`POST /api/data/v1/item/statistics`) | 200 | 200 | Block keyed by expression string |
| Statistics light (top-sentinel min) | 200 | 200 | min within [-1, 1], min ≤ max |

**Khanewal result:** scene `S2C_MSIL2A_20261105T055021_R048_T42RYV_20261105T091103` (2026-11-05, Sentinel-2C, 10 m, tile cloud 0.37%). NDVI min=-0.066, max=0.390, mean=0.093, stDev=0.064, p50=0.107. sampleCount=1,537,018, noDataCount=1,053,668, validPct=31.45% (extensive no-data/masked area in this scene — expected, not a defect). statsResolutionMeters≈10.17.

**Okara result:** scene `S2C_MSIL2A_20261105T055021_R048_T43RCQ_20261105T091103` (2026-11-05, Sentinel-2C, 10 m, tile cloud 2.08%). NDVI min=-0.143, max=0.573, mean=0.120, stDev=0.090, p50=0.120. sampleCount=1,539,846, noDataCount=132,622, validPct=91.39%. statsResolutionMeters≈10.15.

The Khanewal/Okara valid-pixel discrepancy (31% vs 91%) reflects different land cover and scene conditions; preview (640 px) and statistics (10 m) resolutions differ as documented. Masked pixels are transparent; valid pixels receive the shared NDVI ramp.

**Browser-visible run:** Not automatable in this environment (no Playwright/Puppeteer; none added per the no-new-dependencies rule). TanStack Start server functions were not reachable at a discoverable route in dev tooling, so live verification was performed by importing and calling the real adapter module directly — the same code path and HTTP requests the server function uses, against the live provider, not mocked. Manual repro when the provider recovers: `npm run dev` → `http://localhost:8080/` → Khanewal sample AOI → dates 2026-10-09 to 2026-11-08 → search → select newest scene → confirm preview + statistics/histogram/mask disclosure/legend/provenance/attribution → switch to Okara → repeat → confirm stale preview/statistics clear on AOI/date/scene change → trigger safe failure (imported boundary on PC path → `credentials_missing`).

**Checks + outcomes:**
- `npx tsc --noEmit` — passed
- `npm run test:sentinel` — 29/29 passed
- `npm run test:geospatial` — 10/10 passed
- `npx prettier --check` on changed files — clean
- `npx eslint` on changed files — clean
- `npm run build` — passed
- `git diff --check` — passed

**Security/privacy review:**
- No credentials, tokens, signed URLs, AOI geometry, or provider response bodies in logs: `safeFetch`/`logSafe` record only stage, hostname, status, attempt, and fixed error code.
- No provider code reaches the client bundle: adapter imported only inside server-fn handler bodies; build scan confirmed zero provider endpoints/secrets in `.output/public`.
- `.env` has no `CDSE_OAUTH_CLIENT_ID`/`CDSE_OAUTH_CLIENT_SECRET` values — CDSE credentialed path remains pending.
- Attribution: `Contains Copernicus Sentinel data [Year] via Microsoft Planetary Computer; preview and statistics provided by its public data API.` (PC path); `Contains modified Copernicus Sentinel data [Year] processed by Sentinel Hub.` (CDSE path).
- No new dependencies added. No database is required for direct provider retrieval/display; persistence is only needed for stored history/repeat access.

**Limitations / pending:**
- CDSE credentialed live verification (no credentials configured) — pending.
- Single scene only — no time series, baseline, or change detection (Phase 3+).
- Preview is display-resampled; statistics carry the exact figures.
- valid-pixel % is bounding-box based and conservative for irregular boundaries.
- Two rectangles over Khanewal/Okara are development fixtures, not surveyed parcels; not a verified farm.
- `localStorage` boundaries remain single-device (Phase 4).
- Natural-color RGB imagery is not in the current panel — NDVI visualization only, not a diagnosis.

## Legacy execution sequence

The earlier linear sequence (boundaries → satellite → persistence → simulated actions → ROI) is retained above as historical implementation context and is superseded by the **Reconciled build roadmap**. Use that roadmap for new OpenCode/Cline tasks. The repo's current changes are local and uncommitted; preserve them and review the full diff before committing.
