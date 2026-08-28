/** Gift card grid / shell — fixed-comp SSOT uses 5:3 face geometry. */

export const GIFT_CARD_MIN_WIDTH_PX = 360;
export const GIFT_CARD_MAX_WIDTH_PX = 480;
export const GIFT_COMMERCE_CONTENT_MAX_WIDTH_PX = 1120;

/** Tailwind grid for mall + wallet lists — avoid sub-360px comp crush. */
export const GIFT_CARD_RESPONSIVE_GRID_CLASS =
  "grid min-w-0 grid-cols-1 gap-4 pb-8 sm:grid-cols-[repeat(auto-fill,minmax(min(100%,360px),1fr))]";

/** List / wallet card shell — desktop readable fixed-comp scale. */
export const GIFT_CARD_SHELL_CLASS = "mx-auto w-full min-w-0 max-w-[30rem]";

/** Detail hero — fill content column; cap on desktop. */
export const GIFT_DETAIL_CARD_SHELL_CLASS = "mx-auto w-full min-w-0 max-w-[36rem]";

/** Fixed reference coordinate — 1600×950 landscape certificate. */
export const GIFT_CERT_ASPECT_RATIO = "1600 / 950" as const;
export const GIFT_CERT_COORD_WIDTH = 1600;
export const GIFT_CERT_COORD_HEIGHT = 950;

export type GiftCertificateFaceVariant = "hero" | "standard" | "compact";
