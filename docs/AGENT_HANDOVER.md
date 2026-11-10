# FieldWise Orchard Intelligence — Agent Handover

**Purpose:** Give the next coding agent one reliable starting point for the product, current implementation, roadmap, repository layout, and VPS workflow. Read this file together with the current handoff at the top of `SITREP.md`.

## 1. Project in one minute

FieldWise is intended to become an evidence-led orchard and farm operations platform. The long-term workflow is:

**Observe → add weather and crop context → identify anomalies → investigate and confirm with people, sensors, or labs → recommend options → get human approval → record qualified execution → measure outcomes → improve reviewed rules/models.**

The present app is an early visual prototype with a working satellite-data slice. It is **not** yet a live farm-management or diagnosis system. Most dashboard metrics, sensor readings, drone movement, alerts, and recommendations are synthetic or illustrative. Keep the interface explicit about data provenance and prototype status.

“Self-learning” means evidence-based, versioned improvement from reviewed cases and measured outcomes. Do not build a model that silently changes live decisions from unverified data. Detection is not diagnosis; a recommendation is not execution; a completed job is not proof of efficacy.

## 2. What is built and verified

### Phase 1.1 — boundary integrity

- GeoJSON import validation is in `src/lib/geospatial.ts` and `src/lib/geospatial.test.ts`.
- Checks include WGS84 coordinate bounds, finite positions, ring closure and area, degenerate edges, self-intersection, hole containment/crossings, estate/sector containment, overlap checks, and documented input/vertex limits.
- Invalid input is rejected without silently repairing/reprojecting it; the prior valid browser import is retained.
- Known limits are in `SITREP.md`: winding order is not enforced; sector-hole interactions are not exhaustively resolved; CRS mistakes cannot all be detected; imported boundaries are stored in browser `localStorage`, not shared or server-persisted.

### Phase 2 — Sentinel-2 observation demo

- `src/components/dashboard/SentinelObservationPanel.tsx` calls server functions in `src/lib/api/sentinel.functions.ts`.
- The credentialed adapter is `src/lib/sentinel/cdse-adapter.server.ts` (Copernicus Data Space / Sentinel Hub). **CDSE live credentials have not been configured or verified.**
- The no-account demo adapter is `src/lib/sentinel/planetary-computer-adapter.server.ts` (Microsoft Planetary Computer). Live API verification passed for the two fixed sample AOIs: Khanewal and Okara.
- The flow performs bounded scene search, selected-item checks, a display-resampled NDVI preview, and summary/statistics with cloud/data masking. Preview and statistics are not the same resolution. The panel shows attribution, quality/mask reasons, caveats, source/time, and numeric distribution.
- Actual sample results, HTTP outcomes, provider fixes, security checks, and limitations are in the Phase 2 and QA audit sections of `SITREP.md`. The reported Phase 2 checks passed: Sentinel tests 29/29, geospatial tests 10/10, TypeScript, lint/format, build, bundle checks, and live Planetary Computer calls.
- Khanewal/Okara rectangles are public **sample AOIs**, not surveyed farms, confirmed orchards, or an agreed pilot. The public fallback is restricted to these fixtures; imported private boundaries do not get sent to it.
- This is a separate observation panel, not a satellite basemap over the dashboard map. No natural-colour imagery, time series, change detection, or automated diagnosis exists yet. Current NDVI is a vegetation signal, not a disease or irrigation diagnosis.

### Still illustrative or absent

- **Phase 3 is accepted within its recorded scope** (final audit in the top of `SITREP.md`). ECMWF IFS is live for both fixed AOIs and verified against ecCodes 2.42.0. Credentialed ERA5-Land live GRIB1 files for Khanewal and Okara were independently checked against ecCodes 2.50.0: all five requested fields, reference times, P1/P2/time-range metadata, selected cells, 48 hourly timestamps, and hourly precipitation assembly match. The actual CDS messages encode one-hour P1/P2 precipitation intervals; the app uses those amounts directly. The result for the 2026-11-03→2026-11-09 default period is `Partial`, 48/168 timestamps, with five unavailable days. The panel shows all returned hours, retains the old result during refresh and failure, replaces it on success, and clears the result on AOI change. District flood/crop context is regional; PMD remains link-only. The weather panel has no date selector by design for this release; date selection and multi-year rainfall analysis remain deferred.
- Field-boundary GeoJSON imports require an estate Polygon/MultiPolygon with `properties.role: "estate"`; sector polygons are optional and unmapped sectors are warned about. The validator was corrected to match that documented behavior so an estate-only polygon can be imported. A user-supplied LineString is not itself a field boundary polygon; inspect it for closure/self-intersection before conversion and never invent missing sector geometry.
- No real surveyed farm boundary, ground observations, scout image ingestion, insect/disease identification, or lab/agronomist-confirmed case workflow.
- No durable observation/evidence ledger or authenticated farm-scoped operations database. Boundary imports remain local browser storage.
- No real drone, irrigation sensor/controller, spray/fumigation dispatch, or pollination workflow. Displayed movement/telemetry/actions are demo UI only.
- No production deployment, public domain, reverse proxy, or public FieldWise port on the VPS.

