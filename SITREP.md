# FieldWise Orchard Intelligence — SITREP

## Date: 2026-11-10

## Current handoff — Phase 3 environmental history and forecast accepted (updated 2026-11-10)

### Phase 3 acceptance decision — ACCEPTED within the recorded scope

ERA5-Land retrieval, forecast context, the regional reference products, and the dashboard states required for this slice have been independently checked. The project is ready to move to Phase 4. The accepted product remains a sample-AOI context panel: grid-cell reanalysis and forecast estimates, plus dated district references. It does not claim farm measurements or a farm-level flood/crop record.

- **ECMWF IFS:** existing live forecast path remains independently verified against ecCodes 2.42.0 for Khanewal and Okara at both supported resolutions; prior dev-server, built-artifact, and browser evidence is recorded below.
- **ERA5-Land live retrieval:** using the server-only credentials already configured in `/opt/fieldwise/.env`, authenticated catalogue access returned HTTP 200 and credentialed GRIB1 retrievals succeeded for both public sample AOIs. Credential values were only read in process memory for the request and were never printed or logged. Each payload contains 240 GRIB1 messages (48 each for 2t, 2d, tp, 10u, and 10v) for 2026-11-03 through 2026-11-04.
- **Independent ERA5 oracle:** ecCodes 2.50.0 was installed only under `/tmp` and used as an independent decoder. The app's Fieldglass output matched ecCodes at both selected cells—Khanewal 71.6000°E, 30.6000°N and Okara 73.0000°E, 30.7000°N—for message identity, units, 48 valid times, P1/P2/time-range metadata, grid-cell values, and hourly assembly. The hourly precipitation values matched within 1e-7 m (zero difference in the recorded point comparisons), including the P1=23/P2=24 interval ending at 00 UTC. This payload marks precipitation as one-hour GRIB1 intervals; those amounts are used directly. The prior “cumulative value de-accumulated” UI copy was inaccurate for these files and has been corrected. Reproducible source payloads and ecCodes-oracle JSON are in `src/lib/weather/fixtures/` with CC-BY attribution.
- **Defect fixed from live evidence:** ecCodes/Fieldglass spells wind units as `m s⁻¹`, while the adapter previously accepted only `m s**-1`; this silently dropped 10 m wind components. Equivalent spellings are now normalized strictly, and the real-payload test confirms all five requested variables join at the selected grid cell.
- **Coverage and timestamps:** both sample AOIs return 48 unique joined hourly rows from the 168-hour requested period `2026-11-03` → `2026-11-09`, status `Partial`, with five provider-unavailable days. Provider availability is reported, not filled. The UI now renders all returned rows in its horizontal scroller; each row has a date/time, temperature, and precipitation amount.
- **Browser walkthrough:** Chromium against `http://127.0.0.1:8081/` verified both AOI cards, their selected grid cells, 48 unique joined rows, and the 48/168 partial message. On Khanewal, a successful refresh kept the old result visible while loading and replaced it after success; a deliberately aborted server-function refresh showed an error while retaining the previous result; switching to Okara cleared the Khanewal result. No page errors were observed. The panel has no date selector; selecting a different period remains deferred, as previously directed.
- **Other context products:** the PMD product is explicitly link/reference-only with no station series fetched. Flood context contains a dated 2025 district assessment, not a claim that a sample rectangle flooded. Crop context contains district estimates and census orchard/mango counts, not measurements for either sample rectangle. Unavailable district-level flood history and unreadable crop tables remain documented scope limitations.
- **Runtime scope:** the active target is the Bun VPS. Cloudflare `workerd` execution is not an acceptance gate because no Worker deployment is planned. If that deployment target changes, test the artifact in workerd before deployment.
- **QA:** weather 41/41, geospatial 11/11, Sentinel 29/29, TypeScript clean, targeted ESLint clean, Prettier clean, production build exit 0, and `git diff --check` clean. Tests/build used Bun 1.3.9 downloaded under `/tmp`; no host runtime or permission was changed. The repo-wide ESLint findings documented below are pre-existing and outside the touched files.

### Planned work after Phase 3

- **Deferred Phase 3 enhancement — date-range selector:** expose manual start/end dates for ERA5-Land, retain the 31-calendar-day safeguard, validate dates server-side, and show provider-reported gaps. This has not been implemented and was explicitly deferred by the owner.
- **Deferred long-range rainfall analysis:** use a separate precipitation-only retrieval/aggregation path for multi-year history; return daily/monthly/annual summaries rather than thousands of hourly rows. Research and implementation details remain in the plan below; this work is not part of Phase 3 acceptance.
- **Next roadmap phase — Phase 4:** persist the evidence ledger and secure access, following the authoritative “Reconciled build roadmap” below. Phase 4 has not started. First audit the existing schema, auth, data flows, and storage; then define a single-pilot, farm-scoped persistence design with provenance, least privilege, and auditable changes. Keep rasters out of database rows and secrets server-side.

### End-of-day closeout — 2026-11-10

- Phase 3 acceptance work and the related boundary/UI fixes were committed as `cd74d2c` (`Complete Phase 3 weather and environmental context`) and pushed to GitHub `main`. The repository was clean and synchronized after the push. The commit includes the live ERA5-Land/ecCodes fixtures and attribution, weather adapters/UI/tests, boundary validator correction, Sentinel result-retention behavior, application wiring, package/build configuration, and this project's prior Phase 3 evidence and handover updates.
- GitHub CI was considered. The pushed commit contains no `.github/workflows/` files, so there is no repository GitHub Actions workflow to start manually. Required repository checks were not separately inspected in GitHub settings; the direct push to `main` succeeded. The project checks had already passed before the commit: weather 41/41, geospatial 11/11, Sentinel 29/29, TypeScript, targeted ESLint, Prettier, production build, and `git diff --check`.
- Date selection is a known product gap, but it is deliberately deferred. The later implementation plan is manual ERA5-Land start/end selection with an app-side 31-calendar-day cap, provider availability/gap reporting, and server-side date validation. The current 31-day cap is an application safeguard, not a claim that CDS only permits 31 days; the current panel uses its default seven completed UTC days.
- Multi-year rainfall is a separate future product path, not an extension that renders years of hourly rows. The plan is to research and then retrieve precipitation in bounded chunks, validate interval/accumulation semantics, and aggregate to daily/monthly/annual summaries. A 5–10 year use case was discussed as a target range, not implemented or promised against CDS quotas. Evaluate CDS hourly time-series/ARCO and request limits before selecting a production approach.
- Displayed Sentinel-2 and environmental results remain mounted until refresh; a refresh preserves the prior result while loading or after failure, a successful response replaces it, and an explicit AOI change clears it to avoid stale-area data. Date-change clearing is a requirement for the future date-selector work. Current UI state is in memory and does not survive a page reload.
- The user-provided boundary GeoJSON was reviewed earlier today: it is a styled `LineString`, not an estate polygon, and it does not include sector polygons. The estate-only validator correction is committed. No farm boundary was invented or imported; the candidate geometry still needs confirmation against its source/survey before conversion.
- **Next session:** start with this current handoff and the “Reconciled build roadmap” below; prepare Phase 4 by reviewing the existing schema, authentication, authorization, data/storage paths, and audit support. Record what already exists and define a scoped implementation/acceptance plan before changing code. Keep date selection and multi-year rainfall in the deferred plan unless the owner reprioritizes them.

The closeout record is maintained here and in `docs/AGENT_HANDOVER.md`; Phase 4 is the next planned implementation phase, and no Phase 4 code has started.

