-- 커뮤니티 메신저 친구 숨김 상태를 user_relationships 에 저장할 수 있도록 확장
-- 기존 레거시 컬럼(type) 과 스펙 컬럼(relation_type) 을 함께 유지한다.

alter table public.user_relationships
  add column if not exists relation_type text;

update public.user_relationships
set relation_type = type
where relation_type is null;

alter table public.user_relationships
  alter column relation_type set not null;

alter table public.user_relationships
  drop constraint if exists user_relationships_type_check;

alter table public.user_relationships
  add constraint user_relationships_type_check
  check (type in ('neighbor_follow', 'blocked', 'hidden'));

alter table public.user_relationships
  drop constraint if exists user_relationships_relation_type_check;

alter table public.user_relationships
  add constraint user_relationships_relation_type_check
  check (relation_type in ('neighbor_follow', 'blocked', 'hidden'));
