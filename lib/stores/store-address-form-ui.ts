/**
 * 매장 주소 입력 — 스토어 장바구니 주소 모달(`StoreCommerceCartPageClient`)과 동일한 구분·길이.
 * 화면 문구는 `*_KEY` 를 `t()` 로 그린다 (재감사 2026-11-27).
 * 사후 검토 D3 (2026-11-27): 부르는 곳이 없던 ko 고정 문자열 상수(deprecated 포함)는 지웠다.
 */
import type { MessageKey } from "@/lib/i18n/messages";

export const STORE_LOCATION_SECTION_HINT_STORE_PUBLIC_KEY: MessageKey = "store_addr_hint_store_public";
export const STORE_ADDRESS_STREET_LABEL_KEY: MessageKey = "store_addr_street_label";
export const STORE_ADDRESS_STREET_HINT_KEY: MessageKey = "store_addr_street_hint";
export const STORE_ADDRESS_DETAIL_LABEL_KEY: MessageKey = "store_addr_detail_label";
export const STORE_ADDRESS_STREET_PLACEHOLDER_KEY: MessageKey = "store_addr_street_placeholder";
export const STORE_ADDRESS_STREET_MAX = 300;
export const STORE_ADDRESS_DETAIL_MAX = 500;
