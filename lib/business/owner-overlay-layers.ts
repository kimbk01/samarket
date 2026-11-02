/**
 * Owner shell overlay semantic layers (P0).
 * Order: CONTENT < STICKY < HEADER < BOTTOM_NAV < FAB < BACKDROP < SHEET < DRAWER < MODAL < CRITICAL
 *
 * Scoped to Owner Admin chrome. Do not renumber unrelated app z-indexes.
 * Dibay Overlay SSOT remains for new app-owned modals; Owner drawer/FAB/confirm use these.
 */

export const OWNER_OVERLAY_Z = {
  sticky: 40,
  header: 56,
  bottomNav: 55,
  fab: 58,
  /** 팝업 SSOT B1 (2026-11-02): 사장님 하단 탭은 실제로 `.app-bottom-nav-shell` z 1200 — 서랍·배경은 그 위, 공통 다이얼로그(1300) 아래 */
  backdrop: 1290,
  sheet: 1290,
  drawer: 1291,
  modal: 1300,
  critical: 1310,
} as const;

export type OwnerOverlayLayer = keyof typeof OWNER_OVERLAY_Z;

export const OWNER_OVERLAY_Z_CLASS = {
  sticky: "z-[40]",
  header: "z-[56]",
  bottomNav: "z-[55]",
  fab: "z-[58]",
  backdrop: "z-[1290]",
  sheet: "z-[1290]",
  drawer: "z-[1291]",
  modal: "z-[1300]",
  critical: "z-[1310]",
} as const;
