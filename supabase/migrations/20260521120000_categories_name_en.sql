-- 거래 홈 상단 칩·2행 주제 — UI 표시명 영문 (게시글 본문 아님)

alter table public.categories
  add column if not exists name_en text;
