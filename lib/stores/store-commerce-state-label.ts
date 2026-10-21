/**
 * OPS-04 — 실효 영업 상태 라벨 (오너 홈 카드·헤더·설정 토글 옆). 판정은 `resolveStoreFrontCommerceState` 단일 경로 —
 * 주문자 상세·장바구니·관리자 컨트롤센터와 같은 함수·같은 결과.
 */
import type { MessageKey } from "@/lib/i18n/messages";
import { parsePostgresBool } from "@/lib/community-feed/parse-postgres-bool";
import {
  resolveStoreFrontCommerceState,
  type StoreFrontCommerceReason,
} from "@/lib/stores/store-auto-hours";

export const STORE_COMMERCE_STATE_LABEL_KEY: Record<StoreFrontCommerceReason, MessageKey> = {
  open: "store_commerce_state_open",
  break: "store_commerce_state_break",
  outside_hours: "store_commerce_state_outside_hours",
  closed_day: "store_commerce_state_closed_day",
  manual_closed: "store_commerce_state_manual_closed",
};

export function resolveOwnerStoreCommerceStateLabel(
  row: { business_hours_json?: unknown; is_open?: unknown },
  now: Date = new Date()
): { reason: StoreFrontCommerceReason; isOpenForCommerce: boolean; labelKey: MessageKey } {
  // 오너 행은 문자열 "false" 등이 올 수 있어 기존 토글과 같은 parsePostgresBool(기본 true) 로 읽는다.
  const st = resolveStoreFrontCommerceState(row.business_hours_json, parsePostgresBool(row.is_open, true), now);
  return { reason: st.reason, isOpenForCommerce: st.isOpenForCommerce, labelKey: STORE_COMMERCE_STATE_LABEL_KEY[st.reason] };
}
