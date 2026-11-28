/**
 * 사장님 고객센터 갈색 단일 정의 (고객 문의 SSOT UI U4·U5 · Owner 「권장안대로」 2026-11-27 ·
 * 최종 점검 M3·U1·U14 2026-11-28 — 갈색 정의는 이 파일 한 곳).
 */

/** 갈색 바탕 + 흰 글자 — 사장님 표시(태그·선택 탭·전환 칸)의 한 정의 */
export const OWNER_SUPPORT_TONE_CLASS = "bg-[var(--dibay-brown)] text-sam-on-primary";

/** 사장님 화면 고객센터 FAB 바탕(갈색) · 숫자 뱃지 테두리 — FAB 도 이 파일의 갈색만 쓴다(재감사 §1) */
export const OWNER_SUPPORT_FAB_CLASS = "bg-[var(--dibay-brown)]";
export const OWNER_SUPPORT_FAB_RING_CLASS = "ring-[var(--dibay-brown)]";

/**
 * 사장님 쪽 문의 버튼(고객센터 「문의하기」)은 FAB·「문의 접수」와 같은 **갈색**.
 * 높이 44px · 모서리 4px · 14px/500. 비활성 = 기본 비활성 회색(문의 창 버튼과 같은 토큰).
 */
export const OWNER_SUPPORT_CTA_CLASS = `touch-manipulation inline-flex w-full min-h-11 items-center justify-center rounded-ui-rect ${OWNER_SUPPORT_TONE_CLASS} px-4 text-[14px] font-medium active:opacity-90 disabled:bg-[var(--sm-color-primary-disabled)] disabled:text-[var(--overlay-text-secondary)]`;

/**
 * 사장님 고객센터 선택 탭 (최종 감사 U-7 · 2026-11-28) — 「문의하기」와 같은 갈색. 초록(`bg-signature`) 쓰지 않음.
 */
export const OWNER_SUPPORT_TAB_SELECTED_CLASS = OWNER_SUPPORT_TONE_CLASS;

/**
 * 문의 창 주 버튼(문의 접수·보내기·확인했어요·이어 쓰기 등) 색 (최종 점검 M3·U1 · 2026-11-28).
 * 사장님 = 누를 수 있을 때와 **전송 중**에 갈색 · 정말 비활성일 때만 기본 비활성 회색 · 회원 = 기본(초록) 그대로.
 * `DibayOverlayButton` 은 전송 중에도 `disabled` 를 걸므로, 회색 규칙(:disabled)보다 강하게(!) 덮는다.
 */
export function supportPrimaryCtaToneClass(owner: boolean, opts: { disabled?: boolean; loading?: boolean } = {}): string {
  if (!owner) return "";
  if (opts.disabled && !opts.loading) return "";
  return "!bg-[var(--dibay-brown)] !text-sam-on-primary";
}

/**
 * 「문의하기」 비활성 판정 (최종 감사 U-12 · 계약 §6 「사장님인데 매장 없음」) — 허브·사장님 고객센터 공용.
 */
export function isSupportHubInquireDisabled(audience: "MEMBER" | "OWNER", storeId?: string | null): boolean {
  return audience === "OWNER" && !String(storeId ?? "").trim();
}
