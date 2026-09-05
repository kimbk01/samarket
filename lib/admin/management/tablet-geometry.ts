/**
 * Tablet landscape primary Admin operating viewport.
 * Table usable width = viewport − sidebar − page padding − gutter (measure clientWidth).
 */
export const ADMIN_TABLET_BASELINE = {
  width: 1024,
  height: 768,
} as const;

/** CSS var used by Admin shell sidebar. */
export const ADMIN_SIDEBAR_WIDTH_CSS_VAR = "--admin-sidebar-width";

export type TabletTableGeometryCheckId =
  | "TBL-1"
  | "TBL-2"
  | "TBL-3"
  | "TBL-4"
  | "TBL-5"
  | "TBL-6"
  | "TBL-7"
  | "TBL-8"
  | "TBL-9"
  | "TBL-10"
  | "TBL-11"
  | "TBL-12";

export type TabletTableGeometrySnapshot = {
  bodyScrollWidth: number;
  bodyClientWidth: number;
  tableViewportScrollWidth: number;
  tableViewportClientWidth: number;
};

/**
 * Body must not be the X overflow owner; table viewport may exceed clientWidth.
 */
export function evaluateTabletTableGeometry(snap: TabletTableGeometrySnapshot): {
  bodyNoXOverflow: boolean;
  tableViewportMayScrollX: boolean;
  tableNeedsHorizontalScroll: boolean;
} {
  const bodyNoXOverflow = snap.bodyScrollWidth <= snap.bodyClientWidth + 1;
  const tableNeedsHorizontalScroll =
    snap.tableViewportScrollWidth > snap.tableViewportClientWidth + 1;
  return {
    bodyNoXOverflow,
    tableViewportMayScrollX: true,
    tableNeedsHorizontalScroll,
  };
}
