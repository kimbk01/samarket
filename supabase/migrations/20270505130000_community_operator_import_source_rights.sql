-- Community operator-import: republication rights per source (Owner directive 2026-10-16).
-- Being publicly visible is not a right to republish. Full body + images need recorded rights;
-- every source without them stays summary + link. Additive only: existing rows become
-- 'unverified' (= today's behaviour, all 25 sources are summary_link) and no policy changes here.

alter table public.community_operator_import_sources
  add column if not exists rights_basis text not null default 'unverified',
  add column if not exists attribution_required boolean not null default true,
  add column if not exists rights_note text null,
  add column if not exists rights_confirmed_by uuid null,
  add column if not exists rights_confirmed_at timestamptz null;

alter table public.community_operator_import_sources
  drop constraint if exists community_operator_import_sources_rights_basis_check;
alter table public.community_operator_import_sources
  add constraint community_operator_import_sources_rights_basis_check
  check (rights_basis in ('unverified', 'permission', 'public_domain', 'cc_by', 'cc_by_sa', 'own'));

-- CC licences always carry the attribution duty; recorded rights need a written basis.
alter table public.community_operator_import_sources
  drop constraint if exists community_operator_import_sources_rights_attribution_check;
alter table public.community_operator_import_sources
  add constraint community_operator_import_sources_rights_attribution_check
  check (rights_basis not in ('unverified', 'cc_by', 'cc_by_sa') or attribution_required);

alter table public.community_operator_import_sources
  drop constraint if exists community_operator_import_sources_rights_note_check;
alter table public.community_operator_import_sources
  add constraint community_operator_import_sources_rights_note_check
  check (rights_basis = 'unverified' or coalesce(btrim(rights_note), '') <> '');

-- full needs recorded rights (existing rows: all summary_link/link_only → constraint holds).
alter table public.community_operator_import_sources
  drop constraint if exists community_operator_import_sources_full_needs_rights_check;
alter table public.community_operator_import_sources
  add constraint community_operator_import_sources_full_needs_rights_check
  check (content_policy <> 'full' or rights_basis <> 'unverified');

comment on column public.community_operator_import_sources.rights_basis is
  'Republication rights: unverified (summary + link only) · permission · public_domain · cc_by · cc_by_sa · own.';
comment on column public.community_operator_import_sources.attribution_required is
  'Public 출처 block may be hidden only when false (never for unverified / CC sources).';