## 3. Product direction and research gates

The detailed evidence report is `docs/research/fieldwise-orchard-intelligence-research-report.md` (about 22,000 words; evidence cut-off 2026-11-07). Its core recommendation is to build the **observation-to-approval evidence ledger first**.

- **Diagnosis:** prototype anomaly detection and scouting triage. Cause-ranked diagnosis requires local validation; images alone are not authority.
- **Spraying/treatment:** recommendations, approval, and contractor job records can be built. Orchard drone spraying needs field/regulatory validation; fumigation dispatch is deferred to qualified certified operators.
- **Irrigation:** monitoring and ET-based advisory first; controller integration read-only before any bounded, approved writes. No closed-loop control now. Physical hydraulic/plumbing design requires site data and qualified irrigation engineering; the app does not design pipes/pumps from assumptions.
- **Pollination:** date-palm drone pollination is experimental with mixed evidence. Do not claim yield benefit; any later work needs a randomized manual-vs-drone trial with qualified partners.
- Pakistan regulatory conditions and partner access need confirmation before real drone or pesticide operations. The report's Sindh date-palm pilot is a proposal only, not a selected site.

Khanewal and Okara are currently **development/demo regions only**. No pilot area, crop, orchard, data-sharing partner, or ground-verification plan has been selected. Continue learning from free/open data for those regions without representing regional products as farm measurements. Paid finer imagery is deferred until the demo is complete; Google Maps was not selected as an analytical source. Punjab government imagery/layers, if later used, are regional/secondary confirmation only and only where geographically applicable.

## 4. Active roadmap — follow this order

The current roadmap is in the “Current handoff” and “Reconciled build roadmap” sections of `SITREP.md`. Some older roadmap and task-prompt sections later in that long file have different phase numbering and are historical; **do not follow the old prompt titled “Phase 3 — Persist observations and show history.”**

### Completed: Phase 3 — environmental history and current forecast

Phase 3 is accepted; the independent ERA5 payload comparison, all automated checks, and the live browser walkthrough are recorded at the top of `SITREP.md`. Coverage remains partial where CDS reports missing days, and the product labels this accurately. Cloudflare `workerd` is not a gate because no Worker deployment is planned. Regional flood/crop references and link-only PMD are accepted with the documented limits.

There are no remaining Phase 3 acceptance tasks. The date selector and multi-year rainfall analytics below are explicitly deferred product enhancements; do not implement them without owner reprioritization.

Keep distinct typed products and UI labels for observed weather, reanalysis estimates, forecasts (issue/valid times), flood records/extent, and regional crop statistics. Preserve source, retrieval time, valid time, units, resolution, uncertainty, freshness, and gaps. A historic flood layer is exposure context, not current inundation. Do not label gridded/regional data as an on-farm sensor reading. Keep provider secrets server-side. Phase 3 is a data-source and product slice; do not pull in a database, PostGIS, queue, or worker unless measured limits make it necessary.

#### Deferred Phase 3 product enhancements — planned, not current acceptance work

