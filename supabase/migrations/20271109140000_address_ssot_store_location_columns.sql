-- 주소 SSOT 3단계 (Owner 2026-11-09 「진행」) — 매장에 회원 주소와 같은 위치 칸.
-- 추가 칸만(nullable). 기존 행·값은 바꾸지 않는다(지난 데이터 채우기 없음 — 매장은 다음 위치 저장 때 채워짐).
--   stores.barangay          바랑가이 (② 배달 지역 「Diliman, Quezon City」의 앞부분)
--   stores.canonical_lgu_id  시/군 PSGC (회원 user_addresses.canonical_lgu_id 와 같은 기준)
-- 주문(store_orders) 위치 칸은 주문 생성 함수(create_store_order_atomic) 변경이 필요해 이 파일에 넣지 않는다.

alter table public.stores
  add column if not exists barangay text,
  add column if not exists canonical_lgu_id text;

comment on column public.stores.barangay is '주소 SSOT: 매장 바랑가이 (서버가 위치 저장 시 결정)';
comment on column public.stores.canonical_lgu_id is '주소 SSOT: 매장 시/군 PSGC (user_addresses.canonical_lgu_id 와 같은 기준)';
