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
  backdrop: 1000,
  sheet: 1005,
  drawer: 1010,
  modal: 1020,
  critical: 1030,
} as const;

export type OwnerOverlayLayer = keyof typeof OWNER_OVERLAY_Z;

export const OWNER_OVERLAY_Z_CLASS = {
  sticky: "z-[40]",
  header: "z-[56]",
  bottomNav: "z-[55]",
  fab: "z-[58]",
  backdrop: "z-[1000]",
  sheet: "z-[1005]",
  drawer: "z-[1010]",
  modal: "z-[1020]",
  critical: "z-[1030]",
} as const;
