/**
 * Admin Banner preview host sizes — mirror consumer content/grid authorities.
 * Not a second runtime geometry SSOT; preview-only.
 */

export type AdminBannerPreviewDevice =
  | "phone"
  | "tablet_portrait"
  | "tablet_landscape"
  | "desktop";

/** Simulated consumer viewport/content outer width (no artificial 720 clamp). */
export function adminBannerPreviewDeviceOuterWidthPx(
  device: AdminBannerPreviewDevice
): number {
  switch (device) {
    case "phone":
      return 390;
    case "tablet_portrait":
      return 768;
    case "tablet_landscape":
      return 1024;
    case "desktop":
      return 1280;
  }
}

/**
 * Trade INLINE lives in one product grid cell (2/3/4 cols).
 * Approximate cell width inside the simulated device frame.
 */
export function adminTradeInlinePreviewCellWidthPx(
  device: AdminBannerPreviewDevice
): number {
  const outer = adminBannerPreviewDeviceOuterWidthPx(device);
  if (device === "phone") return Math.floor((outer - 24) / 2);
  if (device === "tablet_portrait") return Math.floor((outer - 40) / 3);
  return Math.floor((outer - 48) / 4);
}
