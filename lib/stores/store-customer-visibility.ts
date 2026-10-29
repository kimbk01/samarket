/**
 * 고객 노출 매장 단일 조건 — `approval_status = approved` + `is_visible = true` + 기존 테스트 매장 제외.
 *
 * `legacy_test` 는 과거 개발·검증 데이터라 고객 화면(홈·업종·검색·배너·상세)에 나오지 않는다 (Owner 2026-10-29).
 * 관리자 PATCH 의 노출 금지(`app/api/admin/stores/[id]/route.ts`)만으로는 이미 노출된 행을 막지 못해 조회에서도 뺀다.
 * DB CHECK 는 별도 승인(D7) 후.
 */
export const CUSTOMER_HIDDEN_STORE_KIND = "legacy_test" as const;