> Historical snapshots below describe earlier checkpoints. Any prior “partial/unaccepted,” “not yet verified,” or old test-count language is superseded by this acceptance record. Read them for audit history only; do not follow their superseded next-action prompts.

### User-provided boundary format review — estate-only imports (2026-11-10)

- The supplied GeoJSON was one styled `LineString`, not a `Polygon`, and had no estate/sector role. The Field Boundaries dialog says sector polygons may be omitted and missing sectors remain unmapped, but `validateBoundaryGeoJSON` incorrectly rejected any file with zero sector polygons. Removed that extra rejection: a valid estate polygon can now be imported by itself, with each unmatched sector reported as a warning and kept off-map.
- Closing all supplied line vertices to form a polygon creates a self-intersection between the penultimate return edge and the closing edge. A simple-ring candidate is possible only by excluding the final supplied point (`71.8631426, 30.4075813`) and closing the preceding point to the first. This assumption must be checked against the source/survey before the candidate is treated as the real estate boundary. No sector polygons were supplied or inferred.
- The validator change and estate-only behavior passed in the owner's geospatial suite (11/11). The candidate shape has not been imported in the browser. The final supplied coordinate is still an unresolved geometry question; no boundary file was saved or imported. The validator change itself is included in the Phase 3 commit `cd74d2c`.

### Historical QA checkpoint — preserve displayed observations through refresh (superseded by accepted walkthrough above)

- The owner subsequently reran the weather suite in the VPS container: **40/40 passed**. TypeScript, targeted ESLint, and Prettier checks were reported clean. The owner also reran the geospatial suite after the estate-only import test was added: **11/11 passed**. These results supersede the earlier 38/40 weather run and formatting findings below in the preceding QA history.
- The weather diagnostic key now uses the GRIB1 accumulation end time when the message provides a usable hourly P2; otherwise it uses the canonical reference time. The two assertions check the corresponding valid-time key. The timestamp/coverage source fixes have automated coverage and static checks, but automated passes do not independently establish correct values from the genuine CDS payload.
- The owner requested Sentinel-2 and environmental results remain visible until manually refreshed, without timed auto-dismissal. No expiration timer was found in either panel. Previously, Sentinel search cleared the current results as soon as a search started, and WeatherPanel hid its last context whenever a refresh entered loading or error. Both panels now retain the last successful result while a refresh is pending or fails. A successful refresh replaces it. Sentinel observations retain the scene metadata they belong to while another scene is loading. Explicit AOI/date changes still clear results to avoid showing data under the wrong area or period.
- Retention is in the mounted page's React state; results are not written to local/session storage. A browser reload or route unmount starts a fresh panel state. The panels report retrieval timestamps, so a retained result's age remains visible.
- **Verification still required:** browser-check refresh-in-progress, refresh-failure, successful replacement, AOI/date clearing, and persistence while idle. Confirm the latest timestamp/coverage behavior in the running app for both sample AOIs. The current automated checks do not cover those browser interactions. No commit or push.

### Historical QA checkpoint — live CDS defect discovery (fixes later verified; superseded above)

- The owner manually added `CDS_API_URL` and `CDS_API_KEY` to `/opt/fieldwise/.env`. A local check reported only booleans: both variables are non-empty, the URL matches the documented API base, the key is not an obvious placeholder, and the file is mode `0600`, owner `fieldwise`. The check read the key only in process memory to evaluate whether it was empty/a placeholder; it was not displayed, logged, copied, or included in the response.
- The owner recreated the VPS `fieldwise-dev` container with the existing image digest, user `995:986`, `/app` bind mount, working directory, loopback-only port `127.0.0.1:8081`, restart policy and Vite command, adding `--env-file /opt/fieldwise/.env`. A temporary copy on port 8082 received both variables and returned HTTP 200; the promoted container also received both variables and reported Vite ready. The root page later returned HTTP 200 (0.246 s) and `/@vite/client` returned HTTP 200 (0.096 s). These checks confirm container injection and app availability, not CDS authentication.
- The owner's later browser result for Khanewal, period `2026-11-03` through `2026-11-09`, showed ERA5-Land `Available`, 50 timestamps, and a provider-availability notice that five requested days were skipped. This is evidence that the credentialed CDS path submitted a job, returned a file and produced decoded observations for Khanewal; it is incomplete coverage, not a full seven-day result. ECMWF was `Available`; link/reference products rendered. The displayed 50-row count is from the pre-fix UI and must not be treated as the corrected count.
- **Data defect found from that live response:** the output showed duplicate `2026-11-03 00:00` entries, with temperature and precipitation separated. Code inspection confirmed instantaneous GRIB1 values were keyed to the cycle reference time instead of reference time plus P1; interval precipitation uses reference time plus P2. The timestamps also differed in their millisecond formatting. The adapter now resolves instantaneous valid times from the raw GRIB1 timing fields and canonicalizes UTC timestamps before joining variables. It now labels truncated ranges `Partial`, reports returned versus expected hourly timestamps, and removes the stale caveat claiming no CDS credential was available. Two regression tests were added for timestamp alignment and partial coverage.
- The earlier generic-failure defect is also fixed: `retrieveWeatherContext` maps rejected providers through safe error mappers instead of hiding the error code/message. The CDS token and raw provider response are not exposed.
- **Earlier checks, superseded by the latest QA output above:** the first timestamp/coverage-fix run reported weather 38/40 and formatting issues. After correcting the diagnostic key and formatting, the owner reported weather 40/40, clean typecheck, targeted ESLint and Prettier. Those results do not independently validate precipitation against the downloaded provider file.
- **Next action:** refresh the browser, request both AOIs, and verify no duplicate valid times, matched temperature/precipitation timestamps, `Partial` status where days are unavailable, and the returned-versus-expected hour count. Independently compare at least one returned ERA5-Land GRIB1 payload against ecCodes before marking hourly precipitation validated. Do not print or share the token.
- Credentials are now configured in the VPS runtime by the owner; they are not available to this agent's Docker session. The token was not displayed, logged, copied, or disclosed by the agent. The owner ran the container replacement; the agent did not change host permissions, install host tooling, or alter unrelated services. No commit or push was made.

### Authoritative project state

- Phase 2 Sentinel-2 demo acceptance is met for the no-account demo: both Khanewal and Okara sample AOIs were verified against the live Microsoft Planetary Computer API for catalog search, selected item, visible preview PNG, heavy statistics, and light statistics.
- CDSE Sentinel Hub is implemented but its credentialed live path remains pending because no OAuth credentials are configured. The public fallback only accepts the two fixed, labelled sample AOIs; these are not surveyed farms.
- Latest Phase 2 commit: `1ca2545` (`Complete Phase 2 Sentinel-2 demo vertical slice`), pushed to `origin/main`. The VPS checkout is at `21b7731`; all Phase 3 work below is uncommitted.
- **Current product truth:** Phase 3 is accepted within the scope recorded at the top of this SITREP. ECMWF IFS and ERA5-Land run for both fixed sample AOIs; ERA5 GRIB1 values/timing and hourly assembly are checked against ecCodes 2.50.0 fixtures captured from genuine CDS responses. Partial provider availability is shown rather than concealed. Flood and crop products are dated district-level context, while PMD is link-only; none claim farm-level observation. Other dashboard measurements and operations remain illustrative/synthetic; there is no natural-color RGB layer, time series, farm diagnosis, drone dispatch, irrigation control, or pollination workflow.

### Historical Phase 3 implementation snapshot — superseded by final acceptance above

