/** Gift card grid / shell — fixed-comp SSOT uses the canonical 5:7 ticket geometry. */

export const GIFT_CARD_MIN_WIDTH_PX = 280;
export const GIFT_CARD_MAX_WIDTH_PX = 420;
export const GIFT_COMMERCE_CONTENT_MAX_WIDTH_PX = 1120;

/** Tailwind grid for mall + wallet lists — portrait cards. */
export const GIFT_CARD_RESPONSIVE_GRID_CLASS =
  "grid min-w-0 grid-cols-1 gap-4 pb-8 sm:grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))]";

/** Canonical portrait coordinate system — RESET contract: one 5:7 face at every scale. */
export const GIFT_CERT_COORD_WIDTH = 800;
export const GIFT_CERT_COORD_HEIGHT = 1120;
export const GIFT_CERT_ASPECT_RATIO = "5 / 7" as const;
export const GIFT_CERT_ASPECT_RATIO_NUMBER = GIFT_CERT_COORD_WIDTH / GIFT_CERT_COORD_HEIGHT;

/** Scale-only size variants — max-width only; never change internal geometry. */
export type GiftCertificateFaceSize = "sm" | "md" | "lg";

export const GIFT_CERT_SIZE_MAX_WIDTH_PX: Record<GiftCertificateFaceSize, number> = {
  sm: 220,
  md: 340,
  lg: 420,
};

/** CSS custom property name for outer max-width SSOT. */
export const GIFT_CERTIFICATE_MAX_WIDTH_VAR = "--gift-certificate-max-width";

const SIZE_SHELL: Record<GiftCertificateFaceSize, string> = {
  sm: "mx-auto w-full min-w-0 max-w-[220px]",
  md: "mx-auto w-full min-w-0 max-w-[340px]",
  lg: "mx-auto w-full min-w-0 max-w-[420px]",
};

export function giftCertificateSizeShellClass(size: GiftCertificateFaceSize): string {
  return SIZE_SHELL[size];
}

/** @deprecated Prefer GiftCertificateFaceSize — maps legacy names to scale only. */
export type GiftCertificateFaceVariant = "hero" | "standard" | "compact";

export function giftFaceVariantToSize(variant: GiftCertificateFaceVariant): GiftCertificateFaceSize {
  if (variant === "hero") return "lg";
  if (variant === "compact") return "sm";
  return "md";
}

/** List / wallet card shell — md scale. */
export const GIFT_CARD_SHELL_CLASS = SIZE_SHELL.md;

/** Detail hero — lg scale. */
export const GIFT_DETAIL_CARD_SHELL_CLASS = SIZE_SHELL.lg;
