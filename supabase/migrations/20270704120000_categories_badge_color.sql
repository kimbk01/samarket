-- P-6 (2026-10-27, Owner 승인 v3): 거래 주제 배지 색 — 카테고리 설정값 1개(아이콘 없음).
-- 값이 없으면 앱이 기본 중립색을 쓴다. 새 주제가 늘어도 코드 변경 없이 어드민에서 색만 지정한다.
alter table public.categories
  add column if not exists badge_color text
  constraint categories_badge_color_hex check (badge_color is null or badge_color ~ '^#[0-9A-Fa-f]{6}$');

comment on column public.categories.badge_color is
  '거래 주제 배지 색(#RRGGBB). null = 기본 중립색. 아이콘은 쓰지 않는다(P-6).';