- **ECMWF IFS — implemented, live, and independently verified.** Unchanged by this session and re-verified: index-driven byte ranges, CCSDS/AEC (template 5.42) decoding, parameter/run/lead-time checks, nearest-cell selection with ecCodes' tie-break, unit conversion, bounded sizes/timeouts/concurrency and per-field failure visibility. Verified for both AOIs at 0.25° and 0.1° against ecCodes 2.42.0, in the dev server, in the built artifact running without `node_modules`, and in the browser.
- **ERA5-Land — credentialed request and decode now work for Khanewal, but returned coverage is partial and timestamp assembly is being corrected.** New tests use ecCodes-authored GRIB1 fixtures to check P1/P2/time-range decoding and reject period totals that cannot be represented as hourly rainfall. The owner's live response covered 50 timestamps for a requested 168-hour period and reported five unavailable days; duplicate timestamps separated variables, which led to the new P1-based instantaneous time mapping and canonical joining. Those latest edits still need tests and browser verification. The retrieved payload has not been independently cross-checked with ecCodes, so precipitation remains unvalidated. **Do not accept hourly precipitation until the fixes are verified and an actual provider GRIB1 payload is independently checked.**
- **PMD — verified dated reference.** Unchanged: PMD publishes station observations for KHANEWAL (WMO 41677, 30.29 °N 71.93 °E) and OKARA (WMO 41646, 30.8 °N 73.4 °E) on a page read in a browser during QA; the product links to it and states each station's ~45 km / ~42 km distance from the sample areas. Nothing is retrieved: there is no documented API, the page refuses plain HTTP clients, and no reuse terms were established.
- **Flood — now a dated district-level record, still not an AOI-level claim.** A Rapid Needs Assessment published by the Government of Pakistan and UN OCHA (23 September 2025) names **Khanewal** (high priority) and **Okara** (medium priority) among the 18 flood-affected districts assessed in the 2025 monsoon. It is listed first, with the explicit caveat that a district-level assessment does not mean the sample rectangle inside it was flooded. The Flood Forecasting Division's river-level publications remain as background, and the district-level PDMA Punjab situation reports are still unreachable from this environment.
- **District crop context — now orchard-specific as well as crop estimates.** District wheat and fodder area and production come from the federal compilation of the Crop Reporting Service estimates; district **orchard** and **mango** figures come from the Pakistan Bureau of Statistics' _Agricultural Census 2024 — Punjab Report_ (June 2026), a census rather than an estimate: Khanewal 4,338 farms reporting orchards (25,162 acres of orchard area) and 8,230 farms reporting 932,284 mango trees; Okara 1,270 farms reporting orchards (3,943 acres) and 3,485 farms reporting 14,018 mango trees. The Crop Reporting Service's own mango table remains unreadable (page images), so no figure is taken from it and none is invented.
- **Security/input boundary — re-checked.** Only the two fixed sample IDs are accepted; only their centroids are ever sent to a provider; no imported or private geometry is in the request contract. The CDS key is read server-side only, is never logged, and is **not** sent to the provider's asset host — the download link is validated as HTTPS and fetched without the credential. Provider-supplied job identifiers are validated and URL-encoded before they are put in a request path.
- **UI — walked in a real browser.** 20 checks pass, including the loading state, the disabled AOI selector during a request, the rendered forecast with its attribution/units/grid cell/timestamps, the ERA5 setup state, the ERA5 success state (exercised with a synthetic, clearly-labelled product), the three reference products with their dated records, the absence of stale values after switching AOI, and no horizontal overflow at 390 px.
- **Automated checks.** Weather 32/32, geospatial 10/10, Sentinel 29/29, `tsc --noEmit` clean, targeted ESLint clean, Prettier clean, production build exits 0, `git diff --check` clean. Repo-wide ESLint still reports the same 209 pre-existing Prettier errors in files this work did not touch.

### Earlier ERA5-Land precipitation defect and correction (live-payload validation is recorded above)

**What was wrong.** The adapter copied the decoded `total_precipitation` value into every hourly observation. ERA5-Land publishes that parameter as an accumulation, so the product was showing a running total as if it were an hourly amount.