- Add start/end date selection to the ERA5-Land panel, capped at 31 days, with provider-availability-aware bounds and explicit missing-hour/day coverage. Keep retrieval manual. The current 31-day limit is an app safeguard; the panel currently exposes only the default seven completed UTC days.
- Add a separate long-range rainfall-history analysis for multi-year periods (candidate scope: 5–10 years). Retrieve precipitation in bounded chunks, validate the ERA5-Land accumulation handling, aggregate to daily/monthly/annual results server-side, and return compact charts/tables rather than tens of thousands of hourly rows. Evaluate the CDS hourly time-series/ARCO option against the main hourly dataset before choosing it for operational use; its product guide notes it is an alternative service with format/support caveats.
- These enhancements are recorded in the Phase 3 plan for later detailed implementation. Do not start them during the remaining Phase 3 acceptance/QA task unless the project owner explicitly reprioritizes them.

### Following phases

4. **Persist the evidence ledger and secure access:** farm-scoped authenticated records and database policies; keep large raster files out of normal database rows; audit provenance/approvals.
5. **Local crop-risk library and investigation workflow:** versioned, cited local crop/season/pest/disease/weed/abiotic knowledge; anomaly → scout case → competing hypotheses → human/lab confirmation or unresolved status.
6. **Explainable decision support and operation plans:** transparent evidence, uncertainties, missing inputs, rule/model version, options, approval, and simulated-only job flow; include no-action/non-chemical options.
7. **Outcome measurement and reviewed learning:** capture follow-up observations, resource use, cost, yield/quality where available; version/review/rollback improvements and evaluate against held-out cases.
8. **Field integrations and crop-specific trials:** read-only sensors/controllers and contractor records first; bounded approved writes only after engineering/safety validation. Separate trials for spraying and pollination, with required permissions and measured outcomes.

No autonomous spraying, fumigation, closed-loop irrigation, commercial pollination claim, or self-modifying live model is in scope before explicit evidence, safety, legal, and partner gates.

## 5. Repository and important paths

### Git repositories

- **GitHub:** `https://github.com/tariqshaz/fieldwise-orchard-intelligence` — branch `main`.
- **Windows local clone:** `C:\Users\Tariq Shahzad\Documents\fieldwise-orchard-intelligence`.
- **VPS working clone:** `/opt/fieldwise-orchard-intelligence`.
- The local clone, GitHub, and VPS were clean and synchronized when this handover was prepared. Always re-check status/hash before editing or pulling.
- The local clone is a separate copy from the VPS workspace. Editing remotely does not automatically change the local Windows copy.

### Code and planning

- `README.md` — product summary, current capability and overview.
- `SITREP.md` — authoritative current handoff, phase-specific implementation records, QA evidence, and known limitations. Read the top current-handoff section first; historical sections remain for audit context.
- `src/routes/index.tsx`, `src/components/dashboard/` — dashboard composition and main UI panels.
- `src/components/dashboard/GeoMap.tsx`, `BoundaryImportDialog.tsx` — prototype map and boundary import.
- `src/lib/geospatial.ts` — GeoJSON checks.
- `src/lib/sentinel/` — data types, NDVI/masking, AOI validation, server-only providers, and Sentinel acceptance tests.
- `src/lib/api/sentinel.functions.ts` — server functions exposed to the client.
- `src/lib/weather/` — ERA5-Land and ECMWF IFS server adapters, GRIB readers, weather context products, and tests. `src/lib/weather/fixtures/` includes small synthetic timing cases plus licensed live CDS GRIB1 samples and ecCodes 2.50.0 oracle JSON for both sample AOIs. Keep the adjacent fixture README attribution with those data files.
- `src/lib/fieldwise-seed.ts`, `fieldwise-service.ts`, `fieldwise-recommendations.ts`, `src/types/fieldwise.ts` — synthetic dashboard model and interactions.
- `docs/research/fieldwise-orchard-intelligence-research-report.md` — agronomy/operations feasibility and evidence review.
- `docs/fieldwise-schema.sql`, `drizzle/schema.ts`, `supabase/` — draft backend/data artifacts, not evidence that persistence/RLS is operational.
- `src/routeTree.gen.ts` is generated; do not hand-edit unless the framework specifically requires it.

### Stack and runtime

