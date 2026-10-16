-- Community operator-import: 전문(full) 게시를 기본 정책으로 (Owner 결정 2026-10-16).
-- Sources registered from now on default to full; existing sources still on the old default
-- (summary_link) move to full. link_only sources keep their explicit choice.
-- Already-published posts are not touched (policy only applies at the next publish/update).

alter table public.community_operator_import_sources
  alter column content_policy set default 'full';

update public.community_operator_import_sources
set content_policy = 'full', updated_at = now()
where content_policy = 'summary_link';

comment on column public.community_operator_import_sources.content_policy is
  'Default publish policy for the source: full (본문·이미지 전체, default) · summary_link · link_only. An operator per-article / bulk choice overrides it.';
