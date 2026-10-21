# 문서 J — 5단계 전 구간 회귀 검증 결과 (2026-10-21 PHT)

설계: [문서 G-2 §5](G-2-stage3-5-design.md). 기준 커밋: main `dad8fa16`(1~4단계 반영) + 5단계 테스트·문서. 운영 코드 변경 0.

## 층별 결과

| 층 | 결과 | 근거 |
|---|---|---|
| L1 (vitest·RTL, Supabase mock) | **로컬 PASS** — 신규 시나리오 테스트 10파일 232건 + 매트릭스 인용 기존 테스트 54파일 685건 | [S01–S05 매트릭스](J-stage5-l1-matrix-s01-s05.md) · [S06–S10 매트릭스](J-stage5-l1-matrix-s06-s10.md) |
| L2 (DB 계약, 격리 DB) | **로컬 1회용 PostgreSQL 16 계약 스위트 13개 PASS** (2단계 5 · 주문 1 · 3단계 7, 경합 포함). 시나리오 전체 쓰기 회귀는 **NOT_PROVEN** (ND-3 미결 — `dibay-test` 등 사용 안 함) | `supabase/tests/isolated/*/run.sh` |
| L3 (Playwright 3 컨텍스트) | **NOT_PROVEN** — Preview 의 Supabase 대상 미확인, 쓰기 케이스는 ND-3 | — |
| L4 (운영 읽기 전용 불변식) | **12개 위반 0** (아래 표). I-1·I-8 은 대상 주문 0건(기준 이후 자연 트래픽 없음) → 실질 NOT_PROVEN | 운영 SELECT 1회 |
| L5 (Owner·작업자 실측) | **NOT_PROVEN** | — |

## L4 불변식 (운영 SELECT, 2026-10-21 PHT 1회)

기준: 수수료 `2026-10-20 20:30 UTC`, 3단계 적용 `2026-10-21 07:35 UTC`(보수적으로 마지막 적용 이후).

| ID | 결과 |
|---|---|
| I-1 조리 이후 주문인데 수수료 의무 없음 | 0 (대상 0건) |
| I-2 기준 이전 주문에 기준 이후 의무 | 0 |
| I-3 Cash 잔액 ≠ 원장 합 | 신규 0 — 기존 1곳 −₱225(마지막 원장 2026-09-17, D-5 제외 목록) 만 |
| I-4 원장 멱등키 NULL·중복 | 0 / 0 |
| I-5 환불·취소인데 쿠폰 미역처리 | 0 |
| I-6 상품권 역처리인데 주문 미종료 | 0 |
| I-7 수수료 lifecycle 트리거 | `trg_store_orders_commission_lifecycle = O` |
| I-8 배달 주문 판정 스냅샷 NULL | 0 (대상 0건) |
| I-9 좌표 없이 배달 ON 으로 바뀐 매장 | 0 |
| I-10 광고 펀딩 ↔ Cash 원장 | 차감 불일치 0 · 환급 불일치 0 |
| I-11 OWNER_PAID 기간 > 스냅샷 일수 | 0 (매장 홍보·배너) |
| I-12 종료·회수 쿠폰 재개 | 0 |

## 발견 결함 (5단계는 검증 단계 — 수정하지 않고 보고)

1. `components/business/owner/OwnerStoreOrderDeliveryActions.tsx:157` — 접수 전(pending) 「거절」에서 선택한 사유를 버리고 `PATCH cancelled` 만 전송(메신저 오너 액션바·채팅 판매자 패널 경로). 주문자 알림에 사유 없음. PATCH API 에 사유 필드가 없어 API+UI 동시 변경 필요.
2. `app/api/me/stores/[storeId]/orders/[orderId]/route.ts:382` — 오너 PATCH 가 `accepted → cancelled` 를 허용(취소 원장·사유 없이 `store_order_cancel_direct_atomic`). 현재 화면 진입 경로 없음(사용처 없는 `OwnerStoreOrderPeekCancelBar` 만).
3. 누락 기능 — 관리자 주문 상세 「주문 당시 판정」(LOC-004 연동) 표시 없음. 스냅샷은 저장되나 읽는 화면·로더 0.

## 남은 위험

- DB 쪽(같은 TX 역거래·멱등 UNIQUE·트리거·RLS 42501·주문 RPC 정지 거부·지역 교체 원자성)은 단계별 로컬 계약 스위트 외 시나리오 L2 가 ND-3 전까지 NOT_PROVEN.
- 정지 매장 목록·검색 제외(SQL RPC 필터)는 L3, 모든 화면 표시는 L5 실측 필요.
- HARD LOCK 완료 선언 없음.
