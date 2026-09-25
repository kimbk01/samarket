/**
 * FD2 domain pane floors.
 *
 * These numbers are geometry, not Device identity.
 * width >= floor must never become TABLET / DESKTOP.
 *
 * All floors are CANDIDATE_NOT_LOCKED until a later FD consumes them in UI.
 */

export const DIBAY_DOMAIN_GEOMETRY_LOCK_STATE = "CANDIDATE_NOT_LOCKED" as const;

export type DibayLayoutDomain = "community" | "trade" | "messenger" | "call";

export type DibayDomainGeometry = {
  domain: DibayLayoutDomain;
  listMinPx: number;
  secondaryMinPx: number;
  twoPaneFloorPx: number;
  notes: string;
};

/**
 * Messenger existing product geometry:
 * - list clamp min 360 (`MESSENGER_SPLIT_LIST_PANE_WIDTH_CSS`)
 * - room min 400 (360 + 400 ≈ 760)
 * - CSS split media uses 768 (`APP_MESSENGER_SPLIT_MIN_PX`) because Tailwind `md`
 *   is the nearest integer to that floor — not a tablet Device cutoff.
 */
export const DIBAY_MESSENGER_GEOMETRY = {
  lockState: DIBAY_DOMAIN_GEOMETRY_LOCK_STATE,
  listMinPx: 360,
  roomMinPx: 400,
  roomPrefPx: 520,
  roomMaxPx: 760,
  twoPaneFloorPx: 760,
  legacyCssSplitMinPx: 768,
} as const;

/**
 * Community existing product geometry:
 * - list works at phone 360
 * - detail reading column uses `max-w-3xl` (768 cap, not a Device cutoff)
 * - candidate detail floor 480 → 360 + 480 = 840
 */
export const DIBAY_COMMUNITY_GEOMETRY = {
  lockState: DIBAY_DOMAIN_GEOMETRY_LOCK_STATE,
  listMinPx: 360,
  detailMinPx: 480,
  detailMaxCapPx: 768,
  twoPaneFloorPx: 840,
} as const;

/**
 * Trade existing product geometry — audited, not copied from Community.
 *
 * Current UI is single-surface feed then full-page detail. No 2-pane owner yet (FD6).
 * - LIST: 2-col product grid proven at phone ~360 (`TRADE_FEED_PRODUCT_GRID_CLASS`)
 * - SEARCH row: 100px thumb + 12px gap + text (`h-[100px] w-[100px]`)
 * - DETAIL: full-page `APP_MAIN_COLUMN` — proven at phone ~360
 * - Grid density `sm` 640 / `lg` 1024 is VISUAL_TUNING, not Device
 */
export const DIBAY_TRADE_GEOMETRY = {
  lockState: DIBAY_DOMAIN_GEOMETRY_LOCK_STATE,
  listMinPx: 360,
  detailMinPx: 360,
  cardThumbPx: 100,
  searchRowMinPx: 312,
  twoPaneFloorPx: 720,
  gridTwoColMinPx: 360,
  gridThreeColVisualPx: 640,
  gridFourColVisualPx: 1024,
} as const;

export function getDomainTwoPaneFloorPx(domain: DibayLayoutDomain): number {
  if (domain === "messenger") return DIBAY_MESSENGER_GEOMETRY.twoPaneFloorPx;
  if (domain === "community") return DIBAY_COMMUNITY_GEOMETRY.twoPaneFloorPx;
  if (domain === "trade") return DIBAY_TRADE_GEOMETRY.twoPaneFloorPx;
  return Number.POSITIVE_INFINITY;
}

export function getDomainGeometry(domain: DibayLayoutDomain): DibayDomainGeometry {
  if (domain === "messenger") {
    return {
      domain,
      listMinPx: DIBAY_MESSENGER_GEOMETRY.listMinPx,
      secondaryMinPx: DIBAY_MESSENGER_GEOMETRY.roomMinPx,
      twoPaneFloorPx: DIBAY_MESSENGER_GEOMETRY.twoPaneFloorPx,
      notes: "LIST_MIN + ROOM_MIN. CSS 768 is the integer media for this floor.",
    };
  }
  if (domain === "community") {
    return {
      domain,
      listMinPx: DIBAY_COMMUNITY_GEOMETRY.listMinPx,
      secondaryMinPx: DIBAY_COMMUNITY_GEOMETRY.detailMinPx,
      twoPaneFloorPx: DIBAY_COMMUNITY_GEOMETRY.twoPaneFloorPx,
      notes: "LIST_MIN + DETAIL_MIN. max-w-3xl is a cap, not Device.",
    };
  }
  if (domain === "trade") {
    return {
      domain,
      listMinPx: DIBAY_TRADE_GEOMETRY.listMinPx,
      secondaryMinPx: DIBAY_TRADE_GEOMETRY.detailMinPx,
      twoPaneFloorPx: DIBAY_TRADE_GEOMETRY.twoPaneFloorPx,
      notes: "Phone-proven 2-col list + phone-proven detail. No Trade 2-pane UI in FD2.",
    };
  }
  return {
    domain,
    listMinPx: 0,
    secondaryMinPx: 0,
    twoPaneFloorPx: Number.POSITIVE_INFINITY,
    notes: "Call presentation is Device + orientation, not a 2-pane floor.",
  };
}