- TypeScript, React 19, TanStack Start/Router, Vite, Tailwind CSS; server-side functions and Nitro build configuration.
- Bun lockfile is `bun.lock`; the VPS host has no project Node/Bun runtime installed. Do not install global packages or change host Node versions for this project.
- Isolated app container: `fieldwise-dev`, image `oven/bun:1.3.9` pinned by digest in its run configuration. It bind-mounts the VPS repo and listens inside the container on 8081; host publishing is **only** `127.0.0.1:8081`.
- No PostGIS, background queue, raster worker, or new cloud resource is present.
- `.env` is ignored. On the VPS, runtime config is `/opt/fieldwise/.env` (mode 0600); it contains publishable Supabase settings and server-only CDS API credentials. CDSE Sentinel OAuth credentials remain unconfigured. `fieldwise-dev` currently receives this file with Docker's `--env-file` option. Never copy values into source, docs, browser code, or logs. `.env.example` is the committed template. The old public history contains only publishable client values from when `.env` was tracked; do not add secrets going forward.

## 6. VS Code / VPS workflow

- VS Code Remote SSH alias: `fieldwise-vps`; user: `fieldwise`; workspace: `/opt/fieldwise-orchard-intelligence`.
- Connect via Command Palette → **Remote-SSH: Connect to Host…** → `fieldwise-vps`; open that folder. The account owns the repo, has an interactive shell, and has no sudo or Docker-group membership.
- The Vite app is already running and watches the mounted workspace, so edits hot-reload. To browse from Windows, open a separate PowerShell tunnel:

  ```powershell
  ssh -L 8081:127.0.0.1:8081 root@169.58.232.30
  ```

  Keep that terminal open and browse to `http://localhost:8081/`; Ctrl+C closes the tunnel. The app returns HTTP 200 when checked.

- Docker lifecycle/log commands require the existing root SSH account, for example `docker logs -f fieldwise-dev`, `docker restart fieldwise-dev`, `docker stop fieldwise-dev`, and `docker start fieldwise-dev`. Do not add `fieldwise` to the Docker group just for convenience; that group grants root-equivalent control.
- Existing Beszel (`8090`), Uptime Kuma (`3001`), PostgreSQL, other VS Code/OpenCode services, firewall and nginx are unrelated. Do not edit or restart them.

### GitHub push access from VPS — still pending

The VPS clone currently uses public HTTPS for fetch/pull; it cannot push. A repository-scoped Ed25519 keypair is already generated under `/opt/fieldwise/.ssh/` (`github_deploy` private; `github_deploy.pub` public). The public key must be added to this repository under **Settings → Deploy keys** with **Allow write access** before configuring the VPS `origin` SSH URL. Never print, copy, commit, or share the private key. Until write authentication is verified, a commit made in the VPS checkout cannot be pushed from there; keep synchronization deliberate and do not assume PC edits appear on the VPS.

## 7. Working rules for the next agent

1. Start in the `fieldwise-vps` VS Code workspace, check `git status --short --branch` and the latest commit, then read this file and the current-handoff section at the top of `SITREP.md`.
2. Work on **Phase 3 only**, beginning with provider/source research and a concise source decision before implementation. Preserve existing visual language and avoid unrelated dashboard redesign.
3. Use primary/official data-provider docs and licenses for technical claims. Do not choose providers based only on marketing pages. Keep paid imagery out of scope for the demo.
4. Maintain explicit provenance, timestamps, spatial/temporal resolution, units, uncertainty and missing/stale-data behavior. Never fabricate farm evidence or call the two sample rectangles a farm.
5. Keep provider calls/credentials on the server. Treat third-party image/location transfer and retention as privacy decisions. No external actions from a recommendation or simulator.
6. Make a scoped change, record files, setup, verification performed/not performed, limits, and the next decision in `SITREP.md`. Do not report checks that were not run.
7. Before any commit/push, check whether the VPS deploy key has actually been enabled and authenticated. If not, coordinate a safe single-author sync path rather than creating divergent local and VPS commits.

### Phase 3 task brief

> Implement the active Phase 3 in `SITREP.md`: farm environmental history and a current forecast. First research and compare free/open candidate weather, forecast, flood-history, and regional crop-context sources for the Khanewal and Okara sample AOIs. Record source, coverage, resolution, license/terms, update cadence, variables, limits, and API/security requirements, then select the smallest useful provider set. Keep measured observations, reanalysis, forecasts, flood records, and regional statistics distinct and sourced. Do not invent local farm observations, present historical floods as current, add paid imagery, or imply diagnosis. Keep credentials server-side and make stale/unavailable data explicit. Avoid adding storage/queues/geospatial infrastructure without a demonstrated need. Update `SITREP.md` with the decision, implementation, changed files, and checks actually performed.
