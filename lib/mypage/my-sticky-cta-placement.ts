/**
 * 내정보 하단 고정 CTA(`MyStickyCta`)·댓글 입력바 배치 단일 판정 (설계서 v3 §12 「하단 고정 CTA」).
 *
 * - 바 배경은 기기 전체 폭(`fixed inset-x-0`) · 하단탭이 없으면 아래 안전영역까지 칠한다.
 * - 하단탭이 마운트된 경로(`useBottomNavOccupiesClearance`)에서는 탭 **바로 위**에 붙는다
 *   (탭이 안전영역을 칠하므로 바 자체 아래 여백 0).
 * - 키보드가 열렸거나 탭이 스크롤로 숨으면 화면 아래(키보드 위)로 내려온다.
 * - 본문 아래 여백 = 탭 + CTA + 안전영역. 하단탭 경로는 셸 `<main>` 이 이미 탭+안전영역을 주므로
 *   본문은 CTA 높이만 더한다.
 */

/** 하단탭 바로 위 — `--app-bottom-nav-height`(60px) + safe-area */
export const MY_STICKY_CTA_ABOVE_BOTTOM_NAV_CSS =
  "calc(var(--app-bottom-nav-height, 60px) + var(--safe-bottom, 0px))";

/**
 * 하단탭 없는 경로 — CTA(버튼 46 + 위아래 10) + 안전영역.
 * Tailwind 가 소스에서 읽도록 클래스는 완성된 리터럴로 둔다 (템플릿 조합 금지).
 */
export const MY_STICKY_CTA_BODY_CLEARANCE_NO_NAV_CLASS =
  "pb-[calc(var(--sam-button-min-height,46px)+20px+var(--safe-bottom,0px))]";

/** 하단탭 경로 — 셸 `<main>` 이 탭+안전영역을 이미 주므로 CTA 높이만 */
export const MY_STICKY_CTA_BODY_CLEARANCE_WITH_NAV_CLASS =
  "pb-[calc(var(--sam-button-min-height,46px)+20px)]";

export type MyStickyCtaPlacement = {
  /** true = 하단탭 바로 위 */
  aboveBottomNav: boolean;
  /** 바 `bottom` */
  bottom: string;
  /** 바 `padding-bottom` (안전영역·키보드) */
  paddingBottom: string;
};

export function resolveMyStickyCtaPlacement(input: {
  bottomNavOccupies: boolean;
  bottomNavHidden?: boolean;
  keyboardOpen: boolean;
  /** `useFormKeyboardViewport().effectiveBottomInset` — 키보드/안전영역 */
  effectiveBottomInset: number;
}): MyStickyCtaPlacement {
  const inset = Number.isFinite(input.effectiveBottomInset) ? Math.max(0, input.effectiveBottomInset) : 0;
  const aboveBottomNav = input.bottomNavOccupies && !input.bottomNavHidden && !input.keyboardOpen;
  if (aboveBottomNav) {
    return { aboveBottomNav, bottom: MY_STICKY_CTA_ABOVE_BOTTOM_NAV_CSS, paddingBottom: "0px" };
  }
  return {
    aboveBottomNav,
    bottom: "0px",
    /** 키보드가 닫혀 있을 때도 첫 측정 전 안전영역이 비지 않게 `--safe-bottom` 하한 */
    paddingBottom: input.keyboardOpen ? `${inset}px` : `max(var(--safe-bottom, 0px), ${inset}px)`,
  };
}

/** 본문 아래 여백 클래스 — 탭 + CTA + 안전영역 (가려짐 0) */
export function resolveMyStickyCtaBodyClearanceClass(bottomNavOccupies: boolean): string {
  return bottomNavOccupies ? MY_STICKY_CTA_BODY_CLEARANCE_WITH_NAV_CLASS : MY_STICKY_CTA_BODY_CLEARANCE_NO_NAV_CLASS;
}
