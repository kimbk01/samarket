/**
 * 사장님 고객센터 문의 CTA 단일 모양 (고객 문의 SSOT UI U4·U5 · Owner 「권장안대로」 2026-11-27).
 * 사장님 쪽 문의 버튼(고객센터 「문의하기」 · 빈 목록 「문의하기」)은 FAB·「문의 접수」와 같은 **갈색**.
 * 높이 44px · 모서리 4px · 14px/500.
 */
export const OWNER_SUPPORT_CTA_CLASS =
  "touch-manipulation inline-flex w-full min-h-11 items-center justify-center rounded-ui-rect bg-[var(--dibay-brown)] px-4 text-[14px] font-medium text-sam-on-primary active:opacity-90 disabled:opacity-50";

/**
 * 사장님 고객센터 선택 탭 (최종 감사 U-7 · 2026-11-28) — 「문의하기」와 같은 갈색. 초록(`bg-signature`) 쓰지 않음.
 */
export const OWNER_SUPPORT_TAB_SELECTED_CLASS = "bg-[var(--dibay-brown)] text-sam-on-primary";

/**
 * 「문의하기」 비활성 판정 (최종 감사 U-12 · 계약 §6 「사장님인데 매장 없음」) — 허브·사장님 고객센터 공용.
 */
export function isSupportHubInquireDisabled(audience: "MEMBER" | "OWNER", storeId?: string | null): boolean {
  return audience === "OWNER" && !String(storeId ?? "").trim();
}
