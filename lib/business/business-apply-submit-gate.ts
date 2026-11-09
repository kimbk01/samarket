import type { MessageKey } from "@/lib/i18n/messages";
import { STORE_APPLY_LIMITS, normalizeStoreApplyName } from "@/lib/stores/store-application-limits";

/**
 * 매장 입점 신청 제출 불가 사유 — 화면 순서와 같은 우선순위 (매장 신청 v2 · Owner 2026-11-10).
 * 실명 → 매장 이름 → 지점명(같은 이름이 있을 때) → 업종 → 매장 전화 인증 → 매장 위치 → 서약 불러오는 중 → 서약.
 * (매장 ID 는 서버 자동 생성 — 사유에서 빠짐. 신청자 대표 주소는 회원 게이트가 막는다.)
 */
export type BusinessApplySubmitBlockedReason =
  | "name"
  | "shop_name"
  | "branch"
  | "category"
  | "phone"
  | "location"
  | "partner_loading"
  | "partner";

export const BUSINESS_APPLY_SUBMIT_BLOCKED_MESSAGE_KEY: Record<BusinessApplySubmitBlockedReason, MessageKey> = {
  name: "business_apply_submit_blocked_name",
  shop_name: "store_apply_blocked_shop_name",
  branch: "store_apply_blocked_branch",
  category: "store_apply_blocked_category",
  phone: "store_apply_blocked_phone",
  location: "store_apply_blocked_location",
  partner_loading: "store_apply_blocked_partner_loading",
  partner: "business_apply_submit_blocked_partner",
};

/** 막힘 사유 줄의 해결 버튼 문구 */
export const BUSINESS_APPLY_SUBMIT_BLOCKED_FIX_KEY: Partial<Record<BusinessApplySubmitBlockedReason, MessageKey>> = {
  name: "store_apply_fix_go",
  shop_name: "store_apply_fix_go",
  branch: "store_apply_fix_go",
  category: "store_apply_fix_go",
  phone: "store_apply_fix_phone",
  location: "store_apply_fix_location",
  partner: "store_apply_fix_go",
};

/** 제출 버튼이 비활성인 이유 1개 (없으면 null = 제출 가능). */
export function resolveBusinessApplySubmitBlockedReason(input: {
  applicantName: string | null | undefined;
  shopName: string | null | undefined;
  /** 같은 이름 매장이 있어 지점명이 필요한데 비어 있음 */
  branchRequiredMissing?: boolean;
  categoryPrimarySlug: string | null | undefined;
  categorySubSlug: string | null | undefined;
  /** 매장 전화 — 새 인증 기록 또는 (보완 제출) 이미 저장된 번호 */
  hasStorePhone: boolean;
  hasLocation: boolean;
  partnerLoading?: boolean;
  partnerPledgePending?: boolean;
}): BusinessApplySubmitBlockedReason | null {
  const nm = normalizeStoreApplyName(input.applicantName ?? "");
  if (nm.length < STORE_APPLY_LIMITS.applicantMin) return "name";
  const shop = normalizeStoreApplyName(input.shopName ?? "");
  if (shop.length < STORE_APPLY_LIMITS.shopNameMin) return "shop_name";
  if (input.branchRequiredMissing === true) return "branch";
  if (!(input.categoryPrimarySlug ?? "").trim() || !(input.categorySubSlug ?? "").trim()) return "category";
  if (!input.hasStorePhone) return "phone";
  if (!input.hasLocation) return "location";
  if (input.partnerLoading === true) return "partner_loading";
  if (input.partnerPledgePending === true) return "partner";
  return null;
}
