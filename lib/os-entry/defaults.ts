import { DESIGN_SYSTEM_BRAND } from "@/lib/ui/design-system-hard-lock";
import type { OsEntryConfig } from "@/lib/os-entry/types";

/** Bundled mark — first-install / cache-miss only. Not Admin LIVE. */
export const OS_ENTRY_BUNDLED_MARK_PATH = "/os-entry/dibay-mark.png" as const;

/** Minimal bridge — not marketing hold. */
export const OS_ENTRY_DEFAULT_MINIMUM_VISIBLE_MS = 400 as const;

export const OS_ENTRY_STORAGE_BUCKET = "os-entry-media" as const;

export const OS_ENTRY_LOCAL_STORAGE_KEY = "dibay:os-entry:active-bundle-v1" as const;

export function createBuiltInOsEntryConfig(nowIso = "1970-01-01T00:00:00.000Z"): OsEntryConfig {
  return {
    backgroundColor: DESIGN_SYSTEM_BRAND.primaryHex,
    imageUrl: OS_ENTRY_BUNDLED_MARK_PATH,
    imageStoragePath: null,
    imageSha256: null,
    imageMimeType: "image/png",
    imageByteLength: null,
    imageX: 0.5,
    imageY: 0.42,
    imageWidth: 0.36,
    imageHeight: 0.36,
    imageFit: "contain",
    text: "",
    textX: 0.5,
    textY: 0.72,
    textWidth: 0.8,
    textSize: 0.045,
    textAlign: "center",
    minimumVisibleMs: OS_ENTRY_DEFAULT_MINIMUM_VISIBLE_MS,
    revision: 0,
    updatedAt: nowIso,
  };
}

export const BUILT_IN_OS_ENTRY_CONFIG: OsEntryConfig = createBuiltInOsEntryConfig();
