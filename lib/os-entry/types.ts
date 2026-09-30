/**
 * DIBAY R16 — Product OS Start Screen (os-entry).
 * REAL OS primitive ≠ this domain ≠ Intro.
 */

export const OS_ENTRY_IMAGE_FIT = "contain" as const;
export type OsEntryImageFit = typeof OS_ENTRY_IMAGE_FIT;

export const OS_ENTRY_TEXT_ALIGNS = ["left", "center", "right"] as const;
export type OsEntryTextAlign = (typeof OS_ENTRY_TEXT_ALIGNS)[number];

export type OsEntryLane = "draft" | "live";

/** Normalized geometry: all 0..1 relative to viewport. */
export type OsEntryConfig = {
  backgroundColor: string;
  /** Persistable public URL or bundled path (`/os-entry/...`). null = no image. */
  imageUrl: string | null;
  /** Storage path when remote; null for bundled/default. */
  imageStoragePath: string | null;
  imageSha256: string | null;
  imageMimeType: string | null;
  imageByteLength: number | null;
  imageX: number;
  imageY: number;
  imageWidth: number;
  imageHeight: number;
  imageFit: OsEntryImageFit;
  text: string;
  textX: number;
  textY: number;
  textWidth: number;
  textSize: number;
  textAlign: OsEntryTextAlign;
  minimumVisibleMs: number;
  revision: number;
  updatedAt: string;
};

export type OsEntryLocalBundle = {
  revision: number;
  config: OsEntryConfig;
  /** Local image bytes as data URL for cold paint without network. */
  imageDataUrl: string | null;
};

export type OsEntryAdminSnapshot = {
  draft: OsEntryConfig;
  live: OsEntryConfig;
};
