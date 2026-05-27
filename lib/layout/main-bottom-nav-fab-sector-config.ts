import { deliveryFabChristmasPaletteCssVars } from "@/lib/ui/delivery-fab-christmas-starbucks-palette";

/** 배달 FAB 섹터 — 레이아웃·투명도 단일 정의 (CSS `--fab-*` 와 동기) */
export const FAB_SURFACE_ALPHA = 0.6;

export const FAB_SHELL_W_REM = 4.05;
export const FAB_ICON_BOX_REM = 2.4;

/** 패널 상단 inset = (셸 − 아이콘박스) / 2 — 좌·우 gutter 와 동일 */
export const FAB_PANEL_INSET_REM = (FAB_SHELL_W_REM - FAB_ICON_BOX_REM) / 2;

export const FAB_DOCK_MS = 360;

/**
 * panel-body 상단 여백 — TSX 인라인만.
 * DO NOT: CSS `@layer components` padding-top (max-height morph 와 충돌 → inset 0 회귀).
 * 계약: docs/main-bottom-nav-fab-sector-contract.md §2
 */
export function fabPanelBodyInlineStyle(): { paddingTop: string } {
  return { paddingTop: `${FAB_PANEL_INSET_REM}rem` };
}

export function fabSectorRootStyle(dockMs = FAB_DOCK_MS): Record<string, string> {
  return {
    ...deliveryFabChristmasPaletteCssVars(FAB_SURFACE_ALPHA),
    "--fab-dock-ms": `${dockMs}ms`,
    "--fab-surface-alpha": String(FAB_SURFACE_ALPHA),
    "--fab-shell-w": `${FAB_SHELL_W_REM}rem`,
    "--fab-panel-inset": `${FAB_PANEL_INSET_REM}rem`,
  };
}