**What the provider documents** (ERA5-Land data documentation, "Accumulations", <https://confluence.ecmwf.int/spaces/CKB/pages/140385202/ERA5-Land+data+documentation>): "The accumulations in the short forecasts of ERA5-Land (with hourly steps from 01 to 24) … are accumulated from the beginning of the forecast to the end of the forecast step", with "HRES: accumulations are from 00 UTC to the hour ending at the forecast step", and for the store's validity time of 00 UTC "the accumulations are over the 24 hours ending at 00 UTC i.e. the accumulation is during the previous day".

**The correction (Option A — de-accumulate the raw field).** ERA5-Land runs one daily forecast from 00 UTC, so each published value belongs to a _cycle_. The hourly amount for the hour that ended at a validity time V is the difference between V and the hour before it **inside the same cycle**; the first hour of a cycle starts from zero, and the hour that ends at 00 UTC belongs to the previous day's cycle. The implementation (`src/lib/weather/era5-precipitation.ts`, pure and separately testable) groups the decoded messages by cycle start and forecast step, derives the amounts, and reports an hour as missing — never as a wrong or negative amount — when its predecessor in the cycle is absent, when the provider's bitmap says the cell is absent, when the accumulation decreases inside a cycle, or when the message states no forecast step. Each reported timestamp is the **end** of the hour it describes, which is the validity time the provider publishes.

**The boundary samples.** The first hour of a requested period needs the cumulative value of the hour before it, which belongs to the previous day's cycle, so the day before the period is requested as well and its observations are dropped afterwards (`planRetrieval`, `filterToPeriod`). No hour is silently omitted or shifted at midnight or at the edges of the selected range.

**What is still unproven.** The mapping from an actual provider GRIB1 message to "cycle start" and "forecast step" could not be confirmed against a real ERA5-Land file here: the Climate Data Store's archive and its ARCO catalogue both answer `401 MISSING_CREDENTIALS` without a token, and the store's own sample viewer exposes no public payload. There is an additional decoder-integration question: the installed Fieldglass GRIB1 type documentation defines `forecastHours` from PDS P1 regardless of the time-range indicator, and exposes `offsetHours` separately; `fieldglass.server.ts` currently forwards `forecastHours` but not `offsetHours`, while the precipitation normalizer treats `forecastHours` as the accumulation end step. The pure de-accumulation tests construct already-decoded messages directly, so they do not verify how real GRIB1 metadata maps to those fields. Until a genuine file or independently validated GRIB1 fixture establishes the correct mapping, keep `precipitationValidated: false`; synthetic-browser values are not provider-validated rainfall.

### ERA5-Land retrieval implementation and provider contract (earlier research snapshot)

Each item was checked against the provider's published catalogue, process description and OpenAPI document rather than from memory.

| Item                  | What was verified                                                                                                                                                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request body          | `variable`, `year`, `month`, `day`, `time`, `area` (`[north, west, south, east]`), `data_format: "grib"`, `download_format: "unarchived"` — the fields the process description declares, with the area in the documented order.                                      |
| Month grouping        | One request per calendar month, so every (year, month, day) combination the provider accepts is valid; the provider's constraints document pairs valid days with their month, and a request listing an invalid day is refused.                                       |
| Date constraints      | The provider's own constraints document is read (publicly) and expanded into the days it holds; requested days it does not hold are dropped and reported.                                                                                                            |
| Availability handling | When the constraints document cannot be read the availability is recorded as **unknown**, not "everything is available": the days are sent as asked, the provider still refuses what it does not hold, and the product says the availability could not be confirmed. |
| Job polling           | `POST …/processes/reanalysis-era5-land/execution` → job id → `GET …/jobs/{id}` until `successful`, `failed`, `rejected` or `dismissed`, with a bounded wait; a queued job produces an explicit "still preparing" timeout rather than a value.                        |
| Error mapping         | 401/403 → auth failure, 429 → rate limited, other statuses → a fixed non-sensitive provider message; a non-JSON body, a missing job id and a result without a download link are all provider-response-invalid errors.                                                |
| Size limits           | The download is capped at 32 MB and aborts if the declared or streamed size exceeds it.                                                                                                                                                                              |
| GRIB edition          | The decoder accepts GRIB1 and GRIB2 (the store serves ERA5-Land in GRIB edition 1, the forecast path uses edition 2); both are read through the same decoder.                                                                                                        |
| Credentials           | The token is sent only to the configured API base, never to the provider's asset host; job ids are validated and URL-encoded; the asset link must be HTTPS. Nothing is logged beyond an error _name_.                                                                |

### Flood and crop scope: what was found

| Source                                                                                                                | What it gives                                                                                                                                                    | How it is used                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rapid Needs Assessment: Floods in Punjab (23 September 2025), Government of Pakistan and UN OCHA, hosted by ReliefWeb | A dated assessment of the 2025 monsoon covering 1,928 mouzas in 18 flood-affected districts, naming **Khanewal** (high priority) and **Okara** (medium priority) | The flood product's first record; the district names and priorities are quoted, and the caveat states that a district-level assessment does not establish flooding inside the sample rectangle. |
| Agricultural Census 2024 — Punjab Report, Pakistan Bureau of Statistics (June 2026)                                   | A census (counts, not estimates) of farms reporting orchards and of fruit trees by district, in tables 6.3 and 6.4                                               | The crop product's orchard and mango figures, with the table references and the "district total, not this sample area" caveat.                                                                  |
| Crops Area and Production (District Wise) 2021-22, Ministry of National Food Security & Research                      | District crop area and production from the provincial Crop Reporting Services                                                                                    | The wheat and fodder district estimates; the mango and citrus tables in the same publication are page images and no figure is taken from them.                                                  |
| PMD Flood Forecasting Division                                                                                        | River-level bulletins, advisories and annual flood reports (2006–2025)                                                                                           | Kept as dated river-level background, explicitly not as district events.                                                                                                                        |
| PDMA Punjab                                                                                                           | District-level flood situation reports                                                                                                                           | Still unreachable from this environment (blocked by the network filter); the district flood history beyond the 2025 assessment therefore remains partly undocumented.                           |

### Cloudflare runtime: what was exercised, what stays open

The project's plan is a Bun container running the dev server; there is no production deployment, and the Nitro `cloudflare-module` preset is the template's default build target rather than a deployment decision. **No host tooling was installed and no container or host configuration was changed.** What was exercised with the current code:

- The documented production build (`bun run build` → Nitro `cloudflare-module`, `.output/server/wrangler.json`) succeeds and now carries the decoder binary: `.output/server/_virtual_fieldglass-wasm-*.mjs`, 2,367,060 bytes, decoding to a valid 1,775,239-byte WebAssembly module.
- That artifact was copied to a directory with **no `node_modules`** and driven through its own `fetch` handler: HTTP 200, `status: "ok"`, 24 frames, 0 failures and the ecCodes-verified values for both AOIs at both resolutions — so the decoder loads without a filesystem.
- A `NITRO_PRESET=bun` build, run as a real HTTP server in an isolated directory, served the same forecast path and values.
- The client bundle contains no decoder binary and no server-only identifier (checked by searching the emitted assets).

**Runtime limitation, not a Phase 3 gate:** workerd itself was not executed — no wrangler/workerd is installed here and installing host tooling is out of scope. The actual deployment target remains the Bun VPS, with no Cloudflare Worker deployment planned. If a Worker deployment is selected later, verify the artifact in workerd before deploying it there.

### Earlier browser walkthrough (superseded by the live-data walkthrough recorded at the top)

20/20 checks pass: the idle state names the sample-AOI provenance and shows no values; refresh shows the loading state and disables the AOI selector; the forecast renders with its status, source, resolution, grid cell, grid-cell method, issue time, retrieval time, attribution, temperature in °C, precipitation in mm labelled as a 0–3 h accumulation, the valid time and the 24-step strip; the ERA5 card shows the credential setup state in the live app and, with a clearly synthetic product, renders its hourly rows with the date and hour, the temperature, the hourly amount in mm/h, a dash for a missing hour and the note that the de-accumulation is not yet validated against a live payload; the flood product shows the dated district assessment with the right priority for each district; the crop product shows the census orchard and mango figures; switching AOI clears the previous result so no stale value appears under the wrong area; and there is no horizontal overflow at 390 px. Screenshots of the states were captured outside the repository.

### Earlier automated checks (counts superseded by the final QA at the top)

| Command                                                                                                                                                              | Result                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run test:weather`                                                                                                                                               | 32/32 passed                                                                                                                                         |
| `bun run test:geospatial`                                                                                                                                            | 10/10 passed                                                                                                                                         |
| `bun run test:sentinel`                                                                                                                                              | 29/29 passed                                                                                                                                         |
| `bun node_modules/typescript/bin/tsc --noEmit`                                                                                                                       | clean                                                                                                                                                |
| `bun x eslint src/lib/weather src/lib/api/weather.functions.ts src/components/dashboard/WeatherPanel.tsx src/routes/index.tsx src/start.ts vite.config.ts src/types` | clean                                                                                                                                                |
| `bun x prettier --check` on the same files, `package.json`, `SITREP.md`                                                                                              | clean                                                                                                                                                |
| `bun run build` (production, Nitro `cloudflare-module`)                                                                                                              | exit 0; decoder binary present in the server bundle; absent from the client bundle                                                                   |
| `git diff --check`                                                                                                                                                   | clean                                                                                                                                                |
| `bun x eslint .` (whole repository)                                                                                                                                  | 209 errors, all pre-existing, in `src/integrations/supabase/*`, `src/lib/fieldwise-seed.ts`, `src/lib/fieldwise-service.ts` — untouched by this work |

### Scoped limitations after Phase 3 acceptance

- **ERA5-Land remaining data gaps — scoped, not an acceptance blocker.** The provider returned 48 of 168 expected timestamps for the default period and identified five unavailable days. Missing days remain absent and visible; no interpolation or fabricated values are used. The full 48-hour decoded samples and hourly assembly were independently cross-checked at both AOIs as recorded above.
- **Cloudflare Workers runtime — out of scope for Phase 3.** The deployed development target is the Bun VPS container; there is no Cloudflare Worker deployment target. The Nitro Cloudflare build is a template artifact, not a deployment decision. The self-contained artifact was tested in other runtimes, but workerd was not executed. If a Worker deployment is later selected, workerd verification becomes a deployment gate then.
- **District flood history — scoped limitation, not an acceptance blocker.** The product shows dated district-level assessments and FFD reports with explicit caveats; it does not claim AOI-level inundation. Older PDMA district situation reports could not be retrieved, and no machine-readable flood extent feed was established.
- **Orchard-specific crop context — scoped limitation, not an acceptance blocker.** PBS 2024 census orchard/mango counts and the available district crop estimates are shown as regional figures. The unreadable CRS mango table and unavailable later estimate edition remain gaps; no farm-level crop claim is made.
- **Reference product labels — code-inspected.** PMD is `missing` because no station observations are retrieved; the flood product is `ok` with dated district-level records; crop context is `ok` with populated district estimates/census figures. Their statuses describe the records actually present, not a farm-level retrieval.

**Earlier next-action prompt (closed):** browser checks and ecCodes comparison were completed and are summarized at the top. The remaining bullets in this section are scope limitations, not open Phase 3 acceptance gates. No commit or push was made.

### Close-of-day record — 2026-11-10 (earlier session; superseded by the handoff above)

- Re-reviewed the Phase 3 implementation and prior QA summaries against the source. The attached summaries overstated validation and decoder error handling; those claims are not accepted as evidence.
- Reconciled the top handoff, the historical source-evaluation section, the older implementation notes, and the initial verification notes so they now direct work to the QA gates above. Historical sections remain for traceability and must not override the current handoff.
- `git diff --check` — passed after SITREP edits. App page `http://127.0.0.1:8081/` returned HTTP 200 during this session; this is only a page availability check, not weather-function or UI-interaction acceptance.
- Project checks and end-to-end weather interactions were not run. Host Node/Bun are unavailable and Docker socket access is denied to this session. No runtimes, permissions, or services were changed to bypass that restriction.
- No code was changed as part of this closeout; the only additional change is this SITREP reconciliation. No commit or push was made.
- Close-of-day working tree: modified `.env.example`, `SITREP.md`, and `src/routes/index.tsx`; untracked `src/components/dashboard/WeatherPanel.tsx`, `src/lib/api/weather.functions.ts`, and `src/lib/weather/` (5 files). These 7 untracked files contain 2,026 lines. Base remains commit `21b7731` on `main`, tracking `origin/main`.

**Next session checklist (from that session):** start with the current handoff above; work in the existing application container if access is available; add/repair tests for sample-ID/date validation and forecast decoding/status behavior; independently compare real ECMWF fields for both AOIs; update UI states and copy based on actual server results; run and record checks in the container; then revise the handoff with evidence. Leave Phase 3 marked unaccepted until all required gates pass. Do not add CDS credentials or commit/push as part of the resume step without a separate authorized task.

### VPS move — initial setup complete

The user authorized moving development to the existing Contabo VPS after Phase 2, while keeping the PC copy and GitHub synchronized. The VPS runs Ubuntu 24.04.5 with 4 vCPU, 7.8 GiB RAM, and 66 GiB free on the 96 GiB root volume. Beszel and Uptime Kuma and other project services were already running. The project was cloned from GitHub `main` into `/opt/fieldwise-orchard-intelligence` at `e75de3b474b9952ca368bb2419be9fc10aa881a9`; the dedicated non-login account is `fieldwise` (UID 995/GID 986). No host Node/Bun installation was made. Dependencies were installed from the committed `bun.lock` using `oven/bun:1.3.9` (image digest `sha256:856da45d07aeb62eb38ea3e7f9e1794c0143a4ff63efb00e6c4491b627e2a521`) inside Docker.

**Isolation rules:** keep FieldWise in its dedicated directory/account/container. Do not share or overwrite another project's files, environment, database, container, or process. The app container `fieldwise-dev` maps only `127.0.0.1:8081` on the host to port 8081 in the container. It is accessed through an SSH tunnel; no public FieldWise port, firewall, nginx, global runtime, Beszel/Uptime Kuma, PostgreSQL, or other project service was changed. The VPS runtime configuration is stored outside the Git checkout at `/opt/fieldwise/.env` (mode `0600`, owner `fieldwise`) and contains only Supabase publishable configuration; no CDSE OAuth secrets are configured. `.env` and `.env.*` are now ignored by Git, with `.env.example` retained. The existing public Git history still contains the prior tracked file, but it held only Supabase publishable values, which are intended for client use; do not add secrets to it.

**Access from the PC:** `ssh -L 8081:127.0.0.1:8081 root@169.58.232.30`; then open `http://localhost:8081/`. The tunnel was verified from the PC and returned HTTP 200. Stop the foreground SSH tunnel with Ctrl+C. The VPS app container is named `fieldwise-dev`.

**VS Code Remote SSH:** the `fieldwise` system account now has `/bin/bash` and an SSH authorized key matching the existing root login key. The account owns the workspace, has no sudo or Docker-group membership, and the VS Code server is installed under `/opt/fieldwise/.vscode-server`. The PC SSH config has a separate `fieldwise-vps` alias for this account. In VS Code, use **Remote-SSH: Connect to Host… → `fieldwise-vps`**, then open `/opt/fieldwise-orchard-intelligence`; alternatively run `code --remote ssh-remote+fieldwise-vps /opt/fieldwise-orchard-intelligence`. Editing this workspace triggers the running Vite app's hot reload. Docker lifecycle commands still require the existing root SSH login.

**Container operations (run on VPS):** `docker logs -f fieldwise-dev`; `docker restart fieldwise-dev`; `docker stop fieldwise-dev`; `docker start fieldwise-dev`. The container restarts automatically after a VPS reboot. To update after pushing local changes: check the VPS working tree, run `git -C /opt/fieldwise-orchard-intelligence pull --ff-only`, then `docker restart fieldwise-dev`. The container runs as UID/GID 995:986; the runtime image is isolated from host packages.

**GitHub push from VPS:** the clone currently has read-only HTTPS access. A repo-scoped Ed25519 deploy key is generated at `/opt/fieldwise/.ssh/github_deploy` (private key mode `0600`); add its `.pub` value as a write-enabled deploy key in this repository's GitHub Settings before attempting pushes from the VPS. Then configure the repo's SSH remote to use that key and verify authentication. Until that is done, make edits on the VPS but push commits from the authenticated PC copy, then fast-forward-pull them on the VPS.

**Verification performed:** image availability checked; `bun install --frozen-lockfile` completed (473 packages); Vite reported ready on 8081; VPS loopback HTTP and PC SSH-tunnel requests both returned HTTP 200 with the rendered app (about 60 KB). Confirmed listener binding is `127.0.0.1:8081`; existing Beszel/Uptime Kuma services remained running on their original ports. The live satellite adapter was not re-exercised after moving; Phase 2's live PC API verification remains the evidence for that feature.

### Phase 3 source decision — research and implementation acceptance completed

The provider comparison below records the research decision for the two public sample AOIs. Live retrieval and acceptance evidence is summarized at the top of this SITREP. The selected minimal set remains ERA5-Land for historical reanalysis, ECMWF Open Data IFS for forecast, and official PMD/PDMA/FFD/Punjab CRS references where no dependable programmatic feed was established. These remain grid/regional estimates or dated records, not farm observations. No paid imagery/provider is in scope.

---

## Earlier QA Review — Phase 3 FarmWise weather/context (superseded snapshot, 2026-11-10)

This was a separate agent's shell-blocked snapshot. Its blocked findings and file inventory are historical and are superseded by the current handoff and later owner-provided outputs near the top of this SITREP. The genuine CDS payload comparison and latest full browser interaction checks remain open as stated in the current handoff.

### QA scope and method

- Verified via code inspection: AOI input validation, date validation, default period computation, product type distinctness, grid-cell selection metadata, caveat/invariant labels.
- Verified via owner-provided context: ECMWF IFS forecast vs ecCodes, ERA5-Land partial data retrieval, CDS credentials configured in VPS runtime, test suite results.
- Shell environment unavailable for independent test execution; browser not accessible for live interaction.
- No credentials accessed, printed, or logged. CDS_API_KEY never requested from owner.

### QA findings — verified

| Area                 | Finding                                                                                                 | Status         |
| -------------------- | ------------------------------------------------------------------------------------------------------- | -------------- |
| AOI restriction      | Only `sample-khanewal-orchards` and `sample-okara-farmland` accepted via zod enum; unknown IDs rejected | Verified       |
| Date validation      | ISO format, real calendar date, from<=to order, max 31 days                                             | Verified       |
| Default period       | Previous 7 completed UTC days (computed server-side)                                                    | Verified       |
| Product distinctness | ERA5-Land historical, ECMWF forecast, PMD station, flood event, crop district — separate types/statuses | Verified       |
| Grid-cell disclosure | Method, resolution, cell center shown for grid-sampled products                                         | Verified       |
| Crop context         | District-level CRS + census data; explicitly caveated as not farm-level                                 | Verified       |
| ECMWF forecast       | Verified against ecCodes for both AOIs at two resolutions                                               | Owner-provided |
| CDS credentials      | Configured in VPS runtime                                                                               | Owner-provided |
| ERA5-Land            | Partial status, 48/168 hourly timestamps, 5 missing days                                                | Owner-provided |
| Test suites          | Weather 40/40, geospatial 11/11, tsc clean, ESLint clean, Prettier clean                                | Owner-provided |

### QA findings — cannot independently verify (blocked)

| Area                       | Blocker                                                      | Required action                                   |
| -------------------------- | ------------------------------------------------------------ | ------------------------------------------------- |
| ECMWF forecast values      | Shell broken; cannot run ecCodes or dev server               | Re-run in project container                       |
| ERA5 precipitation         | Genuine CDS GRIB1 payload needed; ecCodes comparison pending | Owner: validate against CDS payload using ecCodes |
| Live browser behavior      | Shell broken; browser not accessible                         | Owner: verify Khanewal + Okara in browser         |
| PMD/flood product statuses | Code lines 104-549 not readable via tool truncation          | Code inspection needed                            |
| Automated re-run           | Shell broken                                                 | Re-run `bun run test:weather` etc.                |

### Acceptance decision

**Phase 3: PARTIAL — not yet accepted.**

Reasons:

1. ERA5-Land hourly precipitation remains unverified pending ecCodes comparison against a genuine CDS GRIB1 payload. The UI correctly marks this unverified.
2. PMD/flood product statuses could not be confirmed from code inspection (builders at lines 104-549 not visible due to tool truncation).
3. Live browser behavior for both AOIs could not be exercised (shell broken).
4. Automated test suites could not be re-run independently (shell broken).

### Manual actions required from owner

1. **ERA5 precipitation validation:** Retrieve a genuine CDS GRIB1 payload for the 2026-11-03→2026-11-09 period and compare message identifiers/variables, GRIB1 reference time, P1/P2 and time-range indicator, valid timestamps, grid-cell identity/value, and precipitation accumulation/de-accumulation against ecCodes independently. Include a cycle boundary around 00 UTC. Compare at least one representative point for both AOIs if the payload includes them.
2. **Live browser verification:** For Khanewal and Okara, verify displayed period (2026-11-03 → 2026-11-09), Partial status, returned/expected count (48 of 168), missing-day message, paired temperature+precipitation on each hourly row, duplicate timestamp absence across all 48 rows, AOI clearing on switch, and refresh retention behavior.
3. **PMD/flood/crop status confirmation:** Inspect PMD station reference and flood-event product builders; confirm status labels truthfully reflect data presence (not "Available" when empty).
4. **Re-run automated checks:** `bun run test:weather`, `bun run test:geospatial`, `bun x tsc --noEmit`, targeted ESLint, Prettier.

### Deferred items (out of scope for Phase 3)

- Date-range selector in UI (no date controls exist; default period only)
- Multi-year rainfall analysis
- workerd/Cloudflare Worker verification (actual runtime is Bun VPS; no Worker deployment)

### Files changed in Phase 3

Modified: `.env.example`, `SITREP.md`, `src/routes/index.tsx`
New: `src/components/dashboard/WeatherPanel.tsx`, `src/lib/api/weather.functions.ts`, `src/lib/weather/` (5 files)
Total new lines: ~2,026

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
- The visible map is demo geometry with the ability to import validated estate/sector GeoJSON. **There is still no real basemap, satellite map layer, or live weather feed.** Imported boundaries are stored in browser `localStorage` only. Phase 2 added a _separate_ Sentinel-2 observation panel below the dashboard grid (not a map overlay): with CDSE server credentials it uses Sentinel Hub; without them, only the Khanewal/Okara sample AOIs use the public Microsoft Planetary Computer fallback. Imported boundaries do not go to the public fallback. _(Superseded in part on 2026-11-10: the ECMWF Open Data forecast feed now runs live for the two fixed sample AOIs — see the current handoff above. There is still no basemap and no satellite map layer.)_
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

## Historical expanded roadmap and gates (superseded by the current handoff above)

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

**Build:** Add historical weather and current forecast as separate, timestamped data products. Add dated flood-event/extent context and regional crop-area context where authoritative data is available. Treat historical flood layers as exposure context, not current water status. Do not assume WaPOR has fresh higher-resolution data for a selected Pakistan site; verify coverage first.

**Source comparison and initial decision (2026-11-09; Khanewal and Okara sample AOIs):**

| Candidate                                                                                                                                             | Coverage, variables, resolution and cadence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Terms/access/limits                                                                                                                                                                                                                                                                                                                  | Phase 3 decision                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [PMD (Pakistan Meteorological Department)](https://weather.gov.pk/regional/Punjab)                                                                    | Official station observations, climate summaries, station normal/record pages, regional reports, and an agro-advisory page with a 7-day Khanewal forecast are publicly visible. Its Punjab site lists current station highlights including Khanewal; Okara also appears in station tables. Coverage and cadence vary by product; no AOI-specific station series or public documented API was established.                                                                                                                    | Official public pages/reports were accessible without credentials in this review. A programmatic data service, stable API limits, and reuse/license terms for bulk station records remain unverified.                                                                                                                                | Keep as the preferred local reference and possible future station layer, but do not scrape or label gridded values as PMD observations. Confirm station identity, distance, actual data availability, and terms before any connector.                                                                                     |
| [ERA5-Land](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land) (Copernicus Climate Change Service / ECMWF)                              | Global land reanalysis, 0.1° / about 9 km, hourly from 1950; includes 2 m temperature/dewpoint, precipitation, wind and land/surface variables. ERA5-Land-T is refreshed daily and is available about 5 days behind real time; preliminary values are later replaced by consolidated data around two months after the month. Both AOIs fall inside coverage.                                                                                                                                                                 | Dataset page provides CC BY attribution. CDS access requires user account; documented CDS/MARS and ARCO access paths, not a simple unauthenticated JSON API. Operational data availability can be delayed.                                                                                                                           | Select as the primary long historical weather product. Keep the ERA5-Land-T provisional/final version and retrieval time explicit. Prototype ingestion should be small and server-side.                                                                                                                                   |
| [CHIRPS v3](https://www.chc.ucsb.edu/data/chirps3)                                                                                                    | Global land rainfall estimate at 0.05° (about 5 km at these latitudes), 1981–near present; daily, pentad, dekad, monthly and longer aggregates. Preliminary station blend appears 2 days after each pentad ends; final product is usually produced monthly around the third week of the next month. It is rainfall-only. Daily products partition pentadal totals and do not define a uniform station observation day.                                                                                                       | Public downloadable files (GeoTIFF, NetCDF, BIL, COG); CC BY 4.0. No API key; bulk/static download is the documented path.                                                                                                                                                                                                           | Strong candidate for independent rainfall comparison/validation, but defer from the smallest first slice because ERA5-Land already supplies rainfall and CHIRPS adds another spatial/temporal product to explain. Revisit if rainfall accuracy/context merits a second estimate.                                          |
| [Open-Meteo Forecast API](https://open-meteo.com/en/docs)                                                                                             | Global multi-model point forecasts, hourly normalized output, up to 16 days; variables include temperature, precipitation/probability, humidity, wind and ET₀. Most global source models refresh about every 6 hours; selected “best match” model can vary by point.                                                                                                                                                                                                                                                         | No key for free noncommercial use; free tier limits are 10,000 calls/day, 5,000/hour, 600/minute, with no uptime guarantee. API access is explicitly noncommercial only even though returned data is CC BY 4.0. Commercial plans are paid.                                                                                           | Do not select for FieldWise product integration: commercial product intent conflicts with free API terms. Useful only for a strictly noncommercial evaluation sandbox.                                                                                                                                                    |
| [ECMWF Open Data IFS forecast](https://www.ecmwf.int/en/forecasts/datasets/open-data)                                                                 | Global operational forecast; 4 runs/day (00/06/12/18 UTC), hourly/3-hourly early leads and 6-hourly later steps, up to 15 days; the free subset added 0.1° output (about 11 km at Punjab latitudes) on 2026-10-20, in addition to 0.25°. Surface fields include temperature, dewpoint, precipitation, wind, pressure and radiation, subject to the published subset.                                                                                                                                                         | CC BY 4.0 and ECMWF terms permit commercial reuse with attribution. GRIB2 files; rolling archive holds the latest 12 runs (about 2–3 days). Public portal/cloud mirrors; no API key documented for public subset. 0.1° appears about two hours after 0.25°; portal connection limits are published (500–2,000 concurrent, variable). | Select as the initial open forecast provider. Implement a narrow GRIB subset/point extraction with server-side retrieval and explicit run/issue and valid times; do not assume a persistent historical forecast archive. Validate variables, download size, cloud mirror access, and Pakistan availability before coding. |
| [PDMA Punjab](https://pdma.punjab.gov.pk/situational-reports) / [PMD Flood Forecasting Division](https://ffd.pmd.gov.pk/flood-reports) flood material | PDMA Punjab publishes event situation reports (including dated 2022 reports), flood maps and impact/affected-district materials; PMD Flood Forecasting Division publishes annual flood reports. These are dated event evidence, often PDF/maps at district or river-corridor level, not a continuous current-inundation layer. PITB describes a public flood-management interface and satellite-based inundation assessments, but this review did not establish a stable downloadable GIS/API endpoint for AOI intersection. | Public official reports/maps were accessible; machine-readable formats, reuse terms and API limits are not documented consistently. Some details are in PDF or map images.                                                                                                                                                           | Use as cited, dated event records in the context view only once a usable item is manually reviewed/georeferenced. Do not infer current flooding or claim AOI overlap from district-level reports. A stable farm-level historical flood layer is not selected yet.                                                         |
| [Agriculture Department, Government of Punjab — Crop Reporting Service](https://agripunjab.gov.pk/crs-crop-estimates)                                 | District-wise crop area and average yield estimates are published by crop/year in PDF estimates. The reviewed 2023–24 estimates include mango and districts Okara and Khanewal; newer crop estimate publications are also listed. Geography is district, not farm/parcel.                                                                                                                                                                                                                                                    | Public PDFs via the department website; source credit names Crop Reporting Service. No documented API, update SLA, or general reuse license was found in this review.                                                                                                                                                                | Select as regional crop context, not per-AOI crop presence. Present crop, district, estimate year, unit and source link; do not infer crop identity for the sample rectangle. Defer automated ingestion until crop/year table parsing and terms are reviewed.                                                             |

**Chosen minimal source set:** ERA5-Land for historical gridded weather, ECMWF Open Data IFS for a commercially reusable forecast, PMD as a local reference pending a documented data interface, Punjab PDMA/FFD dated reports for reviewed flood-event context, and Punjab Crop Reporting Service annual district estimates for regional crop context. CHIRPS v3 is a credible optional rainfall cross-check; Open-Meteo is excluded from product use because its free service is noncommercial. This is a source decision, not evidence that connectors or AOI data retrieval have been implemented. The public Khanewal/Okara rectangles remain demo AOIs, not farms.

**Next implementation gate:** confirm coordinates are sampled to a declared nearest grid cell (with cell center, grid spacing, and method shown), then prototype one historical request and one forecast file extraction for each fixed AOI. Record provider status, units, retrieval time, missing-data behavior, and response sizes without logging precise geometry or provider payloads. Resolve public flood/crop item formats and their reuse terms before importing records. Keep the products strongly distinguished as PMD observed station data, ERA5-Land reanalysis estimates, ECMWF forecast runs (issue and valid time), dated flood reports/extents, and district/year crop statistics.

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

1. Phase 1.1 GeoJSON validation and Phase 2 Sentinel-2 demo slice are complete; do not restart them unless a specific defect is found.
2. The app is running in the isolated VPS workspace and is openable with VS Code Remote SSH using `fieldwise-vps`.
3. Continue **Phase 3 QA remediation** from the current handoff: make the ECMWF forecast path trustworthy or explicitly unavailable, fix AOI/date validation, and verify product states and UI before acceptance. Source comparison is recorded below and does not need to be repeated unless provider documentation has changed.
4. Keep the pilot selection unresolved. Khanewal and Okara are sample AOIs only, not surveyed farms or a confirmed pilot. Continue assumption gathering separately from implementation.
5. Follow the current Phase 4–8 roadmap below one phase at a time. Keep treatment and controller actions simulated or advisory until the evidence, qualified partners, equipment, and safety gates exist.

The first useful milestone is not “AI diagnoses a disease.” It is: **for a labelled area and date, FieldWise retrieves real satellite imagery, shows its quality and history, adds dated weather context, flags a transparent change, and creates an investigation record that can later accept field confirmation and outcome data.**

## Historical prototype snapshot (superseded by the current handoff above)

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

| Stage                                                  | Khanewal | Okara | Evidence                                                                           |
| ------------------------------------------------------ | -------- | ----- | ---------------------------------------------------------------------------------- |
| Catalog search (`POST /api/stac/v1/search`)            | 200      | 200   | 16 / 28 scenes, window 2026-10-11→2026-11-05, all with `eo:cloud_cover`            |
| Selected item (`GET /collections/…/items/{id}`)        | 200      | 200   | Newest scenes validate; id + B08/B04/SCL assets match                              |
| Preview (`POST /api/data/v1/item/feature/…png`)        | 200      | 200   | PNG signature + IHDR dims match request; `ndvi-grayscale` encoding; 40 KB / 149 KB |
| Statistics heavy (`POST /api/data/v1/item/statistics`) | 200      | 200   | Block keyed by expression string                                                   |
| Statistics light (top-sentinel min)                    | 200      | 200   | min within [-1, 1], min ≤ max                                                      |

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

The earlier linear sequence (boundaries → satellite → persistence → simulated actions → ROI) is retained above as historical implementation context and is superseded by the **Reconciled build roadmap** and current handoff. The statement in older notes that changes were local and uncommitted describes the state at the time those notes were written; it is not the current Git status. See `docs/AGENT_HANDOVER.md` for the current repository, VPS, tooling, and next-phase handoff.

## ### Phase 3 — initial implementation record (2026-11-09; current status corrected in handoff)

**Change record — what was implemented in this working tree**

This section records the initial code added for the two fixed public sample AOIs (Khanewal and Okara). It does not mean Phase 3 has passed QA or acceptance. The authoritative status and remaining gates are in the current handoff at the top of this file.

1. **Historical weather product — ERA5-Land reanalysis** (server-only adapter `src/lib/weather/era5-land.server.ts`, server function `retrieveEra5LandHistory`). Grid cell selection: nearest 0.1° grid point to AOI centroid (method stated, cell center shown). CDS credentials are not configured in this environment, so the product returns an explicit `credentials_required` state with no fabricated values. The CDS API path (NetCDF/GRIB parsing) is documented but not implemented — this is a setup/error state, not live data.

2. **ECMWF Open Data IFS forecast attempt** (server-only adapter `src/lib/weather/ecmwf-ifs.server.ts`, server function `retrieveEcmwfForecast`). Code attempts to retrieve GRIB2 forecast fields from the public endpoint without credentials. The custom parser and its grid/time/value outputs have not been validated against a real field and an independent decoder. Do not treat its output as an accepted live forecast. The implementation can turn individual failures into null fields and currently marks the product `ok` if any one requested value decodes; this status behavior needs correction.

3. **Combined context product** (`retrieveWeatherContext` in `src/lib/api/weather.functions.ts`) that returns ERA5-Land, ECMWF forecast, PMD station reference, PDMA/PMD flood-event context, and Punjab Crop Reporting Service district statistics as separate, distinct products in one call. One product's failure does not block the others.

4. **PMD station, flood, and crop context** — these are reference-only products with no programmatic data fetch or imported records (PMD pages, dated PDMA/PMD FFD reports, Punjab CRS crop/yield PDFs). Their current status is `missing`; links and regional context are not observations or verified event/estimate records.

5. **New UI** — `src/components/dashboard/WeatherPanel.tsx` renders all 5 product types with distinct labels, source, resolution, units, grid method, cell center, issue/valid times, retrieval time, status chips, caveats, and a "sample AOI, not a surveyed farm" banner. Wired into `src/routes/index.tsx`.

**Files changed or added**

**New files:**

- `src/lib/weather/types.ts` — shared types for all 5 weather product types (ERA5-Land historical, ECMWF IFS forecast, PMD station reference, flood-event context, crop-district statistics), response envelopes, and error vocabulary.
- `src/lib/weather/aoi.ts` — fixed public sample AOIs (Khanewal, Okara), `bboxCenter`, `selectGridCell`, `resolveWeatherAoi`. Grid-cell selection only accepts the two fixed sample AOIs; imported/private boundaries are never sent to public providers.
- `src/lib/weather/errors.ts` — weather-specific user-safe error messages.
- `src/lib/weather/ecmwf-ifs.server.ts` — ECMWF Open Data IFS adapter. Server-only; no credentials; GRIB2 section parsers (0–7), `fetchGribFieldValue`, `nearestGridPointIndex`, `latestCycle`.
- `src/lib/weather/era5-land.server.ts` — ERA5-Land CDS adapter. `hasEra5LandCredentials`, `era5LandCredentialsRequired`, `retrieveEra5LandHistorical`, `toEra5LandError`.
- `src/lib/api/weather.functions.ts` — TanStack Start server functions: `retrieveEra5LandHistory`, `retrieveEcmwfForecast`, `retrieveWeatherContext` (all products), `toWeatherError`.
- `src/components/dashboard/WeatherPanel.tsx` — UI panel for all weather products.

**Modified files:**

- `.env.example` — added `CDS_API_URL` and `CDS_API_KEY` documented under "ERA5-Land historical weather".
- `src/routes/index.tsx` — added `<WeatherPanel />` to the dashboard.
- `SITREP.md` — this implementation record.

**Setup requirements**

1. ERA5-Land historical retrieval is **not implemented**. The missing-credential state is present, but adding CDS credentials alone will not enable retrieval. Do not add credentials until the request, response parsing, AOI/date validation, and a live acceptance path are implemented.

2. ECMWF Open Data IFS requires no API key for its public subset, but the implemented adapter is not accepted until decoded values and status/error behavior pass the gates in the current handoff.

3. No other infrastructure changes. No database, PostGIS, queue, worker, or paid imagery added.

**Checks performed**

- TypeScript, focused weather tests, lint/format, and build — not run for this weather slice in the close-of-day session; see the current handoff for the environment blocker.
- Live ECMWF forecast fetch and GRIB2 decoding — not independently verified. A page HTTP 200 is not forecast-path verification.

**Source limitations and blocked access**

- **ERA5-Land via CDS**: credentials not configured; NetCDF/GRIB parsing not implemented; no historical values fetched. Returns a clear setup state. This is documented as a limitation, not fabricated data.
- **ECMWF forecast**: the hand-written parser is unverified and its section offsets/widths are suspect. Field failures can become null values; one successful field can currently make the whole product `ok`. Do not use returned values as accepted evidence until independently cross-checked.
- **PMD, PDMA/FFD, Punjab CRS**: link-only, no programmatic retrieval; no stable machine-readable GIS/API feed exists.
- The two sample AOIs remain public demo rectangles, not surveyed farms.

**Notes on the working tree**

- This working tree is **uncommitted**. Files are added on top of `21b7731` (main, https://github.com/tariqshaz/fieldwise-orchard-intelligence).
- No tests added. No build run yet.

## ### Phase 3 — initial verification notes (superseded by close-of-day QA record)

**ERA5-Land credential verification**

- CDS API credentials (`CDS_API_URL`, `CDS_API_KEY`) are **not configured** in the VPS runtime environment at `/opt/fieldwise/.env`.
- The file currently contains only Supabase publishable keys (`SUPABASE_PROJECT_ID`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`).
- The ERA5-Land adapter (`src/lib/weather/era5-land.server.ts`) correctly detects the absence of credentials and returns a `credentials_required` product status with the message: _"CDS API credentials are not configured on this server. Set CDS_API_URL and CDS_API_KEY (server-only, see .env.example) to enable reanalysis retrieval."_
- No historical reanalysis values are fabricated — the product shows `status: "credentials_required"` with an empty `observations` array and appropriate caveats about reanalysis being grid-cell estimates, not on-farm sensor readings.
- Do not add CDS credentials yet: the adapter does not implement the credentialed request or parse path, so credentials alone cannot enable historical retrieval.

- Without credentials, the WeatherPanel displays the ERA5-Land product with the `credentials_required` status chip and the caveat about missing setup.

**ECMWF Open Data IFS forecast verification**

- The ECMWF adapter exists and makes unauthenticated requests to the public endpoint, but actual forecast values and parser correctness were not independently verified. Its run-selection, GRIB2 offsets, byte-range handling, scan order, and units remain acceptance work.
- Individual fetch/decode failures can be converted to nulls. Because status is currently `ok` when any one value is present, partial/missing steps can be hidden; fix this before treating the product as usable.
- The app page returned HTTP 200, but the weather server functions and WeatherPanel interaction flow were not exercised end to end in this session.

**Remaining work**

- Implement and test the ERA5-Land request/parser before considering credentials; credentials are currently absent and must not be added as a substitute for implementation.
- Fix AOI/date validation, forecast error/partial status semantics, and complete independent ECMWF decoder verification as specified in the current handoff. No database, PostGIS, queue, worker, or paid imagery was added or is required by the present acceptance plan.
- The two fixed public sample AOIs (Khanewal and Okara) remain as development fixtures, not surveyed farms. Imported/private boundaries are never sent to public providers.

**Source decision preserved**

- ERA5-Land for historical gridded weather (CDS credentials required, setup state until configured)
- ECMWF Open Data IFS for a commercially reusable forecast
- PMD as a local reference pending a documented data interface
- Punjab PDMA/FFD dated reports for reviewed flood-event context
- Punjab Crop Reporting Service annual district estimates for regional crop context
- CHIRPS v3 as a credible optional rainfall cross-check (deferred from smallest first slice)
- Open-Meteo excluded from product use because its free service is noncommercial
