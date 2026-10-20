import type { MessageKey } from "@/lib/i18n/messages";

/** 매장 입점 신청 제출 불가 사유 — 화면 순서와 같은 우선순위 (매장 ID → 실명 → 대표 주소) */
export type BusinessApplySubmitBlockedReason = "store_id" | "name" | "address";

export const BUSINESS_APPLY_SUBMIT_BLOCKED_MESSAGE_KEY: Record<BusinessApplySubmitBlockedReason, MessageKey> = {
  store_id: "business_apply_submit_blocked_store_id",
  name: "business_apply_submit_blocked_name",
  address: "business_apply_submit_blocked_address",
};

/**
 * 제출 버튼이 비활성인 이유 1개 (없으면 null = 제출 가능).
 * 판정 조건은 기존 `submitDisabled` 와 동일 — 사유 표시만 추가한다 (매장 도메인 동작 불변).
 */
export function resolveBusinessApplySubmitBlockedReason(input: {
  storeSlug: string | null | undefined;
  addressId: string | null | undefined;
  applicantName: string | null | undefined;
}): BusinessApplySubmitBlockedReason | null {
  if (!(input.storeSlug ?? "").trim()) return "store_id";
  if (!(input.applicantName ?? "").trim()) return "name";
  if (!(input.addressId ?? "").trim()) return "address";
  return null;
}
