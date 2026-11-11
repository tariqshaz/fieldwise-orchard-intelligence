-- Farmwise evidence ledger — Phase 4 first slice.
--
-- This migration creates STRUCTURE ONLY. It inserts no rows: no farm, no
-- member, no area, no observation, no audit event, and no storage object.
-- The schema is prepared for future records that only the project owner may
-- authorise.
--
-- Scope of this slice:
--   * one tenant root (`farms`), one membership join (`farm_members`),
--     one block list (`areas`), one typed evidence table limited to sourced
--     Sentinel-2 NDVI summaries (`evidence_observations`), and one audit trail
--     (`audit_events`);
--   * farm-scoped Row Level Security on every table, so an authenticated
--     user can only ever see their own farm's records;
--   * database-enforced tenant integrity: an evidence row cannot point at
--     another farm's area, and a correction cannot supersede another farm's
--     evidence or itself;
--   * no farm geometry and no coordinates of any kind — a farm's exact
--     location, boundary, and imagery are deliberately out of this slice.
--
-- This file is a local, reviewable draft. It has NOT been applied to the
-- Lovable Cloud backend. The design, the guarantees it does and does not
-- give, and the manual steps before it may be applied are recorded in
-- `docs/farmwise-schema-design.md`.

-- ---------------------------------------------------------------------------
-- 0. Prerequisites.
--    This targets a Supabase-compatible backend: the `auth` schema and the
--    `anon` / `authenticated` / `service_role` roles must already exist. They
--    are asserted, not created.
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('auth.users') is null then
    raise exception 'auth.users is missing: this migration targets a Supabase-compatible backend';
  end if;
  if to_regprocedure('auth.uid()') is null then
    raise exception 'auth.uid() is missing: this migration targets a Supabase-compatible backend';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise exception 'the anon role is missing: this migration targets a Supabase-compatible backend';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception 'the authenticated role is missing: this migration targets a Supabase-compatible backend';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    raise exception 'the service_role role is missing: this migration targets a Supabase-compatible backend';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 1. Shape-checking helpers for the bounded jsonb columns.
--
--    These are IMMUTABLE, SECURITY INVOKER functions with a pinned
--    `search_path`, so a caller cannot change what they mean by changing the
--    session's search path. They are executable only by the roles that
--    actually write the tables (see section 6).
--
--    The checks are deliberately written with jsonb operators and regular
--    expressions rather than with casts of extracted text to numeric. A cast
--    raises on malformed input, which would turn a rejected value into a
--    failed statement; jsonb comparison and regex matching simply do not
--    match, so a malformed value is refused by the constraint.
-- ---------------------------------------------------------------------------

