-- DIBAY Intro (launch intro) — FIRST VERTICAL SLICE authority.
-- Contract: DIBAY Intro 최종 아키텍처 계약 (Draft / immutable Publication / single Live pointer).
--   DRAFT        launch_intro_drafts        mutable, version (optimistic concurrency)
--   PUBLICATION  launch_intro_publications  immutable (no UPDATE / DELETE), audit history
--   LIVE         launch_intro_live          single row 'default': ACTIVE(A) | PAUSED(A) | UNPUBLISHED(null)
-- Names intentionally avoid historical intro_* / app_intro_* / dibay_intro_* / r15_* objects.
-- Service role only (RLS on, anon/authenticated revoked). Apps read Live via /api/launch-intro/live.

create table if not exists public.launch_intro_drafts (
  id uuid primary key default gen_random_uuid(),
  document jsonb not null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid null,
  constraint launch_intro_drafts_document_object check (jsonb_typeof(document) = 'object')
);

create table if not exists public.launch_intro_publications (
  id uuid primary key default gen_random_uuid(),
  source_draft_id uuid null,
  source_draft_version integer null,
  document jsonb not null,
  assets jsonb not null default '[]'::jsonb,
  eligibility jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid null,
  constraint launch_intro_publications_document_object check (jsonb_typeof(document) = 'object'),
  constraint launch_intro_publications_assets_array check (jsonb_typeof(assets) = 'array'),
  constraint launch_intro_publications_eligibility_object check (jsonb_typeof(eligibility) = 'object')
);

create unique index if not exists launch_intro_publications_source_uidx
  on public.launch_intro_publications (source_draft_id, source_draft_version)
  where source_draft_id is not null;

create or replace function public.launch_intro_publications_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'launch_intro_publications is immutable (%)', tg_op;
end;
$$;

drop trigger if exists launch_intro_publications_no_update on public.launch_intro_publications;
create trigger launch_intro_publications_no_update
  before update or delete on public.launch_intro_publications
  for each row execute function public.launch_intro_publications_immutable();

create table if not exists public.launch_intro_live (
  id text primary key default 'default' check (id = 'default'),
  publication_id uuid null references public.launch_intro_publications (id) on delete restrict,
  state text not null default 'unpublished',
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid null,
  constraint launch_intro_live_state_check check (state in ('active', 'paused', 'unpublished')),
  constraint launch_intro_live_state_shape check ((state = 'unpublished') = (publication_id is null))
);

insert into public.launch_intro_live (id, publication_id, state, revision)
values ('default', null, 'unpublished', 0)
on conflict (id) do nothing;

alter table public.launch_intro_drafts enable row level security;
alter table public.launch_intro_publications enable row level security;
alter table public.launch_intro_live enable row level security;
revoke all on public.launch_intro_drafts from anon, authenticated;
revoke all on public.launch_intro_publications from anon, authenticated;
revoke all on public.launch_intro_live from anon, authenticated;

-- PUBLISH: one transaction — immutable publication (idempotent per draft version) + Live pointer.
create or replace function public.launch_intro_publish(
  p_draft_id uuid,
  p_draft_version integer,
  p_document jsonb,
  p_assets jsonb,
  p_eligibility jsonb,
  p_actor uuid
)
returns table (publication_id uuid, revision bigint, state text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_pub uuid;
begin
  select p.id into v_pub
    from public.launch_intro_publications p
   where p.source_draft_id = p_draft_id and p.source_draft_version = p_draft_version;
  if v_pub is null then
    insert into public.launch_intro_publications
      (source_draft_id, source_draft_version, document, assets, eligibility, created_by)
    values (p_draft_id, p_draft_version, p_document, p_assets, p_eligibility, p_actor)
    returning id into v_pub;
  end if;

  return query
  update public.launch_intro_live l
     set publication_id = v_pub,
         state = 'active',
         revision = l.revision + 1,
         updated_at = now(),
         updated_by = p_actor
   where l.id = 'default'
  returning l.publication_id, l.revision, l.state;
end;
$$;

-- LIVE STATE MACHINE: ACTIVE(A) <-> PAUSED(A); ACTIVE/PAUSED -> UNPUBLISHED(null);
-- UNPUBLISHED -X-> resume; reactivate(X) from history -> ACTIVE(X).
create or replace function public.launch_intro_set_state(
  p_action text,
  p_publication_id uuid,
  p_actor uuid
)
returns table (publication_id uuid, revision bigint, state text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_live public.launch_intro_live%rowtype;
begin
  select * into v_live from public.launch_intro_live where id = 'default' for update;

  if p_action = 'pause' then
    if v_live.state <> 'active' then raise exception 'launch_intro_transition_rejected'; end if;
    update public.launch_intro_live set state = 'paused', revision = revision + 1,
      updated_at = now(), updated_by = p_actor where id = 'default';
  elsif p_action = 'resume' then
    if v_live.state <> 'paused' then raise exception 'launch_intro_transition_rejected'; end if;
    update public.launch_intro_live set state = 'active', revision = revision + 1,
      updated_at = now(), updated_by = p_actor where id = 'default';
  elsif p_action = 'unpublish' then
    if v_live.state = 'unpublished' then raise exception 'launch_intro_transition_rejected'; end if;
    update public.launch_intro_live set state = 'unpublished', publication_id = null,
      revision = revision + 1, updated_at = now(), updated_by = p_actor where id = 'default';
  elsif p_action = 'reactivate' then
    if p_publication_id is null
       or not exists (select 1 from public.launch_intro_publications where id = p_publication_id) then
      raise exception 'launch_intro_publication_not_found';
    end if;
    update public.launch_intro_live set state = 'active', publication_id = p_publication_id,
      revision = revision + 1, updated_at = now(), updated_by = p_actor where id = 'default';
  else
    raise exception 'launch_intro_unknown_action';
  end if;

  return query select l.publication_id, l.revision, l.state
    from public.launch_intro_live l where l.id = 'default';
end;
$$;

revoke all on function public.launch_intro_publish(uuid, integer, jsonb, jsonb, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.launch_intro_set_state(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.launch_intro_publish(uuid, integer, jsonb, jsonb, jsonb, uuid) to service_role;
grant execute on function public.launch_intro_set_state(text, uuid, uuid) to service_role;

-- Storage: draft uploads (private) and published, content-addressed, immutable assets (public).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('launch-intro-drafts', 'launch-intro-drafts', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('launch-intro-assets', 'launch-intro-assets', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
