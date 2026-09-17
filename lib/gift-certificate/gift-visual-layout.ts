/** Gift card grid / shell — Owner modern ticket 640×360 (≈16:9). */

export const GIFT_CARD_MIN_WIDTH_PX = 280;
export const GIFT_CARD_MAX_WIDTH_PX = 560;
export const GIFT_COMMERCE_CONTENT_MAX_WIDTH_PX = 1120;

/** Tailwind grid for mall + wallet lists — landscape tickets. */
export const GIFT_CARD_RESPONSIVE_GRID_CLASS =
  "grid min-w-0 grid-cols-1 gap-4 pb-8 sm:grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))]";

/**
 * Canonical ticket coordinate system — Owner visual reference
 * dibay-gift-certificate-modern (640×360 PNG/SVG SSOT).
 * Do not stretch aspect per breakpoint.
 */
export const GIFT_CERT_COORD_WIDTH = 640;
export const GIFT_CERT_COORD_HEIGHT = 360;
export const GIFT_CERT_ASPECT_RATIO = "640 / 360" as const;
export const GIFT_CERT_ASPECT_RATIO_NUMBER = GIFT_CERT_COORD_WIDTH / GIFT_CERT_COORD_HEIGHT;

/** Scale-only size variants — max-width only; never change internal geometry. */
export type GiftCertificateFaceSize = "sm" | "md" | "lg";

export const GIFT_CERT_SIZE_MAX_WIDTH_PX: Record<GiftCertificateFaceSize, number> = {
  sm: 320,
  md: 390,
  lg: 560,
};

export const GIFT_CERTIFICATE_MAX_WIDTH_VAR = "--gift-certificate-max-width";

const SIZE_SHELL: Record<GiftCertificateFaceSize, string> = {
  sm: "mx-auto w-full min-w-0 max-w-[320px]",
  md: "mx-auto w-full min-w-0 max-w-[390px]",
  lg: "mx-auto w-full min-w-0 max-w-[560px]",
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

export const GIFT_CARD_SHELL_CLASS = SIZE_SHELL.md;
export const GIFT_DETAIL_CARD_SHELL_CLASS = SIZE_SHELL.lg;
