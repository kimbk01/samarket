import { deliveryFabChristmasPaletteCssVars } from "@/lib/ui/delivery-fab-christmas-starbucks-palette";

/** 배달 FAB 섹터 — 레이아웃·투명도 단일 정의 (CSS `--fab-*` 와 동기) */
export const FAB_SURFACE_ALPHA = 0.6;

/** 모바일 기본 — clamp 하한 */
export const FAB_SHELL_W_REM = 4.05;
export const FAB_ICON_BOX_REM = 2.4;
/** 태블릿·넓은 뷰포트 clamp 상한 */
export const FAB_SHELL_W_MAX_REM = 4.75;
export const FAB_ICON_BOX_MAX_REM = 2.6;

/** 패널 상단 inset = (셸 − 아이콘박스) / 2 — 좌·우 gutter 와 동일 (기본 rem 산식·테스트용) */
export const FAB_PANEL_INSET_REM = (FAB_SHELL_W_REM - FAB_ICON_BOX_REM) / 2;

export const FAB_DOCK_MS = 360;

/**
 * panel-body 상단 여백 — TSX 인라인만.
 * DO NOT: CSS `@layer components` padding-top (max-height morph 와 충돌 → inset 0 회귀).
 * 계약: docs/main-bottom-nav-fab-sector-contract.md §2
 */
export function fabPanelBodyInlineStyle(): { paddingTop: string } {
  return { paddingTop: "calc((var(--fab-shell-w) - var(--fab-icon-box)) / 2)" };
}

export function fabSectorRootStyle(dockMs = FAB_DOCK_MS): Record<string, string> {
  return {
    ...deliveryFabChristmasPaletteCssVars(FAB_SURFACE_ALPHA),
    "--fab-dock-ms": `${dockMs}ms`,
    "--fab-surface-alpha": String(FAB_SURFACE_ALPHA),
    "--fab-shell-w": `clamp(${FAB_SHELL_W_REM}rem, 11vw, ${FAB_SHELL_W_MAX_REM}rem)`,
    "--fab-icon-box": `clamp(${FAB_ICON_BOX_REM}rem, 6.4vw, ${FAB_ICON_BOX_MAX_REM}rem)`,
    "--fab-panel-inset": "calc((var(--fab-shell-w) - var(--fab-icon-box)) / 2)",
  };
}
