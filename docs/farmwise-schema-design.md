# Farmwise evidence ledger — Phase 4 first-slice schema design

**Status:** schema design and SQL review are complete. The SQL is archived outside the
active migration path because its manually authored Drizzle journal entry had no matching
snapshot. **NOT applied to the live backend.** No database object or row was changed.

**Reviewed SQL archive:** `docs/farmwise-evidence-ledger-reviewed.sql`
**Active Drizzle journal:** `drizzle/migrations/meta/_journal.json` (empty until Lovable's
native migration workflow creates a valid first migration and snapshot)

---

## 1. What this slice is, and what it deliberately is not

This is the **first persistence slice** of Phase 4 ("Persist the evidence ledger and secure
access"). It persists **one** kind of evidence — a sourced Sentinel-2 NDVI observation
summary — under farm-scoped authorization, with explicit provenance and a database-written
audit trail.

It is deliberately **not** in scope:

| Not included | Why |
| --- | --- |
| Any farm, member, area, observation, or audit row | The schema is prepared for later records; the owner has not supplied a verified pilot identity, and a fabricated record would misrepresent a real farm. |
| Exact farm geometry, coordinates, bounding boxes, boundaries | The owner has not received the farm's location. **Kasur is a provisional regional label, not a verified location.** Nothing in this slice stores a location. |
| A media table or a Storage bucket | The owner has farm photos and video, but their origin, consent, access, retention, and privacy terms are undecided. See §9. |
| Weather, flood, crop, recommendation, approval, or job records | Those need their own typed tables and their own authorization decisions. Adding them now would be speculative. |
| `farm_members` for a named person | The first owner is provisioned later, by the owner, after a sign-in method exists (§8). |

**Empty schema versus demo dataset.** This is a schema prepared for future records, not a
demo dataset. A demo dataset would contain rows with invented farms and fake observations; a
prepared schema contains structure and zero rows. The difference matters: a demo dataset
implies a farm exists, and it would be read as evidence that one does. The migration
contains no top-level `INSERT`, `COPY`, or `VALUES` statement; the only two `INSERT`
statements in the file are inside trigger bodies, which fire on future writes.

## 2. Entities

All five tables live in `public` and are owned by the role that applies the migration.

### `farms` — the tenant root
- **Purpose:** one row per farm. The unit everything else is scoped to.
- **Tenant key:** `id`.
- **Columns:** `id uuid pk default gen_random_uuid()`, `name text not null` (1–200 chars),
  `created_by uuid references auth.users(id) on delete set null`,
  `created_at timestamptz not null default now()`.
- **No location column, and that is deliberate.** The slice has no `location`, `geometry`,
  `bbox`, or coordinate column on any table.
- **Deletion:** an administrator only. There is no `delete` policy and no `delete` grant, so
  the application cannot remove a farm. Deleting a farm cascades to its members, areas, and
  observations (§7).

### `farm_members` — the authorization join
- **Purpose:** who belongs to which farm, and with what role. **This is the only place farm
  access is decided.** No other table grants or implies access.
- **Tenant key:** `farm_id`.
- **Columns:** `farm_id uuid not null references farms(id) on delete cascade`,
  `user_id uuid not null references auth.users(id) on delete cascade`,
  `role text not null check (role in ('owner','manager','viewer'))`,
  `created_at timestamptz not null default now()`. Primary key `(farm_id, user_id)`.
- **Roles.** `owner` — full control including membership. `manager` — creates and updates
  areas and evidence, cannot change membership. `viewer` — read only.
- **Deletion:** a member row goes when the farm or the user account is deleted, or when an
  owner removes it. A farm may never be left without an owner (§6).

### `areas` — the managed blocks of a farm
- **Purpose:** the named estate or block an observation belongs to, so evidence links to
  the right part of the farm rather than the farm as a whole.
- **Tenant key:** `farm_id`.
- **Columns:** `id uuid pk`, `farm_id uuid not null references farms(id) on delete cascade`,
  `name text not null` (1–200 chars, unique per farm), `kind text not null check (kind in
  ('estate','block','sample_aoi'))`, `created_by uuid references auth.users(id) on delete set
  null`, `created_at timestamptz not null default now()`, plus `unique (farm_id, id)` — the
  composite key the evidence foreign key targets.
- **`kind` distinguishes real land from a public reference rectangle.** `estate` and `block`
  are the farm's own land. `sample_aoi` is one of the two fixed public development
  rectangles (Khanewal, Okara) — never a surveyed farm.
- **No geometry column.** Where a boundary will eventually live (private object storage,
  referenced by key) is a later decision (§9).
- **Deletion:** cascades from the farm. An area that still has evidence cannot be deleted:
  the composite foreign key from `evidence_observations` is `on delete no action`, so the
  delete is refused. Deleting an area would otherwise orphan evidence claiming to describe
  that block.

### `evidence_observations` — the record
- **Purpose:** one sourced Sentinel-2 NDVI observation summary, with the provenance needed
  to re-derive or audit it.
- **Tenant key:** `farm_id`.

| Column | Meaning |
| --- | --- |
| `id uuid pk` | Row identity. |
| `farm_id uuid not null references farms(id) on delete cascade` | Tenant key. |
| `area_id uuid not null` | The block this describes. **Not** a plain foreign key: see the tenant-integrity section below. |
| `evidence_type text not null check (evidence_type in ('sentinel2_ndvi'))` | Constrained to the one type in this slice. |
| `source text not null check (source in ('planetary-computer','cdse'))` | The provider that produced it. |
| `source_ref text not null` (1–200 chars) | The provider's own product identifier, so the observation can be re-derived. |
| `platform text` (≤64 chars) | Provider platform, e.g. `sentinel-2a`. |
| `acquired_at timestamptz not null` | **Valid time** — the provider's acquisition instant. |
| `retrieved_at timestamptz not null` | **Retrieval time** — the server clock when the provider answered. Kept apart from `acquired_at`: a stale retrieval of an old scene is not the same fact as a fresh one. |
| `spatial_resolution_m numeric(10,2) not null check (> 0)` | Spatial resolution. |
| `temporal_resolution text not null check (temporal_resolution in ('single_acquisition'))` | Temporal resolution. |
| `units text not null check (units in ('ndvi'))` | Units, explicit even though NDVI is dimensionless. |
| `quality_status text not null check (quality_status in ('ok','partial','degraded'))` | The writer's assessment: every statistic present, some missing, or present but materially caveated. |
| `ndvi_min`, `ndvi_max`, `ndvi_mean`, `ndvi_stddev`, `ndvi_p10`, `ndvi_p50`, `ndvi_p90` | Typed numeric columns, each `check (between -1 and 1)`; `ndvi_min <= ndvi_max` enforced. |
| `sample_count bigint not null`, `no_data_count bigint not null` | Sample counts, with `no_data_count <= sample_count`. |
| `valid_pixel_pct numeric(5,2) not null check (between 0 and 100)` | Usable-pixel share. |
| `tile_cloud_cover_pct numeric(5,2)` | Provider tile cloud cover, nullable. |
| `histogram jsonb not null default '[]'` | Provider NDVI histogram; shape-checked (§5). |
| `histogram_underflow`, `histogram_overflow bigint not null default 0` | Samples outside the histogram range. |
| `masking jsonb not null default '{"excluded":[],"retained":[],"rules":[]}'` | The masking disclosure; shape-checked (§5). |
| `caveats text[] not null default '{}'` | Interpretation caveats; bounded (§5). |
| `attribution text not null` (1–2000 chars) | Provider attribution string. |
| `supersedes_id uuid` | Set when this row corrects an earlier one. **Not** a plain foreign key: see below. |
| `created_by uuid references auth.users(id) on delete set null`, `created_at timestamptz not null default now()` | Who wrote it, and when. |

- **Typed, not a JSON blob.** Every measured quantity is a real column with a range
  constraint. The two `jsonb` columns hold genuinely variadic provider structures and are
  shape-checked.
- **Immutability.** There is no `update` policy and no `delete` policy, and the table grants
  only `select` and `insert`. A written observation cannot be edited or removed through the
  application. **A correction is a new row** whose `supersedes_id` points at the row it
  replaces; the original stays, so the history of what was believed and when is preserved.
- **Idempotence.** A partial unique index on `(farm_id, area_id, source, source_ref,
  acquired_at) where supersedes_id is null` refuses a duplicate re-run. A second unique index
  on `supersedes_id where supersedes_id is not null` allows each row to be corrected at most
  once, so corrections form a chain rather than a fan of competing answers.

### `audit_events` — the audit trail
- **Purpose:** a record of every change to a farm, its members, its areas, and its
  evidence, written by the database rather than by the application.
- **Tenant key:** `farm_id` — deliberately **not** a foreign key, so the trail survives the
  deletion of the farm it describes. Rows orphaned that way are unreadable by any member,
  because access is scoped by farm membership.
- **Columns:** `id bigint generated always as identity pk`, `farm_id uuid not null`,
  `actor_user_id uuid references auth.users(id) on delete set null`, `action text not null`
  (1–64 chars), `entity_type text not null check (entity_type in ('farm','farm_member',
  'area','evidence_observation'))`, `entity_id uuid`, `detail jsonb not null default '{}'`
  (shape-checked, §5), `occurred_at timestamptz not null default now()`.
- **Append-only for application roles.** The table grants `select` only — no `insert`,
  `update`, or `delete` for any application role, and no write policy exists. Rows are
  written **only by database triggers**, so an application cannot forge a history entry or
  rewrite one. A trigger cannot be bypassed by a code path that forgets to log, which is
  exactly the failure mode an application-level audit call has.
- **What it is not.** It is **not tamper-evident** in the cryptographic sense. A database
  administrator with direct write access can still alter or delete rows; the design detects
  no such modification. What it does guarantee is that *application* roles cannot write,
  change, or remove history, and that every change made through the application is recorded
  by the database itself.
- **Deletion:** never by the application. Rows disappear only with the database, or with the
  farm they describe (they are kept, orphaned and unreadable).

## 3. Relationships and enforced tenant integrity

```
farms 1 ──< farm_members >── 1 auth.users
  │
  ├──< areas 1 ──< evidence_observations
  │                   │
  │                   └── self-reference: supersedes_id
  └──< evidence_observations

audit_events  (farm_id, entity_id) — logical link, no foreign key
```

`farm_members` is the join that makes farm-scoped authorization possible. Everything else
hangs off `farm_id` directly, so no policy needs a recursive lookup through `farm_members`.

### The cross-tenant references, and how they are closed

Three relationships cross farm boundaries, and each is closed by the **database**, not by a
policy or an application check:

1. **Evidence naming an area.** `evidence_observations.area_id` is **not** a plain foreign
   key to `areas(id)`. It is a composite foreign key
   `(farm_id, area_id) REFERENCES areas (farm_id, id)`, with `areas` carrying
   `unique (farm_id, id)` as the target. An evidence row therefore cannot name an area
   belonging to another farm **even if the caller knows that area's UUID**, because no
   `(farm, area)` pair exists for it.
2. **A correction superseding another farm's evidence.** `supersedes_id` is a composite
   foreign key `(farm_id, supersedes_id) REFERENCES evidence_observations (farm_id, id)`, with
   `evidence_observations` carrying `unique (farm_id, id)`. A correction may only supersede
   evidence in its own farm.
3. **A row superseding itself.** `check (supersedes_id is null or supersedes_id <> id)`.

The composite foreign keys use **`on delete no action deferrable initially deferred`**. This
is deliberate:

- Deleting an **area** that still has evidence is **refused** — the intended behaviour.
- Deleting the **farm** (which cascades to both its areas and its evidence) is **allowed**,
  because the check runs at the end of the statement, when nothing dangles. A plain
  `on delete restrict` would refuse the farm delete as well, because the area row would be
  removed while its evidence still pointed at it. That was a real defect in the earlier
  draft, caught by execution.

## 4. Row Level Security

Every table has `enable row level security`. All 14 policies are `for ... to authenticated`;
`anon` has **no table grant at all** and therefore reaches no rows under any circumstances.

| Table | Select | Insert | Update | Delete |
| --- | --- | --- | --- | --- |
| `farms` | Member of that farm (`farm_role(id) is not null`). | The creator is the caller (`created_by = auth.uid()`); a trigger makes them owner. | Owner only, `with check` re-tested on the new row. | **No policy and no grant** — administrator only. |
| `farm_members` | Member of the farm. | Owner only. | Owner only. | Owner only; a trigger refuses to remove the last owner. |
| `areas` | Member of the farm. | Owner or manager. | Owner or manager. | Owner or manager; refused while evidence references the area. |
| `evidence_observations` | Member of the farm. | Owner or manager, **and** `created_by = auth.uid()`. Which area the row may name is settled by the composite foreign key, not by this policy. | **No policy and no grant** — evidence is immutable. | **No policy and no grant** — corrections are new rows. |
| `audit_events` | Member of the farm. | **No policy and no grant** — triggers only. | **No policy and no grant.** | **No policy and no grant.** |

Two independent layers enforce this. The **row-level** policies decide *which rows* a
caller may touch. The **table grants** decide *which commands* are possible at all:

```
farms                  → select, insert, update
farm_members           → select, insert, update, delete
areas                  → select, insert, update, delete
evidence_observations  → select, insert
audit_events           → select
```

So even if a policy were later mis-written, `evidence_observations` still cannot be updated
or deleted by the application, and `audit_events` still cannot be written by it. `anon`
receives no grant on any table; `USAGE` on schema `public` is granted explicitly so the
roles can reach the tables at all, which grants no access by itself.

### Avoiding recursive policy evaluation and privilege escalation

A policy on `farm_members` that asked "is the caller a member of this farm?" by querying
`farm_members` would be rejected by PostgreSQL as *"infinite recursion detected in policy"*.
The slice avoids this with one helper:

```sql
create or replace function public.farm_role(p_farm_id uuid)
returns text
language sql stable
security definer
set search_path = ''
as $$
  select m.role from public.farm_members m
  where m.farm_id = p_farm_id and m.user_id = auth.uid()
$$;
```

`SECURITY DEFINER` makes the read run with the function owner's rights, so the
`farm_members` policies are not re-evaluated while it runs. `set search_path = ''` pins
every name to its schema, so nothing on the search path can be substituted for `auth.uid()`
or `public.farm_members`. The function reports **only the caller's own role**, so it cannot
be used to discover another member's role, and it is executable only by `authenticated`.

Normal application access uses the **authenticated user's own JWT**, so RLS applies and the
user's farm scoping is enforced by the database rather than by application code. A
service-role request bypasses RLS entirely, so it would see every farm's rows; it is
reserved for narrowly-scoped administrative work with its own explicit authorization check.

## 5. What the JSON columns actually enforce

The earlier draft described these columns as "bounded" with "shape checks". That was
overstated: the checks then validated *structure* only, with no limit on size, array length,
unknown keys, or numeric range, and they cast extracted text to `numeric`, which **raises**
on malformed input instead of refusing it — so a bad value produced a failed statement
rather than a rejected row. The claims and the code now agree.

Each JSON column is checked by an `IMMUTABLE`, `SECURITY INVOKER` function with a pinned
`search_path`, written with jsonb operators and regular expressions rather than casts, so a
malformed value is **refused by the constraint** and never raises.

### `histogram` — `is_ndvi_histogram(jsonb)`
- Must be a JSON array, of **at most 64 buckets**.
- Total serialised size at most **64 KiB**.
- Each bucket must be an object with **exactly** the keys `lowEdge`, `highEdge`, `count` —
  an unknown key is refused.
- `lowEdge`, `highEdge`, `count` must all be JSON **numbers**.
- `count` must match `^[0-9]{1,15}$`: a non-negative **whole** number of at most 15 digits.
- `lowEdge` and `highEdge` must each be at most 40 characters in text form, so one number
  cannot expand into an unbounded text form.
- `-1 <= lowEdge`, `highEdge <= 1`, and `lowEdge < highEdge` strictly.

**Why these limits.** The shape comes from the product this slice stores: the Sentinel
adapters request **10 bins over [-1, 1]**
(`src/lib/sentinel/planetary-computer-adapter.server.ts`,
`src/lib/sentinel/cdse-adapter.server.ts`). 64 buckets leaves room for a finer binning
without letting one row carry an unbounded array; the digit limits keep a single number
from expanding without bound. The value range is the NDVI domain itself.

### `masking` — `is_masking_disclosure(jsonb)`
- Must be an object with **exactly** the keys `excluded`, `retained`, `rules`.
- `excluded` and `retained` are arrays of **at most 64** class entries; `rules` is an array
  of **at most 64** strings.
- Total serialised size at most **64 KiB**.
- Each class entry must be an object with **exactly** the keys `value`, `label`, `reason`.
- `value` must be an **integer** in **0–255** — a whole number, not a fraction; `label` and
  `reason` must be strings of at most **2000** characters each; each rule string at most
  **2000** characters.

**Why these limits.** The shape comes from the scene classification used here: **12 defined
classes**, of which 8 are excluded and 4 retained (`src/lib/sentinel/ndvi.ts`), so 64 entries
per class list is generous, and 255 is a wide bound on a class number. The class numbers in
that table are integer literals, so a whole number is what the product actually produces —
`1.5` is not a class number and is refused. The integer rule is applied to the rendered
decimal form with a regular expression, so a malformed value is **refused** rather than
raising: a numeric cast of non-numeric text would raise and turn a rejected value into a
failed statement.

### `audit_events.detail` — `is_audit_detail(jsonb)`
- Must be an object whose only possible keys are **`before`** and **`after`**.
- Each present value must itself be an object whose leaves are all scalars
  (`string`, `number`, `boolean`, `null`).
- Total serialised size at most **64 KiB**.
- A **scalar** in place of `before` or `after` — `{"before": 3}`, `{"after": "x"}` — is
  **refused**, not an error.
- A **NULL** input is refused as well; the function returns `false`, never NULL.

**Why this shape.** The trail is written by one trigger, which always records the values
before and after a change. Fixing the shape rather than leaving it free-form means an audit
row cannot carry an unbounded or deeply nested payload of its own, and it keeps the detail
readable to a reviewer.

**Why the nested scan is guarded.** Checking that `before` and `after` are objects means
scanning the leaves inside them, and `jsonb_each` **raises** `cannot call jsonb_each on a
non-object` when it is handed a scalar. An unguarded nested scan would therefore turn a
malformed detail into a *failed statement* rather than a *refused row*. The inner scan is
guarded by passing the entry through only when it really is an object and substituting an
empty object otherwise, so the inner call is safe for every possible input no matter which
order the planner evaluates the branches in. The substitution cannot hide a bad value,
because the outer check rejects any entry that is not an object outright. The function also
returns `false` rather than NULL for a NULL input, because a CHECK constraint treats a NULL
result as *satisfied* — a NULL-returning check would silently accept the row.

### `caveats` — `is_bounded_caveats(text[])`
- At most **64** entries, each at most **2000** characters.
- **No NULL entries.** An array containing a NULL element is refused.

**Why.** Caveats are short human-readable sentences; the bound stops one row carrying an
unbounded text array. A NULL element is refused because `length(NULL)` is NULL and a NULL
comparison is not true, so such an array would otherwise slip past the length test and store
a caveat that reads as "unknown" but carries no text. A caveat is either a sentence or it is
absent; a NULL is neither, and it would leave the column's meaning ambiguous to a reader.

## 6. Triggers

| Trigger | Effect |
| --- | --- |
| `farms_grant_owner` (after insert) | The farm's creator becomes its first `owner`. `SECURITY DEFINER`, because the creator is not yet a member when the row is inserted. A farm created with no creator grants no membership. |
| `farm_members_guard_last_owner` (before update/delete) | Refuses to remove or demote the last owner of a farm, and refuses to **move** a farm's only owner to another farm. Skipped when the farm itself is being deleted, so a cascade is not blocked. |
| `farms_audit`, `farm_members_audit`, `areas_audit`, `evidence_observations_audit` (after insert/update/delete) | Append the change to `audit_events`. `SECURITY DEFINER`, because the audit table grants no insert right to the application. `actor_user_id` is `auth.uid()`, so the row records who made the change. |

### What the audit trail records, and what it does not

- **Inserts, updates, and deletes** on all four farm-scoped tables are recorded. An update
  records **both** the values before and the change, so a changed role or a rewritten
  provenance field is visible without needing the old row.
- **Cascades are recorded too.** Deleting a farm writes audit rows for the farm, its
  members, its areas, and its evidence. Those rows survive the deletion of the farm, because
  `audit_events.farm_id` is not a foreign key — but they become **orphaned and unreadable**,
  because no member can match a farm that no longer exists. That is the intended behaviour:
  the trail is kept for an administrator, not readable by anyone.
- **A deleted user's attribution is erased, not preserved.** `actor_user_id` is
  `on delete set null`, so when an account is deleted its past audit rows remain but the
  actor becomes null. The `detail` payload still holds the values that changed, which
  includes user ids for membership events. This is a deliberate trade: the trail keeps the
  record of the change while not keeping a live link to a person who no longer exists.
- **A change made with no signed-in user** — for example a migration or an administrative
  script — records a null actor, because `auth.uid()` is null in that session.
- **`entity_id` for a membership row** is the member's user id, because a membership row has
  no surrogate key of its own; the farm is identified by `farm_id` alongside it.
- **The trail is not tamper-evident.** A database administrator with direct write access
  can still alter or delete rows, and the design detects no such modification. What it does
  guarantee is that *application* roles cannot write, change, or remove history.

### Deleting the last owner's auth account

This is **intentionally blocked**. `farm_members.user_id` is `on delete cascade`, so deleting
the last owner's account cascades to their membership row, the `farm_members_guard_last_owner`
trigger refuses, and the **whole account deletion is rolled back** — the account survives.
The owner must first transfer ownership to another member (add a second owner, then remove
the first). This is deliberate: a farm with no owner could never be administered again, and
an account deletion that silently orphaned a farm would be worse than a refused deletion. The
error message states this:

```
farm <uuid> must keep at least one owner: transfer ownership before removing this member or deleting that account
```

## 7. Deletion behaviour

| Action | Result |
| --- | --- |
| Delete a farm (administrator) | Cascades to `farm_members`, `areas`, and `evidence_observations`. `audit_events` rows are **kept** — `farm_id` there is not a foreign key — and become orphaned and unreadable. |
| Delete an area | Refused while evidence references it (deferred composite foreign key). |
| Delete a membership row | Owner only; refused for the last owner. |
| Delete an auth account | Cascades to that user's membership rows; refused if it would leave a farm ownerless. |
| Delete evidence | Not possible through the application (no policy, no grant). |
| Delete an audit row | Not possible through the application (no policy, no grant). |

Retention and deletion **windows** for real farm records are an **open owner decision**
(§10); this migration fixes the mechanics, not the policy.

## 8. Provisioning the first farm owner

No sign-in method is currently enabled, so there is no way for a user to authenticate and
no `auth.users` row to attach a membership to. The migration therefore supports two paths,
and the owner picks one. **Neither requires a service-role key or a direct database URL**,
both of which are unavailable.

**Path A — the owner enables a sign-in method, then provisions in the Lovable console.**
Enable one sign-in method in **More → Users**, create the pilot account, then run one
statement in **More → Database → Manage → SQL editor**:

```sql
insert into public.farms (name, created_by)
values ('<real farm name>', '<the pilot account uuid>');
```

The `farms_grant_owner` trigger fires and creates the `owner` membership automatically.
This path needs no credential the owner does not already have.

**Path B — the application creates it.** Once a sign-in method exists, the application's
server function authenticates the caller and inserts the farm with `created_by` set to the
caller's own id; the same trigger grants ownership. The `farms_insert_own` policy enforces
`created_by = auth.uid()`, so a caller cannot create a farm attributed to someone else.

In both paths the first owner is the account that created the farm, and **no farm, member,
or observation is created by this task** — the schema is applied empty and the owner
populates it deliberately.

## 9. How photo, video, and product ingestion would be added later

Not in this slice, and the reason is specific rather than incidental: the owner has farm
photos and video, but their **origin, consent, access rights, retention window, and whether
they may ever leave the farm's own storage** are all undecided, and the farm's location has
not been received. The owner has also not confirmed that the media may be uploaded at all.

When those are decided, the shape is:

1. **A private Storage bucket**, `public = false`, with storage policies keyed on farm
   membership — mirroring the table policies. No bucket is created now.
2. **A `files` table** holding only metadata: `id`, `farm_id`, `area_id`, `storage_path`,
   `content_type`, `byte_size`, `sha256`, `captured_at`, `created_by`, `created_at`, and a
   `kind` in (`photo`, `video`, `product`, `document`). The bytes stay in the bucket; the row
   is a reference, not a payload.
3. **Access by short-lived signed URL**, issued by a server function after a membership
   check, never a public URL. The `files` row is scoped by the same `farm_role` helper.
4. **A separate consent and provenance decision** per media class: who captured it, on whose
   authority, whether the operator consented to upload, and whether it may be shown to
   anyone other than that farm's members. Media is where the usual rules about third-party
   transfer and retention bite hardest, so it gets its own design and its own owner
   sign-off rather than being folded into an evidence migration.
5. **A `location` decision, separate again.** If a real farm's coordinates are ever
   stored, they belong in a private bucket behind a signed URL with a coarse reference in
   the database — the same pattern the file metadata uses — not in a plain column every farm
   member can read in one query.

The point of leaving all of this out now is that each of these is only easily reversible
**before the first record exists**. Adding them after real media or a real location has been
stored is materially harder.

## 10. Open owner decisions that block implementation

These are **owner decisions**, not engineering unknowns. The schema can be applied before
they are answered; the application cannot.

1. **Backend identity.** The Lovable Cloud built-in backend is confirmed; confirm that this
   schema should be applied to *that* project and not to a separate owner-managed Supabase
   project.
2. **Pilot identity.** The real farm name, its owner account, and whether the pilot is a
   single farm or a farm plus one operator. Until this is supplied, the schema stays empty.
3. **Sign-in method** (email/password vs magic link) and whether email confirmation is
   required. **All providers are currently disabled and `Disable sign-up` is off**, so
   enabling a provider later may leave sign-up open to anyone; restrict it before the first
   user is created.
4. **Whether the pilot farm's location, boundary, or media may be stored at all**, and
   under what consent and retention terms (§9). The owner has photos and video but **has
   not supplied the farm's location**; Kasur remains a provisional regional label.
5. **Retention and deletion windows** for evidence rows, audit rows, and any future files.
6. **Whether `sample_aoi` areas are wanted in the pilot at all.** The two public rectangles
   are development areas; recording observations against them inside a farm-scoped ledger is
   legitimate but must stay visibly labelled as a sample area, not a farm.

## 11. How to apply (not done)

Applying is a separate, explicitly authorised step. The owner should:

1. **Review the SQL archive** at `docs/farmwise-evidence-ledger-reviewed.sql`. This file is
   outside the active migration directory and will not be discovered as a pending Drizzle
   migration.
2. The owner confirms the pre-migration export already exists at
   `database_export_11_11_26/fieldwise-orchard-intelligence_261111.backup` (312 KB).
3. Commit and sync the repository cleanup (empty Drizzle journal; reviewed SQL retained in
   `docs/`). Then run Lovable's read-only migration-history inspection and confirm it shows
   no broken/pending entry. Do not request another database structure change before that
   check; Lovable may process all journaled pending migrations on a later schema change.
4. **Only after the baseline is clean and the owner explicitly authorizes it**, ask Lovable
   in Build Mode to apply this reviewed schema through its native migration workflow. The
   reported workflow creates the valid migration file, snapshot, journal entry, applies
   the DDL, records the run, and refreshes TypeScript types as one operation. There is no
   separate preview, so the request may apply immediately. Do not use the shell migrator
   or the general SQL Editor.
5. Verify that the five tables exist and are empty, inspect migration history, and check
   whether generated types were updated. Provision the first owner (§8) only as a separate
   later decision.

**Rollback:** the export from step 2 restores the prior state. There is no down-migration,
deliberately: this schema creates only new objects and changes nothing existing, so removing
the five tables, the eight functions, and the policies is a complete reversal. If a rollback
is needed, the export is the mechanism and the object list in §2 and §4 is the checklist.

## 12. What was verified, and what was not

### Verified by execution

The migration was applied to a **local PostgreSQL 16.15 instance created under `/tmp`** for
this task, with a stand-in `auth` schema (a local `auth.users` table and an `auth.uid()`
that reads the JWT subject from the session GUC, exactly as Supabase's does), plus the
`anon`, `authenticated` and `service_role` roles. **No live Lovable Cloud or Supabase
database was contacted, and no credential was used or added.**

- **Applies cleanly** from an empty database, both through `psql` and through
  **drizzle-orm's own migrator**, which recorded the migration in
  `drizzle.__drizzle_migrations` and left all five tables present and empty. This
  establishes only that the migration file is well-formed SQL and that it applies
  successfully **through that migrator**. It does **not** establish that Lovable Cloud
  uses this migration path — see "Not verified" below.
- **Five tables exist, all empty; RLS enabled on all five; 14 policies** exactly as designed.
- **Tenant integrity** (each attempted as both a superuser and an authenticated caller):
  evidence naming another farm's area is refused by the composite foreign key; a correction
  superseding another farm's evidence is refused; a row superseding itself is refused; a
  valid same-farm correction succeeds; a second correction of the same original is refused;
  a duplicate head observation is refused.
- **RLS roles:** anonymous reaches no table at all; a member sees only their own farm's rows
  across all five tables; cross-farm insert, update, delete, and membership changes are all
  refused (updates and deletes are silent no-ops, not modifications); a viewer cannot write
  evidence while a manager can; a viewer can read.
- **Immutability:** update and delete of written evidence are refused by both policy and
  grant.
- **Audit trail:** application roles cannot insert, update, or delete audit rows; the trail is
  written by triggers and lists every change; an update records distinct before and after
  values; membership rows carry the member's user id as `entity_id`.
- **Last-owner guard:** the last owner cannot be demoted, removed, or **moved to another
  farm**; deleting the last owner's auth account is refused and the account survives; once a
  second owner exists, the first may leave.
- **Farm delete cascade:** deleting a farm that has an area and evidence succeeds and
  removes both; the audit rows survive as orphans and are unreadable by any member.
- **JSON constraints:** a non-numeric count, an edge outside [-1, 1], an unknown bucket key,
  200 buckets, a masking object missing a key, a nested non-scalar masking leaf, a
  **fractional masking class value (1.5)**, a **caveat array containing a NULL element**, a
  3000-character caveat, and an unknown `quality_status` are each rejected by a
  **constraint violation** — not a cast error — and none of the rows was stored. A row
  carrying **integer** class values (0, 3, 11, 255) and ordinary caveat strings is
  accepted and stores correctly.
- **Audit detail shape:** a malformed detail — `{"before": 3}`, `{"after": "x"}`, a JSON
  null, a boolean, an array, a nested non-scalar, or an unexpected key — is refused by a
  **constraint violation** on `audit_events`, not by a raised error; the nested `jsonb_each`
  scan is guarded so it cannot receive a scalar under any evaluation order. Valid
  `before`/`after` objects, including the exact shapes the audit trigger writes, are
  accepted, and the trigger's own rows are unaffected.
- **Function hardening:** all eight functions carry `search_path = ''`; the four
  `SECURITY DEFINER` functions are the trigger/helper set, and the four shape helpers are
  `SECURITY INVOKER`; no function retains `PUBLIC` execute.
- **No seed data:** no top-level `INSERT`, `COPY`, or `VALUES` in the file; the only two
  `INSERT` statements are inside trigger bodies.

### Not verified — cannot be, from here

- **The live backend was never contacted.** The schema has not been applied to Lovable Cloud,
  and nothing in the live project was read or written during this task.
- **The RLS policies were not exercised against the live project.** The local test used a
  stand-in `auth` schema. The policies' *logic* is verified; their behaviour under Lovable
  Cloud's real `auth.uid()`, real roles, and real JWTs is not, and cannot be until a sign-in
  method is deliberately enabled. **The unauthenticated-denial and cross-farm-denial
  acceptance tests remain to be run against the live project after that step.**
- **The generated TypeScript types remain pending.** `src/integrations/supabase/types.ts`
  still declares `[_ in never]: never` for every relation. Regenerating it requires either a
  connection to the live backend or `supabase db pull` against a linked project, and this
  repository has **no** reproducible way to do either offline: no `drizzle.config.ts`, no
  `supabase` CLI, and no type-generation script in `package.json`. The types must be
  regenerated by Lovable when the migration is applied, or by an owner with project access.
  `drizzle/schema.ts` is Lovable-generated and was left untouched.
- **PostgreSQL 17.11 (the live version) versus 16.15 (the local test).** No feature used
  here is version-specific, but the live apply is the first run on 17.
- **Live application is still unverified.** Owner-provided Lovable workflow guidance says
  the native migration operation creates the SQL migration, snapshot, journal entry,
  applies DDL, records the run, and regenerates types together; pending journal entries
  may run on a later structure change. No such operation has succeeded in this project.
  The manually authored entry lacked a snapshot and was removed from the active journal;
  the reviewed SQL is now archived at `docs/farmwise-evidence-ledger-reviewed.sql`.
  After repository sync and a clean read-only history inspection, the owner must authorize
  the native workflow to create and apply the valid first migration (§11). Local tests do
  not establish live RLS behavior or a successful Lovable migration.

## 13. Files

| File | Status |
| --- | --- |
| `docs/farmwise-evidence-ledger-reviewed.sql` | Reviewed SQL archive; **not an active migration and not applied**. |
| `drizzle/migrations/meta/_journal.json` | Empty; the manually authored entry was removed because its required snapshot was missing. |
| `docs/farmwise-schema-design.md` | **Added** — this document. |
| `SITREP.md`, `docs/AGENT_HANDOVER.md` | **Changed** — findings and next steps only. |

No application code, dependency, lockfile, environment file, schema type, or UI file was
changed.
