/**
 * 배달 FAB — Christmas Starbucks 팔레트 (고정·단일 출처)
 * DO NOT: CSS/TSX에 hex 중복 — 본 파일만 수정.
 */
export const DELIVERY_FAB_CHRISTMAS_STARBUCKS_PALETTE = {
  green: "#0B421A",
  cream: "#FFFCFC",
  gold: "#EAC784",
  brown: "#362415",
  mauve: "#604C4C",
  /** FAB 펼침 시 X 닫기 — 원형 배경 */
  closeDisc: "#D62B1F",
} as const;

const P = DELIVERY_FAB_CHRISTMAS_STARBUCKS_PALETTE;

/** rgb(11 66 26) — green */
export function deliveryFabChristmasSurfaceBg(alpha: number): string {
  return `rgb(11 66 26 / ${alpha})`;
}

/** FAB 루트 CSS 변수 — fabSectorRootStyle() 에 병합 */
export function deliveryFabChristmasPaletteCssVars(surfaceAlpha: number): Record<string, string> {
  return {
    "--fab-palette-green": P.green,
    "--fab-palette-cream": P.cream,
    "--fab-palette-gold": P.gold,
    "--fab-palette-brown": P.brown,
    "--fab-palette-mauve": P.mauve,
    "--fab-edge-bg": P.green,
    "--fab-surface-bg": deliveryFabChristmasSurfaceBg(surfaceAlpha),
    "--fab-close-disc-bg": P.closeDisc,
  };
}

/** 메뉴 아이콘 박스 배경·전경 (item id 고정 매핑) */
export function deliveryFabIconBoxStyle(itemId: string): {
  backgroundColor: string;
  color: string;
} {
  switch (itemId) {
    case "fab_delivery_orders":
      return { backgroundColor: P.green, color: P.cream };
    case "fab_delivery_cart":
      return { backgroundColor: P.gold, color: P.brown };
    case "fab_delivery_order_chat":
      return { backgroundColor: P.mauve, color: P.cream };
    case "fab_delivery_home":
      return { backgroundColor: P.brown, color: P.cream };
    case "fab_delivery_store_admin":
      return { backgroundColor: P.green, color: P.gold };
    default:
      return { backgroundColor: P.cream, color: P.green };
  }
}
