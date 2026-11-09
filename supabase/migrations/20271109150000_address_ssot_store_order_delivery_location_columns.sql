-- 주소 SSOT 마무리 (Owner 2026-11-09 「남은 부분은 정리 해라」) — 주문 기록에 배달지 위치 칸.
-- 추가 칸만(nullable). 기존 주문 값은 바꾸지 않는다.
-- 주문 생성 함수(create_store_order_atomic)는 바꾸지 않는다 — 주문이 생성된 뒤 API 가 같은 행에 위치 칸만 기록한다.
-- (store_orders UPDATE 트리거 중 수수료·선물 매출·완료 시각은 `UPDATE OF order_status` 에만 동작 — 위치 칸 기록과 무관, 2026-11-09 확인)

alter table public.store_orders
  add column if not exists delivery_barangay text,
  add column if not exists delivery_city_name text,
  add column if not exists delivery_lgu_id text;

comment on column public.store_orders.delivery_barangay is '주소 SSOT: 주문 시점 배달지 바랑가이 (대표 주소에서 복사)';
comment on column public.store_orders.delivery_city_name is '주소 SSOT: 주문 시점 배달지 시/군 이름 (① 공개 지역과 같은 이름)';
comment on column public.store_orders.delivery_lgu_id is '주소 SSOT: 주문 시점 배달지 시/군 PSGC (user_addresses.canonical_lgu_id)';
