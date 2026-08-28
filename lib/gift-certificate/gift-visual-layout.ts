/** Measured responsive Gift card / mall grid — reference §11. */

export const GIFT_CARD_MIN_WIDTH_PX = 280;
export const GIFT_CARD_MAX_WIDTH_PX = 420;
export const GIFT_COMMERCE_CONTENT_MAX_WIDTH_PX = 1120;

/** Tailwind grid for mall + wallet lists — auto-fill by min card width. */
export const GIFT_CARD_RESPONSIVE_GRID_CLASS =
  "grid min-w-0 grid-cols-1 gap-4 pb-8 sm:grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))]";

/** Single card width clamp inside hub lists. */
export const GIFT_CARD_SHELL_CLASS = "mx-auto w-full min-w-0 max-w-[26.25rem]";

/** Detail hero — fill content column on 390px; cap so desktop is not a postage stamp. */
export const GIFT_DETAIL_CARD_SHELL_CLASS = "mx-auto w-full min-w-0 max-w-[36rem]";

/** Landscape stored-value certificate — ~1.65:1. */
export const GIFT_HERO_ASPECT_CLASS = "aspect-[1.65/1]";
export const GIFT_HERO_ASPECT_COMPACT_CLASS = "aspect-[1.65/1]";
