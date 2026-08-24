/**
 * CUT 8 — Delivery Discovery Control Plane.
 * Canonical nav owner: components/admin/admin-menu.ts (LEFT workspace sidebar).
 * Right CMS rail duplicate removed — empty SSOT + isDeliveryCmsSurface = false.
 */

export type DeliveryCmsNavItem = {
  key: string;
  labelKo: string;
  labelEn: string;
  href: string;
  match: (path: string, search: string) => boolean;
};

export type DeliveryCmsSidebarNode = {
  key: string;
  labelKo: string;
  labelEn: string;
  href?: string;
  match?: (path: string, search: string) => boolean;
  children?: DeliveryCmsSidebarNode[];
  help?: boolean;
};

/** @deprecated CUT 8 — unused top strip (never rendered). Kept empty for import safety. */
export const DELIVERY_CMS_TOP_NAV: DeliveryCmsNavItem[] = [];

/** CUT 8 — duplicate right rail removed. Left admin-menu is sole Discovery nav. */
export const DELIVERY_CMS_SIDEBAR: DeliveryCmsSidebarNode[] = [];

/** @deprecated CUT 8 — help nodes without href removed. */
export const DELIVERY_CMS_HELP_HOME: DeliveryCmsSidebarNode[] = [];

/** @deprecated CUT 8 — help nodes without href removed. */
export const DELIVERY_CMS_HELP_CATEGORY: DeliveryCmsSidebarNode[] = [];

/**
 * CUT 8 — never show duplicate right rail.
 * Discovery surfaces use LEFT admin-menu only.
 */
export function isDeliveryCmsSurface(_pathname: string): boolean {
  return false;
}
