import { resolveFabBottomAboveFixedBarCss } from "@/lib/layout/fixed-bottom-bar-occupancy";

/** 하단탭·오너 셸이 없을 때 FAB 기본 위치 */
export const SUPPORT_FAB_SAFE_BOTTOM_CLASS = "bottom-[calc(var(--safe-bottom)+16px)]";

/** 클래스 위치와 같은 값의 CSS 식 — 고정 바와 `max()` 비교용 */
const SUPPORT_FAB_BASE_BOTTOM_CSS = {
  owner: "var(--owner-fab-bottom)",
  bottomNav: "calc(var(--app-bottom-nav-height, 60px) + var(--safe-bottom, 0px) + 10px)",
  safe: "calc(var(--safe-bottom, 0px) + 16px)",
} as const;

export type SupportFabBottomPlacement = {
  className: string;
  /** 고정 바가 있을 때만 — 기본 위치와 바 위 중 높은 쪽 */
  style?: { bottom: string };
};

/**
 * 고객센터 FAB 하단 위치 단일 판정.
 * 1) 오너 셸 → 오너 FAB 위치, 2) 하단탭 → 탭 위 10px, 3) 그 외 → safe-area + 16px.
 * 화면 하단 고정 바(`sam-fixed-bottom-bar`)가 있으면 그 위 10px 과 비교해 더 높은 쪽 (겹침 0).
 */
export function resolveSupportFabBottomPlacement(input: {
  ownerShell: boolean;
  bottomNavClearance: boolean;
  fixedBarOccupiedPx: number;
  ownerClass: string;
  bottomNavClass: string;
}): SupportFabBottomPlacement {
  const kind = input.ownerShell ? "owner" : input.bottomNavClearance ? "bottomNav" : "safe";
  const className =
    kind === "owner" ? input.ownerClass : kind === "bottomNav" ? input.bottomNavClass : SUPPORT_FAB_SAFE_BOTTOM_CLASS;
  const above = resolveFabBottomAboveFixedBarCss(SUPPORT_FAB_BASE_BOTTOM_CSS[kind], input.fixedBarOccupiedPx);
  return above ? { className, style: { bottom: above } } : { className };
}