-- True when `value` is an NDVI histogram: an array of at most 64 buckets,
-- each an object with exactly the keys lowEdge, highEdge and count, each
-- value a JSON number, both edges inside [-1, 1], lowEdge strictly below
-- highEdge, and count a non-negative integer.
--
-- The limits come from the shape of the product this slice stores: the
-- Sentinel adapters request 10 bins over [-1, 1]
-- (`src/lib/sentinel/planetary-computer-adapter.server.ts`,
-- `src/lib/sentinel/cdse-adapter.server.ts`), so 64 buckets leaves room for
-- a finer binning without letting one row carry an unbounded array. The
-- per-value digit limits keep a single number from expanding into an
-- unbounded text form.
create or replace function public.is_ndvi_histogram(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(value) <> 'array' then false
    when jsonb_array_length(value) > 64 then false
    when octet_length(value::text) > 65536 then false
    else not exists (
      select 1
      from jsonb_array_elements(value) as bucket
      where jsonb_typeof(bucket) <> 'object'
         or (bucket - 'lowEdge' - 'highEdge' - 'count') <> '{}'::jsonb
         or not (bucket ? 'lowEdge' and bucket ? 'highEdge' and bucket ? 'count')
         or jsonb_typeof(bucket -> 'lowEdge') <> 'number'
         or jsonb_typeof(bucket -> 'highEdge') <> 'number'
         or jsonb_typeof(bucket -> 'count') <> 'number'
         or (bucket ->> 'count') !~ '^[0-9]{1,15}$'
         or length(bucket ->> 'lowEdge') > 40
         or length(bucket ->> 'highEdge') > 40
         or (bucket -> 'lowEdge') < to_jsonb(-1::numeric)
         or (bucket -> 'highEdge') > to_jsonb(1::numeric)
         or (bucket -> 'lowEdge') >= (bucket -> 'highEdge')
    )
  end;
$$;

comment on function public.is_ndvi_histogram(jsonb) is
  'Shape check for evidence_observations.histogram: a bounded array of '
  '{lowEdge, highEdge, count} buckets. Returns false for malformed input '
  'rather than raising.';

-- True when `value` is a masking disclosure: an object with exactly the keys
-- excluded, retained and rules; excluded and retained are arrays of at most
-- 64 class entries, each an object with exactly the keys value, label and
-- reason, value an INTEGER class number in 0..255, and label and reason
-- short strings; rules is an array of at most 64 short strings.
--
-- The class number must be an integer, and it is enforced as such: the
-- rendered decimal form must match '^[0-9]{1,3}(\.0+)?$', which admits only
-- a whole number of at most three digits — optionally written with a zero
-- fractional part, so 3 and 3.0 are both whole numbers — and therefore
-- rejects a genuinely fractional value such as 1.5. A regular expression is
-- used rather than a numeric cast or a trunc() comparison because a cast of
-- text that is not a number RAISES, which would turn a rejected value into a
-- failed statement rather than a refused row; the same reasoning as the
-- histogram check below. The 0..255 bound is then applied with the ordinary
-- numeric comparison.
--
-- The limits come from the product shape: the scene classification used here
-- has 12 defined classes, of which 8 are excluded and 4 retained
-- (`src/lib/sentinel/ndvi.ts`), so 64 entries per class list is generous,
-- and 255 is a wide bound on a class number.
create or replace function public.is_masking_disclosure(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(value) <> 'object' then false
    when (value - 'excluded' - 'retained' - 'rules') <> '{}'::jsonb then false
    when not (value ? 'excluded' and value ? 'retained' and value ? 'rules') then false
    when jsonb_typeof(value -> 'excluded') <> 'array' then false
    when jsonb_typeof(value -> 'retained') <> 'array' then false
    when jsonb_typeof(value -> 'rules') <> 'array' then false
    when jsonb_array_length(value -> 'excluded') > 64 then false
    when jsonb_array_length(value -> 'retained') > 64 then false
    when jsonb_array_length(value -> 'rules') > 64 then false
    when octet_length(value::text) > 65536 then false
    else not exists (
      select 1
      from jsonb_array_elements(value -> 'excluded') as entry
      where jsonb_typeof(entry) <> 'object'
         or (entry - 'value' - 'label' - 'reason') <> '{}'::jsonb
         or not (entry ? 'value' and entry ? 'label' and entry ? 'reason')
         or jsonb_typeof(entry -> 'value') <> 'number'
         or (entry ->> 'value') !~ '^[0-9]{1,3}(\.0+)?$'
         or (entry -> 'value') < to_jsonb(0)
         or (entry -> 'value') > to_jsonb(255)
         or jsonb_typeof(entry -> 'label') <> 'string'
         or jsonb_typeof(entry -> 'reason') <> 'string'
         or length(entry ->> 'label') > 2000
         or length(entry ->> 'reason') > 2000
    )
    and not exists (
      select 1
      from jsonb_array_elements(value -> 'retained') as entry
      where jsonb_typeof(entry) <> 'object'
         or (entry - 'value' - 'label' - 'reason') <> '{}'::jsonb
         or not (entry ? 'value' and entry ? 'label' and entry ? 'reason')
         or jsonb_typeof(entry -> 'value') <> 'number'
         or (entry ->> 'value') !~ '^[0-9]{1,3}(\.0+)?$'
         or (entry -> 'value') < to_jsonb(0)
         or (entry -> 'value') > to_jsonb(255)
         or jsonb_typeof(entry -> 'label') <> 'string'
         or jsonb_typeof(entry -> 'reason') <> 'string'
         or length(entry ->> 'label') > 2000
         or length(entry ->> 'reason') > 2000
    )
    and not exists (
      select 1
      from jsonb_array_elements(value -> 'rules') as rule
      where jsonb_typeof(rule) <> 'string'
         or length(rule #>> '{}') > 2000
    )
  end;
$$;

comment on function public.is_masking_disclosure(jsonb) is
  'Shape check for evidence_observations.masking: a bounded disclosure of the '
  'excluded and retained scene classes and the applied rules. Returns false '
  'for malformed input rather than raising.';

-- True when `value` is a bounded list of short caveat strings: at most 64
-- entries, each at most 2000 characters, and no NULL entries. Used from a
-- CHECK constraint, so it is a function rather than a subquery.
--
-- A NULL element is refused explicitly. `length(NULL)` is NULL, and a NULL
-- comparison is not true, so an array holding a NULL would otherwise slip
-- through the length test and store a caveat that reads as "unknown" but
-- carries no text. A caveat is either a sentence or it is absent; a NULL is
-- neither, and it would also make the column's meaning ambiguous to a
-- reader.
create or replace function public.is_bounded_caveats(value text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select value is not null
     and cardinality(value) <= 64
     and not exists (
       select 1
       from unnest(value) as entry
       where entry is null or length(entry) > 2000
     )
$$;

comment on function public.is_bounded_caveats(text[]) is
  'Shape check for evidence_observations.caveats: a bounded list of short '
  'strings.';

-- True when `value` is an audit detail: an object whose keys are the
-- optional pairs 'before' and 'after', each of which is an object of scalar
-- values. The shape is fixed rather than free-form, so an audit row cannot
-- carry an unbounded or deeply nested payload of its own.
--
-- The nested scan is GUARDED. `jsonb_each` raises "cannot call jsonb_each on
-- a non-object" when it is handed a scalar, so the inner scan must never be
-- able to receive one: a malformed detail such as {"before": 3} would
-- otherwise turn a rejected value into a failed statement. The guard passes
-- the entry through only when it really is an object and substitutes an empty
-- object otherwise, so the inner call is safe for every possible input
-- regardless of the order in which the planner evaluates the branches. The
-- substitution cannot hide a bad value, because the first branch rejects any
-- entry that is not an object outright.
create or replace function public.is_audit_detail(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when value is null then false
    when jsonb_typeof(value) <> 'object' then false
    when (value - 'before' - 'after') <> '{}'::jsonb then false
    when octet_length(value::text) > 65536 then false
    else not exists (
      select 1
      from jsonb_each(value) as entry
      where jsonb_typeof(entry.value) <> 'object'
    )
    and not exists (
      -- A LATERAL join, not a correlated subquery: the inner scan has to see
      -- the outer row's value, and a plain correlated reference to the
      -- composite's column is not resolvable here.
      --
      -- The CASE guard is what keeps `jsonb_each` away from a scalar. It is
      -- inside the argument, so it is necessarily evaluated before the call
      -- — unlike an AND whose branches the planner may reorder.
      select 1
      from jsonb_each(value) as entry
      cross join lateral jsonb_each(
        case
          when jsonb_typeof(entry.value) = 'object' then entry.value
          else '{}'::jsonb
        end
      ) as leaf
      where jsonb_typeof(leaf.value) not in ('string', 'number', 'boolean', 'null')
    )
  end;
$$;

comment on function public.is_audit_detail(jsonb) is
  'Shape check for audit_events.detail: an object of optional before/after '
  'objects, each holding only scalar values.';

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

-- The tenant root. One row per farm. It carries no location, no boundary and
-- no coordinates: those are private and are not part of this slice.
create table public.farms (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  created_by  uuid        references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint farms_name_not_blank check (length(btrim(name)) between 1 and 200)
);

comment on table public.farms is
  'Tenant root: one row per farm. Holds no location or geometry by design.';

comment on column public.farms.created_by is
  'Auth user that created the farm. Null if that account was later deleted.';

-- Membership join. This table is the ONLY place farm access is decided.
create table public.farm_members (
  farm_id    uuid        not null references public.farms (id) on delete cascade,
  user_id    uuid        not null references auth.users (id) on delete cascade,
  role       text        not null,
  created_at timestamptz not null default now(),
  primary key (farm_id, user_id),
  constraint farm_members_role_known check (role in ('owner', 'manager', 'viewer'))
);

comment on table public.farm_members is
  'Farm membership and role. The single source of truth for farm access.';
comment on column public.farm_members.role is
  'owner: full control and membership changes; manager: manage areas and '
  'evidence; viewer: read only.';

-- The managed blocks of a farm. Deliberately geometry-free in this slice.
create table public.areas (
  id         uuid        primary key default gen_random_uuid(),
  farm_id    uuid        not null references public.farms (id) on delete cascade,
  name       text        not null,
  kind       text        not null,
  created_by uuid        references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint areas_name_not_blank check (length(btrim(name)) between 1 and 200),
  constraint areas_kind_known check (kind in ('estate', 'block', 'sample_aoi')),
  constraint areas_name_unique_per_farm unique (farm_id, name),
  -- Referenced by the composite foreign key from evidence_observations, so the
  -- pair (farm, area) is unique and addressable.
  constraint areas_farm_id_id_key unique (farm_id, id)
);

comment on table public.areas is
  'Managed blocks of a farm. No geometry column: exact farm coordinates are '
  'not stored in this slice.';
comment on column public.areas.kind is
  'estate or block: the farm''s own land. sample_aoi: one of the two fixed '
  'public reference rectangles (Khanewal, Okara), which are development '
  'areas and not a surveyed farm.';

-- The evidence record. Typed columns for every measured quantity; the
-- remaining provider detail is bounded jsonb with shape checks, never an
-- unrestricted blob.
create table public.evidence_observations (
  id                    uuid        primary key default gen_random_uuid(),
  farm_id               uuid        not null references public.farms (id) on delete cascade,
  area_id               uuid        not null,
  evidence_type         text        not null,
  source                text        not null,
  source_ref            text        not null,
  platform              text,
  acquired_at           timestamptz not null,
  retrieved_at          timestamptz not null,
  spatial_resolution_m  numeric(10, 2) not null,
  temporal_resolution   text        not null,
  units                 text        not null,
  quality_status        text        not null,
  ndvi_min              numeric(6, 5),
  ndvi_max              numeric(6, 5),
  ndvi_mean             numeric(6, 5),
  ndvi_stddev           numeric(6, 5),
  ndvi_p10              numeric(6, 5),
  ndvi_p50              numeric(6, 5),
  ndvi_p90              numeric(6, 5),
  sample_count          bigint      not null,
  no_data_count         bigint      not null,
  valid_pixel_pct       numeric(5, 2) not null,
  tile_cloud_cover_pct  numeric(5, 2),
  histogram             jsonb       not null default '[]'::jsonb,
  histogram_underflow   bigint      not null default 0,
  histogram_overflow    bigint      not null default 0,
  masking               jsonb       not null default '{"excluded":[],"retained":[],"rules":[]}'::jsonb,
  caveats               text[]      not null default '{}'::text[],
  attribution           text        not null,
  supersedes_id         uuid,
  created_by            uuid        references auth.users (id) on delete set null,
  created_at            timestamptz not null default now(),

  -- Tenant integrity, enforced by the database rather than by a policy.
  --
  -- The composite key (farm_id, area_id) is what makes an evidence row
  -- provably belong to the farm it claims: a row cannot point at another
  -- farm's area even if the caller knows that area's UUID, because no
  -- (farm, area) pair exists for it.
  --
  -- ON DELETE NO ACTION, DEFERRABLE, INITIALLY DEFERRED: deleting an area
  -- that still has evidence is refused, but deleting the farm itself (which
  -- cascades to both the areas and the evidence) is allowed, because the
  -- check then runs at the end of the statement, when nothing dangles. A
  -- plain ON DELETE RESTRICT would refuse the farm delete as well.
  constraint evidence_observations_area_fk
    foreign key (farm_id, area_id)
    references public.areas (farm_id, id)
    on delete no action deferrable initially deferred,

  -- The same rule for corrections: a correction may only supersede
  -- evidence in its own farm.
  constraint evidence_observations_supersedes_fk
    foreign key (farm_id, supersedes_id)
    references public.evidence_observations (farm_id, id)
    on delete no action deferrable initially deferred,

  -- A row cannot supersede itself.
  constraint evidence_observations_not_self
    check (supersedes_id is null or supersedes_id <> id),

  -- Referenced by the composite foreign key above.
  constraint evidence_observations_farm_id_id_key unique (farm_id, id),

  constraint evidence_type_known check (evidence_type in ('sentinel2_ndvi')),
  constraint evidence_source_known check (source in ('planetary-computer', 'cdse')),
  constraint evidence_source_ref_bounded check (length(btrim(source_ref)) between 1 and 200),
  constraint evidence_platform_bounded check (platform is null or length(btrim(platform)) between 1 and 64),
  constraint evidence_spatial_resolution_positive check (spatial_resolution_m > 0),
  constraint evidence_temporal_resolution_known
    check (temporal_resolution in ('single_acquisition')),
  constraint evidence_units_known check (units in ('ndvi')),
  -- The writer states how good the observation is. The three values are the
  -- ones the Sentinel product can distinguish: every statistic present,
  -- some statistics missing, or statistics present but materially caveated.
  constraint evidence_quality_status_known
    check (quality_status in ('ok', 'partial', 'degraded')),
  constraint evidence_ndvi_in_range check (
    (ndvi_min   is null or ndvi_min   between -1 and 1) and
    (ndvi_max   is null or ndvi_max   between -1 and 1) and
    (ndvi_mean  is null or ndvi_mean  between -1 and 1) and
    (ndvi_stddev is null or ndvi_stddev between 0 and 1) and
    (ndvi_p10   is null or ndvi_p10   between -1 and 1) and
    (ndvi_p50   is null or ndvi_p50   between -1 and 1) and
    (ndvi_p90   is null or ndvi_p90   between -1 and 1)
  ),
  constraint evidence_ndvi_bounds_ordered check (
    ndvi_min is null or ndvi_max is null or ndvi_min <= ndvi_max
  ),
  constraint evidence_sample_counts check (
    sample_count >= 0 and no_data_count >= 0 and no_data_count <= sample_count
  ),
  constraint evidence_valid_pixel_pct_range check (valid_pixel_pct between 0 and 100),
  constraint evidence_cloud_cover_range check (
    tile_cloud_cover_pct is null or tile_cloud_cover_pct between 0 and 100
  ),
  constraint evidence_histogram_shape check (public.is_ndvi_histogram(histogram)),
  constraint evidence_histogram_counts check (
    histogram_underflow >= 0 and histogram_overflow >= 0
  ),
  constraint evidence_masking_shape check (public.is_masking_disclosure(masking)),
  constraint evidence_caveats_bounded check (public.is_bounded_caveats(caveats)),
  constraint evidence_attribution_bounded check (length(btrim(attribution)) between 1 and 2000)
);

comment on table public.evidence_observations is
  'Sourced Sentinel-2 NDVI summaries. Every measured quantity is a typed '
  'column; jsonb is limited to the provider histogram and masking disclosure.';
comment on column public.evidence_observations.acquired_at is
  'Provider acquisition time: the instant the observation is valid.';
comment on column public.evidence_observations.retrieved_at is
  'Server clock when the provider answered, not when it acquired the data.';
comment on column public.evidence_observations.source_ref is
  'Provider product identifier, so the observation can be re-derived.';
comment on column public.evidence_observations.quality_status is
  'The writer''s assessment of the observation: ok (every statistic '
  'present), partial (some statistics missing) or degraded (statistics '
  'present but materially caveated).';
comment on column public.evidence_observations.supersedes_id is
  'Set when this row corrects an earlier one. Corrections are new rows; '
  'written rows are never updated in place.';

-- The audit trail. Append-only by the database: application roles can read
-- it and cannot write, change, or remove a row in it.
--
-- `farm_id` is deliberately not a foreign key, so the trail survives the
-- deletion of the farm it describes. Rows orphaned that way are unreadable
-- by any member, because access is scoped by farm membership.
create table public.audit_events (
  id             bigint      generated always as identity primary key,
  farm_id        uuid        not null,
  actor_user_id  uuid        references auth.users (id) on delete set null,
  action         text        not null,
  entity_type    text        not null,
  entity_id      uuid,
  detail         jsonb       not null default '{}'::jsonb,
  occurred_at    timestamptz not null default now(),
  constraint audit_events_action_bounded check (length(btrim(action)) between 1 and 64),
  constraint audit_events_entity_type_known check (
    entity_type in ('farm', 'farm_member', 'area', 'evidence_observation')
  ),
  constraint audit_events_detail_shape check (public.is_audit_detail(detail))
);

comment on table public.audit_events is
  'Audit trail. Written by database triggers only; no application role may '
  'insert, update or delete a row here.';
comment on column public.audit_events.farm_id is
  'Deliberately not a foreign key, so the trail survives deletion of the '
  'farm it describes. Rows orphaned that way are unreadable by any member.';
comment on column public.audit_events.actor_user_id is
  'The user who made the change. Null after that account is deleted, or for '
  'a change made by the database itself with no signed-in user.';

-- ---------------------------------------------------------------------------
-- 3. Authorisation helper
-- ---------------------------------------------------------------------------

-- The role the current request's user holds on `p_farm_id`, or null when the
-- user is not a member.
--
-- SECURITY DEFINER is required, and is the reason the policies below do not
-- recurse: the function reads farm_members as its owner (the role that owns
-- the tables), so the farm_members policies are not re-evaluated while this
-- function runs. Without it, a farm_members policy that asks "is the caller a
-- member?" would ask farm_members again and PostgreSQL would reject the
-- policy with "infinite recursion detected in policy".
--
-- `set search_path = ''` pins every name to its schema, so nothing on the
-- search path can be substituted for `auth.uid()` or `public.farm_members`.
--
-- The function only ever reports the CALLER's own role, so it cannot be used
-- to discover another member's role.
create or replace function public.farm_role(p_farm_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.farm_members m
  where m.farm_id = p_farm_id
    and m.user_id = auth.uid()
$$;

comment on function public.farm_role(uuid) is
  'Role of the calling user on a farm, or null. SECURITY DEFINER to avoid '
  'recursive RLS evaluation on farm_members.';

-- ---------------------------------------------------------------------------
-- 4. Triggers
-- ---------------------------------------------------------------------------

-- The creator of a farm becomes its first owner. SECURITY DEFINER so the
-- insert succeeds before any membership exists for the caller.
create or replace function public.grant_farm_owner_to_creator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A farm row with no creator (the creator's account was deleted) grants
  -- no membership; an owner is then added explicitly.
  if new.created_by is null then
    return new;
  end if;

  insert into public.farm_members (farm_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (farm_id, user_id) do nothing;
  return new;
end;
$$;

create trigger farms_grant_owner
  after insert on public.farms
  for each row execute function public.grant_farm_owner_to_creator();

-- A farm must always keep at least one owner.
--
-- This also decides what happens when the last owner's auth account is
-- deleted: the cascade from auth.users to farm_members removes the
-- membership row, this trigger refuses, and the account deletion is rolled
-- back. The owner must transfer ownership to another member first. That is
-- deliberate: a farm with no owner could never be administered again.
create or replace function public.guard_last_farm_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining integer;
begin
  -- When the farm itself is being deleted the cascade removes this row too;
  -- there is no owner left to protect.
  if not exists (select 1 from public.farms where id = old.farm_id) then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    -- The row is leaving the farm it was an owner of.
    if old.role <> 'owner' then
      return old;
    end if;
  else
    -- The row stays an owner of the same farm: nothing is lost.
    if old.role <> 'owner'
       or (new.farm_id = old.farm_id and new.role = 'owner') then
      return new;
    end if;
    -- Otherwise this row is leaving, or being demoted, on the farm it was an
    -- owner of.
  end if;

  select count(*) into remaining
  from public.farm_members m
  where m.farm_id = old.farm_id
    and m.role = 'owner'
    and m.user_id <> old.user_id;

  if remaining = 0 then
    raise exception
      'farm % must keep at least one owner: transfer ownership before removing this member or deleting that account',
      old.farm_id
      using errcode = 'check_violation';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger farm_members_guard_last_owner
  before update or delete on public.farm_members
  for each row execute function public.guard_last_farm_owner();

-- Append to the audit trail. SECURITY DEFINER so the insert is not itself
-- filtered by the audit_events policies, which grant no insert rights.
--
-- The trail records what changed, in both directions: for an update it
-- stores the values before and after, so a changed role or a changed
-- provenance field is visible without needing the old row.
create or replace function public.write_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_row jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  new_row jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  row_data jsonb := coalesce(new_row, old_row);
  farm uuid;
  entity uuid;
  entity_kind text;
  before_detail jsonb;
  after_detail jsonb;
begin
  entity_kind := case tg_table_name
    when 'farms' then 'farm'
    when 'farm_members' then 'farm_member'
    when 'areas' then 'area'
    when 'evidence_observations' then 'evidence_observation'
  end;
  if entity_kind is null then
    raise exception 'write_audit_event: unexpected table %', tg_table_name;
  end if;

  if tg_table_name = 'farms' then
    farm := (row_data ->> 'id')::uuid;
  else
    farm := (row_data ->> 'farm_id')::uuid;
  end if;

  -- A membership row has no surrogate key of its own; the member it names
  -- is its identity within the farm.
  if tg_table_name = 'farm_members' then
    entity := (row_data ->> 'user_id')::uuid;
  else
    entity := (row_data ->> 'id')::uuid;
  end if;

  before_detail := case tg_table_name
    when 'farms' then jsonb_build_object('name', old_row -> 'name', 'created_by', old_row -> 'created_by')
    when 'farm_members' then jsonb_build_object('farm_id', old_row -> 'farm_id', 'user_id', old_row -> 'user_id', 'role', old_row -> 'role')
    when 'areas' then jsonb_build_object('farm_id', old_row -> 'farm_id', 'name', old_row -> 'name', 'kind', old_row -> 'kind')
    else jsonb_build_object(
      'farm_id', old_row -> 'farm_id',
      'area_id', old_row -> 'area_id',
      'source', old_row -> 'source',
      'source_ref', old_row -> 'source_ref',
      'acquired_at', old_row -> 'acquired_at',
      'quality_status', old_row -> 'quality_status'
    )
  end;

  after_detail := case tg_table_name
    when 'farms' then jsonb_build_object('name', new_row -> 'name', 'created_by', new_row -> 'created_by')
    when 'farm_members' then jsonb_build_object('farm_id', new_row -> 'farm_id', 'user_id', new_row -> 'user_id', 'role', new_row -> 'role')
    when 'areas' then jsonb_build_object('farm_id', new_row -> 'farm_id', 'name', new_row -> 'name', 'kind', new_row -> 'kind')
    else jsonb_build_object(
      'farm_id', new_row -> 'farm_id',
      'area_id', new_row -> 'area_id',
      'source', new_row -> 'source',
      'source_ref', new_row -> 'source_ref',
      'acquired_at', new_row -> 'acquired_at',
      'quality_status', new_row -> 'quality_status'
    )
  end;

  insert into public.audit_events (
    farm_id, actor_user_id, action, entity_type, entity_id, detail
  )
  values (
    farm,
    auth.uid(),
    case tg_op
      when 'INSERT' then 'inserted'
      when 'UPDATE' then 'updated'
      else 'deleted'
    end,
    entity_kind,
    entity,
    case when tg_op = 'UPDATE'
      then jsonb_build_object('before', before_detail, 'after', after_detail)
      when tg_op = 'DELETE'
      then jsonb_build_object('before', before_detail)
      else jsonb_build_object('after', after_detail)
    end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger farms_audit
  after insert or update or delete on public.farms
  for each row execute function public.write_audit_event();

create trigger farm_members_audit
  after insert or update or delete on public.farm_members
  for each row execute function public.write_audit_event();

create trigger areas_audit
  after insert or update or delete on public.areas
  for each row execute function public.write_audit_event();

create trigger evidence_observations_audit
  after insert or update or delete on public.evidence_observations
  for each row execute function public.write_audit_event();

-- ---------------------------------------------------------------------------
-- 5. Row Level Security
-- ---------------------------------------------------------------------------

alter table public.farms enable row level security;

alter table public.farm_members enable row level security;

alter table public.areas enable row level security;

alter table public.evidence_observations enable row level security;

alter table public.audit_events enable row level security;

-- farms ---------------------------------------------------------------------
-- Read: any member of that farm.
create policy farms_select_member on public.farms
  for select to authenticated
  using (public.farm_role(id) is not null);

-- Create: a signed-in user may create a farm they own. Membership is granted
-- by the farms_grant_owner trigger, so the creator is its owner.
create policy farms_insert_own on public.farms
  for insert to authenticated
  with check (created_by = auth.uid());

-- Update: owner only.
create policy farms_update_owner on public.farms
  for update to authenticated
  using (public.farm_role(id) = 'owner')
  with check (public.farm_role(id) = 'owner');

-- No delete policy: a farm is removed by an administrator, never by the app.

-- farm_members --------------------------------------------------------------
create policy farm_members_select_member on public.farm_members
  for select to authenticated
  using (public.farm_role(farm_id) is not null);

create policy farm_members_insert_owner on public.farm_members
  for insert to authenticated
  with check (public.farm_role(farm_id) = 'owner');

create policy farm_members_update_owner on public.farm_members
  for update to authenticated
  using (public.farm_role(farm_id) = 'owner')
  with check (public.farm_role(farm_id) = 'owner');

create policy farm_members_delete_owner on public.farm_members
  for delete to authenticated
  using (public.farm_role(farm_id) = 'owner');

-- areas ---------------------------------------------------------------------
create policy areas_select_member on public.areas
  for select to authenticated
  using (public.farm_role(farm_id) is not null);

create policy areas_insert_manager on public.areas
  for insert to authenticated
  with check (public.farm_role(farm_id) in ('owner', 'manager'));

create policy areas_update_manager on public.areas
  for update to authenticated
  using (public.farm_role(farm_id) in ('owner', 'manager'))
  with check (public.farm_role(farm_id) in ('owner', 'manager'));

create policy areas_delete_manager on public.areas
  for delete to authenticated
  using (public.farm_role(farm_id) in ('owner', 'manager'));

-- evidence_observations -----------------------------------------------------
create policy evidence_observations_select_member on public.evidence_observations
  for select to authenticated
  using (public.farm_role(farm_id) is not null);

-- Write: owner or manager of the farm the row belongs to, and the row must
-- record the caller as its author. Which area the row may name is settled by
-- the composite foreign key, not by this policy.
create policy evidence_observations_insert_manager on public.evidence_observations
  for insert to authenticated
  with check (
    public.farm_role(farm_id) in ('owner', 'manager')
    and created_by = auth.uid()
  );

-- No update policy and no delete policy: written evidence is immutable
-- through normal application access. A correction is a new row that points
-- at the row it replaces.

-- audit_events --------------------------------------------------------------
create policy audit_events_select_member on public.audit_events
  for select to authenticated
  using (public.farm_role(farm_id) is not null);

-- No insert, update or delete policy. The audit trail is written by the
-- database triggers only, so an application cannot forge or rewrite history.

-- ---------------------------------------------------------------------------
-- 6. Grants: least privilege at the table level as well as the row level.
-- ---------------------------------------------------------------------------

-- The roles need to be able to reach the schema at all before any table
-- privilege can apply. USAGE on a schema grants no access to the objects in
-- it; the table privileges below are what actually decide what each role
-- may do. This is stated explicitly rather than left to the platform's
-- default, so the migration behaves the same wherever it is applied.
grant usage on schema public to anon, authenticated, service_role;

revoke all on table public.farms,
                public.farm_members,
                public.areas,
                public.evidence_observations,
                public.audit_events
  from anon, authenticated;

grant select, insert, update         on table public.farms to authenticated;

grant select, insert, update, delete on table public.farm_members to authenticated;

grant select, insert, update, delete on table public.areas to authenticated;

grant select, insert                 on table public.evidence_observations to authenticated;

grant select                         on table public.audit_events to authenticated;

-- The shape-checking functions are called from CHECK constraints, so the
-- roles that write the tables need to execute them. They are not granted to
-- PUBLIC: nothing outside the writing roles can use them.
revoke all on function public.is_ndvi_histogram(jsonb) from public;
revoke all on function public.is_masking_disclosure(jsonb) from public;
revoke all on function public.is_bounded_caveats(text[]) from public;
revoke all on function public.is_audit_detail(jsonb) from public;
grant execute on function public.is_ndvi_histogram(jsonb) to authenticated, service_role;
grant execute on function public.is_masking_disclosure(jsonb) to authenticated, service_role;
grant execute on function public.is_bounded_caveats(text[]) to authenticated, service_role;
grant execute on function public.is_audit_detail(jsonb) to authenticated, service_role;

-- The trigger functions are invoked by the database, not by a caller, so no
-- application role needs to execute them.
revoke all on function public.grant_farm_owner_to_creator() from public;
revoke all on function public.guard_last_farm_owner() from public;
revoke all on function public.write_audit_event() from public;

-- The authorisation helper is used by the policies, so the roles that the
-- policies apply to need to execute it.
revoke all on function public.farm_role(uuid) from public;
grant execute on function public.farm_role(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Indexes
-- ---------------------------------------------------------------------------

create index farm_members_user_id_idx on public.farm_members (user_id);

create index areas_farm_id_idx         on public.areas (farm_id);

create index evidence_farm_area_time_idx
  on public.evidence_observations (farm_id, area_id, acquired_at desc);

create index audit_events_farm_time_idx
  on public.audit_events (farm_id, occurred_at desc);

-- Idempotence: re-running the same observation for the same block and the
-- same provider product is refused. Corrections carry a supersedes_id and so
-- are outside this index.
create unique index evidence_observations_head_key
  on public.evidence_observations (farm_id, area_id, source, source_ref, acquired_at)
  where supersedes_id is null;

-- Each row may be corrected at most once, so corrections form a chain rather
-- than a fan of competing answers.
create unique index evidence_observations_one_correction
  on public.evidence_observations (supersedes_id)
  where supersedes_id is not null;
