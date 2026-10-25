# FieldWise Orchard Intelligence — SITREP update

## Date: 2026-10-25

### Work completed today
- Completed Phase 1 foundation for the product data model
- Created the base domain model for estates, sectors, drone telemetry, sensor nodes, recommendations, alerts, and KPI snapshots
- Added a realistic seed inventory to reflect a live orchard estate environment
- Added initial recommendation and summary helper logic
- Added the first PostgreSQL schema draft for the core operational data model
- Committed the Phase 1 foundation to the repo so the project can be cloned and extended locally in VS Code
- Prepared the next developer task list for the local execution phase

### Work in progress
- replacing static dashboard values with shared typed data
- preparing the dashboard for data-driven recommendations and action states
- defining the next operational workflow: recommendation approval and dispatch

### Planned work next
- wire the dashboard to consume shared data from the service layer
- add recommendation approval state transitions
- add live telemetry updates and threshold-based recommendation generation
- move the project from design prototype to operational MVP structure

### Remaining work
- connect front-end UI to backend data layer
- implement operator approval flow
- implement live telemetry updates
- add ROI calculations from operational actions
- add role-based access and multi-estate support
- deploy and validate production-grade behavior

### Blockers / issues
- the prototype still contains more mock UI than real system flow
- the app can be visually impressive without yet behaving like a real operational tool
- a proper backend integration is still required for full product readiness

### Decisions / changes / improvements requested
- keep the product focused on meaningful operational intelligence rather than more cosmetic improvements
- prioritize real system workflow, not extra visual polish
- treat the next milestone as “operational MVP,” not “expensive demo polish”
- use the repo as the working source of truth for ongoing updates and references

### Notes
- The project has advanced from concept into a real product foundation.
- The current progress is sufficient to continue development locally in VS Code, using the repo as the working baseline.
- Phase 1 is complete enough to extend naturally into dashboard integration, action workflows, telemetry, and role-based logic.

---

## Local developer task list for the next implementation sprint

### Step 1 — Clone and initialize locally
Goal: get the repo running in a development environment.

Tasks:
- clone the repo in VS Code
- install dependencies
- verify the project builds without errors

Commands:
```bash
git clone <repo-url>
cd fieldwise-orchard-intelligence
npm install
npm run build
npm run dev
```

Expected deliverable:
- local project is running with no install or build errors

Files involved:
- package.json
- src/

---

### Step 2 — Replace static dashboard data with shared domain data
Goal: stop using hardcoded mock values in the dashboard.

Tasks:
- import the shared data from `src/lib/fieldwise-seed.ts`
- replace static arrays and values in `src/routes/index.tsx`
- map recommendation feed items to real records
- map sensor statuses to the dataset
- map sector states to actual values in the GeoMap

Files involved:
- `src/routes/index.tsx`
- `src/lib/fieldwise-seed.ts`
- `src/types/fieldwise.ts`

Expected deliverable:
- the dashboard reads from shared seed data instead of inline mock constants

Validation:
- sector names and values load from typed records
- recommendation feed reflects actual dataset entries

---

### Step 3 — Build the recommendation approval workflow
Goal: convert recommendations into an operational action flow.

Tasks:
- add a state for each recommendation: pending / approved / dispatched / completed / rejected
- create an approval button on the recommendation cards
- update recommendation status in the shared data object
- optionally create a simple `fieldwise-service.ts` helper to update records
- log action states to a local in-memory action log

Files involved:
- `src/lib/fieldwise-service.ts`
- `src/lib/fieldwise-recommendations.ts`
- `src/routes/index.tsx`

Expected deliverable:
- users can approve a recommendation and the state changes visibly in the dashboard

Validation:
- pending recommendation becomes approved after action
- action log reflects the state transition

---

### Step 4 — Add live telemetry simulation and threshold logic
Goal: make the dashboard feel operational and alive.

Tasks:
- create a timer-based simulation for sensor readings
- update moisture values, NDVI, battery, payload, and signal over time
- trigger rule-based recommendations when thresholds are crossed
- update alert feed based on changing values

Files involved:
- `src/lib/fieldwise-recommendations.ts`
- `src/lib/fieldwise-service.ts`
- `src/routes/index.tsx`
- `src/components/dashboard/GeoMap.tsx`

Expected deliverable:
- values change automatically over time
- recommendations and alerts change based on thresholds

Validation:
- moisture drops below threshold and irrigation alert appears
- NDVI decline triggers a targeted spray recommendation
- drone battery decreases and reflects on the dashboard

---

### Step 5 — Add KPI and ROI calculation flow
Goal: prove business value, not just field visibility.

Tasks:
- calculate savings based on recommendation completion and recommendations approved
- compute water savings and spray optimization values
- update KPI cards from real operational activity
- create a summary for pesticide saved, acreage covered, and efficiency

Files involved:
- `src/types/fieldwise.ts`
- `src/lib/fieldwise-seed.ts`
- `src/lib/fieldwise-service.ts`
- `src/routes/index.tsx`

Expected deliverable:
- KPI metrics are produced from operational state instead of static mock values

Validation:
- approved interventions increase savings metrics
- the KPI bar matches the estate state

---

### Step 6 — Add estate selector and role-awareness foundation
Goal: prepare the product for real multi-estate and enterprise workflow use.

Tasks:
- add a simple estate selector state
- support at least two estates in the seed model
- create placeholder role view logic
- split dashboard states by investor / agronomist / operator role

Files involved:
- `src/types/fieldwise.ts`
- `src/lib/fieldwise-seed.ts`
- `src/routes/index.tsx`

Expected deliverable:
- the app supports multiple estate contexts and role-aware rendering

Validation:
- estate switch updates values shown in dashboard
- role-based logic hides or shows relevant controls

---

### Step 7 — Production cleanup and quality checks
Goal: make the model and code stable and maintainable.

Tasks:
- refactor repeated logic into helpers
- add comments and architecture documentation where needed
- verify no TypeScript errors
- confirm the app still builds cleanly
- update SITREP daily as work progresses

Files involved:
- all changed project files

Expected deliverable:
- clean runner build and maintainable code structure

Validation:
- `npm run build` succeeds
- app continues to render without TypeScript errors

---

## Recommended order to do the work locally

1. Clone and run the project
2. Replace static values with shared seed data
3. Add recommendation approval actions
4. Add simulation and threshold logic
5. Add KPI and ROI updates
6. Expand to estate switching and role view
7. Validate build and iterate

This sequence keeps the project moving from concept to working operational product without bloating the scope too early.

---

## Important reminder

Do not spend time on extra visual redesign before the operational loop works.

The product should be built around this flow:

collect data → analyze conditions → trigger recommendations → get approval → act → measure result → update ROI

That loop is the actual product.
