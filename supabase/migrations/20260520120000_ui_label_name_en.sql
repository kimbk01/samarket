-- UI 표시명 영문 (게시글 본문 아님) — 내정보 언어 en 시 탭·메뉴용

alter table public.community_topics
  add column if not exists name_en text;

alter table public.store_categories
  add column if not exists name_en text;

alter table public.store_topics
  add column if not exists name_en text;
