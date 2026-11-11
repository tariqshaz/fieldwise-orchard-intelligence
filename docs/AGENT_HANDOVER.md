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

4. **Persist the evidence ledger and secure access:** persist observations and linked evidence with provenance, timestamps, farm-scoped authorization, least privilege, and auditable changes; keep rasters out of database rows and document backup/deletion behavior.
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

### GitHub push access and current synchronization

The Phase 3 acceptance commit `cd74d2c` was pushed to GitHub `main` on 2026-11-10; the working tree was clean and synchronized at closeout. This checkout could not push over HTTPS because no HTTPS credential was available, and its existing VPS SSH deploy key was rejected by GitHub. The push was completed through the user's authenticated GitHub path. Do not assume the VPS deploy key is write-enabled; re-check authentication before the next push. Never print, copy, commit, or share a private key. Keep the PC and VPS clones synchronized deliberately.

## 7. Working rules for the next agent

1. Start in the `fieldwise-vps` VS Code workspace, check `git status --short --branch` and the latest commit, then read this file and the current-handoff section at the top of `SITREP.md`.
2. Phase 3 is accepted. Prepare for **Phase 4 — Persist the evidence ledger and secure access** as defined in the “Reconciled build roadmap” in `SITREP.md`; inspect the existing schema, authentication, authorization, data flows, storage, and audit support before proposing code changes. Preserve the visual language and avoid unrelated redesign.
3. Use primary/official data-provider docs and licenses for technical claims. Do not choose providers based only on marketing pages. Keep paid imagery out of scope for the demo.
4. Maintain explicit provenance, timestamps, spatial/temporal resolution, units, uncertainty and missing/stale-data behavior. Never fabricate farm evidence or call the two sample rectangles a farm.
5. Keep provider calls/credentials on the server. Treat third-party image/location transfer and retention as privacy decisions. No external actions from a recommendation or simulator.
6. Make a scoped change, record files, setup, verification performed/not performed, limits, and the next decision in `SITREP.md`. Do not report checks that were not run.
7. Before any commit/push, check whether the VPS deploy key has actually been enabled and authenticated. If not, coordinate a safe single-author sync path rather than creating divergent local and VPS commits.

### Phase 4 discovery outcome and starting brief (updated 2026-11-11)

Phase 4 discovery is **complete and independently verified**. The **first-slice schema has been prepared, remediated after independent review, and verified locally — but NOT applied**. The live Lovable Cloud backend was never contacted and nothing in it was created, altered, or deleted. Read the current handoff at the top of `SITREP.md` and `docs/farmwise-schema-design.md` before starting Phase 4 work.

Key facts a next agent must not re-derive:

