/**
 * 주소 데이터 계층 — **서로 다른 테이블**이며, 한 API가 다른 테이블을 묵시적으로 전부
 * 덮어쓰지 않도록 유지합니다. (연동 = 표시·폴백 체인이지, 단일 행 동기화가 아님)
 *
 * ## 1) `public.profiles` (회원 프로필 위치)
 * - 컬럼: `latitude`, `longitude`, `full_address`, `region_code`, `region_name`,
 *   `address_street_line`, `address_detail` 등
 * - 갱신: `PATCH /api/me/profile` (프로필 수정 화면만)
 * - 소비: `RegionContext`(프로필 기반 동네), 내정보 카드 한 줄,
 *   `GET /api/me/checkout-contact` 의 `contact_address` 폴백 등
 * - **주소록(`user_addresses`)을 자동 수정하지 않음**
 *
 * ## 2) `public.user_addresses` (생활 / 거래 / 배달 **각각** 기본지)
 * - 행마다 `use_for_life`, `use_for_trade`, `use_for_delivery` 및
 *   `is_default_life`, `is_default_trade`, `is_default_delivery` (유저당 기본 1개씩)
 * - 갱신: `POST|PATCH /api/me/addresses`, 주소록 UI
 * - 소비:
 *   - 거래 글 작성 기본 지역: `GET /api/me/address-defaults` → **`defaults.master`(대표) 우선**,
 *     없으면 `defaults.trade` 의 `app_region_id` / `app_city_id` (`TradeDefaultLocationBlock`)
 *   - 생활 동네 요약: `defaults.life` + `summarizeLifeDefaultAppLocation`
 *   - 배달 기본: `defaults.delivery` → 체크아웃 등
 * - **프로필만 저장해도 이 테이블은 바뀌지 않음** → 거래/배달 기본을 프로필과 맞추려면
 *   주소록에서 기본 항목을 따로 맞춰야 함
 *
 * ## 3) 매장(스토어) 배달·픽업 주소
 * - 회원 주소와 **별도** — 매장 신청/기본 정보 등 `stores` 쪽 데이터
 * - “추가”로 넣는 주소이며, `profiles` PATCH 로 매장 행이 갱신되지 않음
 *
 * 요약: 프로필 위치 ≠ 주소록 기본 3종 ≠ 매장 주소. 각각 저장 API가 다릅니다.
 */
export const ADDRESS_SOURCE_ARCHITECTURE = "profiles | user_addresses | stores" as const;
