import {
  FAB_DOCK_MS,
  FAB_ICON_BOX_MAX_REM,
  FAB_ICON_BOX_REM,
  FAB_SHELL_W_MAX_REM,
  FAB_SHELL_W_REM,
  FAB_SURFACE_ALPHA,
} from "@/lib/layout/main-bottom-nav-fab-sector-config";

/**
 * 메신저 홈 FAB — 배달(녹색 `#0B421A`)과 시각 분리.
 * 팔레트: 모브·브라운·골드·크림 (배달 FAB 과 동일 5색 세트이나 **주조색=mauve**).
 */
export const MESSENGER_FAB_PALETTE = {
  mauve: "#604C4C",
  cream: "#FFFCFC",
  gold: "#EAC784",
  brown: "#362415",
  /** 접힘 ‹ 탭·펼침 셸 테두리 톤 */
  edge: "#604C4C",
  /** X 닫기 디스크 */
  closeDisc: "#362415",
} as const;

const P = MESSENGER_FAB_PALETTE;

/** rgb(96 76 76) — mauve */
export function messengerFabSurfaceBg(alpha: number): string {
  return `rgb(96 76 76 / ${alpha})`;
}

/** 메신저 FAB 루트 CSS 변수 — `fabSectorRootStyle` 레이아웃 + 메신저 팔레트 */
export function messengerFabPaletteCssVars(surfaceAlpha: number): Record<string, string> {
  return {
    "--fab-palette-green": P.mauve,
    "--fab-palette-cream": P.cream,
    "--fab-palette-gold": P.gold,
    "--fab-palette-brown": P.brown,
    "--fab-palette-mauve": P.mauve,
    "--fab-edge-bg": P.edge,
    "--fab-surface-bg": messengerFabSurfaceBg(surfaceAlpha),
    "--fab-close-disc-bg": P.closeDisc,
  };
}

export function messengerFabSectorRootStyle(dockMs = FAB_DOCK_MS): Record<string, string> {
  return {
    ...messengerFabPaletteCssVars(FAB_SURFACE_ALPHA),
    "--fab-dock-ms": `${dockMs}ms`,
    "--fab-surface-alpha": String(FAB_SURFACE_ALPHA),
    "--fab-shell-w": `clamp(${FAB_SHELL_W_REM}rem, 11vw, ${FAB_SHELL_W_MAX_REM}rem)`,
    "--fab-icon-box": `clamp(${FAB_ICON_BOX_REM}rem, 6.4vw, ${FAB_ICON_BOX_MAX_REM}rem)`,
    "--fab-panel-inset": "calc((var(--fab-shell-w) - var(--fab-icon-box)) / 2)",
  };
}

export type MessengerFabItemId = "friends" | "open_chat" | "archive" | "compose";

/** 메뉴 아이콘 박스 — 메신저 FAB 전용 매핑 */
export function messengerFabIconBoxStyle(itemId: MessengerFabItemId): {
  backgroundColor: string;
  color: string;
} {
  switch (itemId) {
    case "friends":
      return { backgroundColor: P.brown, color: P.cream };
    case "open_chat":
      return { backgroundColor: P.mauve, color: P.cream };
    case "archive":
      return { backgroundColor: P.gold, color: P.brown };
    case "compose":
      return { backgroundColor: P.cream, color: P.mauve };
    default:
      return { backgroundColor: P.cream, color: P.mauve };
  }
}