- Owner-provided Farmwise (formerly Sentinel View) Database/Users/Storage views and no external Supabase connection shown, together with the matching Lovable preview/backend project UUID, confirm with high confidence that the backend is **Lovable Cloud built-in** and fronts Supabase project ref `nsdgmbvjbdtimajwntbr` in **Tokyo**. The configured `SUPABASE_URL` is Lovable's proxy host; the proxy and canonical `nsdgmbvjbdtimajwntbr.supabase.co` host return byte-identical responses, so the proxy is **not** a security boundary.
- The Lovable UI reports **“No tables yet,” “No sign-in methods are enabled yet,” and “No buckets yet.”** Auth settings show all listed providers disabled, `Disable sign-up` off, and anonymous users off; email-confirmation behavior was not visible. No sign-in method is currently enabled, but if one is enabled later, public signup may remain open unless restricted. The owner inspected Backups and reports 14 daily backups from Oct 28 through Nov 10, 2026 (latest Nov 10 22:40:40 UTC); no restore or export was started. Read-only SQL confirmed no `public` relations or `public` policies; `storage.buckets` also returned no rows. A migration-name query found only platform-owned `auth.schema_migrations` and `storage.migrations`; no application migration-history table was listed. The broader `pg_class` query returned 41 relations, all in platform schemas: 27 `auth` tables, 10 `storage` tables, two `extensions` views, and two `vault` relations (one table and one view); RLS is mixed in `auth`, enabled on all 10 `storage` tables, and disabled on the two listed `vault` relations. A read-only `pg_database_size(current_database())` query returned 10 MB; relation totals were about 1.5 MB. The previously mentioned 0.25 GB UI storage figure is now considered unattributed (possibly another project), not Farmwise evidence. Do not alter platform-managed RLS. No service-role key (`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_DB_URL`) was found in `/opt/fieldwise/.env` or the container environment (name/boolean checks only).
- **The prepared first slice is five farm-scoped tables with RLS** (`farms`, `farm_members`, `areas`, `evidence_observations` limited to typed Sentinel-2 NDVI summaries, `audit_events`), in `drizzle/migrations/0000_farmwise_evidence_ledger.sql` with a journal entry at `idx: 0`. The migration convention was **inspected, not assumed**: the repository already carried a drizzle journal and no `supabase/migrations/` directory.
- **Tenant integrity is enforced by the database, not by policy.** Composite foreign keys `(farm_id, area_id) → areas(farm_id, id)` and `(farm_id, supersedes_id) → evidence_observations(farm_id, id)` mean an evidence row cannot name another farm's area and a correction cannot supersede another farm's evidence, even with the UUID in hand; a `check` prevents self-supersession. Both composite keys use `on delete no action deferrable initially deferred`, so deleting an area that still has evidence is refused while deleting the farm still cascades. An earlier draft that used single-column foreign keys and `on delete restrict` allowed all three cross-tenant references and **broke farm deletion entirely** — that was found by execution, not by reading.
- **Evidence is immutable through application access** (no update/delete policy *and* no update/delete grant); a correction is a new row whose `supersedes_id` points at the row it replaces. The audit trail is **append-only for application roles** — writable only by database triggers — and is **not tamper-evident**: a database administrator with direct write access can still alter or delete rows and the design detects no such modification. Say "append-only for application roles", not "tamper-evident".
- **JSON columns have real, derived limits.** `histogram` (≤64 buckets, ≤64 KiB, exactly the keys `lowEdge`/`highEdge`/`count`, edges within [-1, 1], non-negative whole-number counts), `masking` (exactly `excluded`/`retained`/`rules`, ≤64 entries each, ≤64 KiB, scalar leaves only, and each class `value` an **integer** in 0–255 — a fraction such as `1.5` is refused), `audit_events.detail` (optional `before`/`after` objects of scalars; a **scalar** in place of `before`/`after` — `{"before": 3}`, `{"after": "x"}` — is refused, not raised, and the nested `jsonb_each` scan is guarded so it cannot receive a scalar), `caveats` (≤64 entries of ≤2000 chars, and **no NULL elements**). The limits come from the actual Sentinel-2 product shape (10 bins over [-1, 1]; 12 scene classes, 8 excluded and 4 retained — whose class numbers are integer literals). The checks are written with jsonb operators and regexes, **not** casts, so a malformed value is refused by a constraint violation instead of raising. Every shape helper returns `false` rather than NULL, because a CHECK constraint treats a NULL result as *satisfied*.
- **Verification was executed**, on a disposable local PostgreSQL 16.15 instance under `/tmp` with a stand-in `auth` schema, never against the live backend: the migration applies cleanly through `psql` and through **drizzle-orm's own migrator** — which proves the file is well-formed SQL and applies through that migrator, **not** that Lovable Cloud uses this migration path — and cross-farm area references, cross-farm corrections, self-supersession, anonymous access, cross-farm writes, viewer/manager roles, evidence immutability, audit append-only, the last-owner guard (including the previously-bypassable "move the only owner to another farm"), farm-delete cascade, and every malformed JSON value — including a fractional masking class value and a caveat array containing a NULL element — all behave as documented. Malformed audit details (`{"before": 3}`, `{"after": "x"}`) are refused by a constraint violation rather than raising, with the nested `jsonb_each` scan guarded against a scalar. **Two things remain untested against the live project: the unauthenticated-denial and cross-farm-denial acceptance tests, which must be run once a sign-in method is deliberately enabled; and Lovable Cloud's migration-runner behaviour, which a local migrator run cannot establish.**
- **The generated TypeScript types remain pending.** `src/integrations/supabase/types.ts` still declares `[_ in never]: never`; this repository has no reproducible offline regeneration path (no `drizzle.config.ts`, no `supabase` CLI, no type-generation script), so Lovable must regenerate them on apply. `drizzle/schema.ts` is Lovable-generated and was left untouched.
- **No sign-in path exists** — no `signInWithPassword`/`signUp` anywhere in `src` — so `attachSupabaseAuthSafely` never actually sends a bearer token, and no server function requires one. Every server function in `src/lib/api/` is public and unthrottled.
- The dashboard's records are **seeded synthetic values** (`src/lib/fieldwise-seed.ts`) that ship to the browser bundle, and the "action log" is in-memory module state (`src/lib/fieldwise-service.ts`) that resets on reload. Weather and Sentinel results live in React state; the imported boundary lives in browser `localStorage`. **Nothing is persisted server-side.**
- The owner reports that farm photos/video exist but the farm location has not been received; **Kasur is only a provisional regional label**, not a verified farm location or geospatial AOI. Existing live weather/Sentinel sample AOIs cover Khanewal and Okara, not Kasur. Do not create a real Kasur farm row, boundary, or farm-specific observation until the owner supplies/authorizes the location; see the open-decision note in `SITREP.md`. No media table or Storage bucket is included in this slice; the design note sets out how photo/video/product ingestion would be added afterwards, once origin, consent, access, retention, and privacy are decided.

> Start Phase 4 from the authoritative Phase 4 section in `SITREP.md`. First inspect and report the existing schema, authentication, authorization/RLS, observation/evidence data flow, storage, audit support, and VPS/Supabase configuration; distinguish implemented behavior from draft files. Identify prerequisites and propose a single-pilot, farm-scoped persistence design before implementation. Persist only the evidence and records required by the roadmap, with provenance, timestamps, least privilege, privacy, backup/deletion behavior, and auditable changes. Keep large rasters in object storage or provider references, never normal database rows. Keep service-role credentials server-side. Update the SITREP with scope, decisions, migrations/configuration, verification, limitations, and next decisions. Do not start Phase 5 recommendations or the deferred weather date selector/multi-year rainfall unless the owner reprioritizes them.

**Owner action before the migration is applied:** review the SQL → take a fresh database export (**More → Database → Manage → Settings → Export data**) → then separately authorise application. Nothing in the repository applies it by itself.
