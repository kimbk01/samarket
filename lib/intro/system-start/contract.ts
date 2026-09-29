/**
 * System Start durable contract (F1/F2 freeze).
 * Free x/y, arbitrary fit, full-bleed BG image, minVisibleMs=0 — FORBIDDEN.
 */

export type BrandSizePreset = "S" | "M" | "L";

export const BRAND_SIZE_PRESETS: BrandSizePreset[] = ["S", "M", "L"];

/** Maps preset → normalized brand mark size for native materializer. */
export const BRAND_SIZE_NORM: Record<BrandSizePreset, number> = {
  S: 0.18,
  M: 0.28,
  L: 0.4,
};

export const SYSTEM_START_MIN_VISIBLE_MS_MIN = 500;
export const SYSTEM_START_MIN_VISIBLE_MS_MAX = 5000;

export const SYSTEM_START_MIN_VISIBLE_PRESETS_MS = [
  500, 1000, 1500, 2000, 3000, 4000, 5000,
] as const;

export type SystemStartNextBuild = {
  revision: number;
  backgroundColor: string;
  brandAssetEnabled: boolean;
  brandAssetMediaId: string | null;
  brandSizePreset: BrandSizePreset;
  minVisibleMs: number;
  updatedAt: string;
  brandPreviewUrl: string | null;
};

export type SystemStartInstalled = {
  revision: number;
  backgroundColor: string;
  brandAssetEnabled: boolean;
  brandAssetMediaId: string | null;
  brandSizePreset: BrandSizePreset;
  minVisibleMs: number;
  materializedAt: string;
  brandPreviewUrl: string | null;
};

export function normalizeHexColor(input: string): string | null {
  const h = String(input || "")
    .trim()
    .replace(/^#/, "")
    .toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(h)) return null;
  return `#${h}`;
}

export function normalizeBrandSizePreset(raw: unknown): BrandSizePreset {
  if (raw === "S" || raw === "M" || raw === "L") return raw;
  return "M";
}

export function normalizeMinVisibleMs(raw: unknown, fallback = 500): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  const clamped = Math.min(
    SYSTEM_START_MIN_VISIBLE_MS_MAX,
    Math.max(SYSTEM_START_MIN_VISIBLE_MS_MIN, n),
  );
  let best: number = SYSTEM_START_MIN_VISIBLE_PRESETS_MS[0];
  let bestDist = Math.abs(clamped - best);
  for (const p of SYSTEM_START_MIN_VISIBLE_PRESETS_MS) {
    const d = Math.abs(clamped - p);
    if (d < bestDist) {
      best = p;
      bestDist = d;
    }
  }
  return best;
}
