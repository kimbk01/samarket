/**
 * System Start durable contract (F1/F2 freeze + ONE CORRECTION BATCH).
 * Free x/y, arbitrary fit, full-bleed BG image, minVisibleMs=0 — FORBIDDEN.
 * Admin minVisibleMs: fail-closed on out-of-contract values (no silent clamp).
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

export type SystemStartMinVisibleMs =
  (typeof SYSTEM_START_MIN_VISIBLE_PRESETS_MS)[number];

export type SystemStartNextBuild = {
  revision: number;
  backgroundColor: string;
  /** Layer B — optional full-bleed / cover background image (live Apply). */
  backgroundImageMediaId: string | null;
  backgroundImagePreviewUrl: string | null;
  brandAssetEnabled: boolean;
  brandAssetMediaId: string | null;
  brandSizePreset: BrandSizePreset;
  /** Normalized brand center (0..1). */
  brandXNorm: number;
  brandYNorm: number;
  minVisibleMs: number;
  updatedAt: string;
  brandPreviewUrl: string | null;
};

export type SystemStartInstalled = {
  revision: number;
  backgroundColor: string;
  backgroundImageMediaId: string | null;
  backgroundImagePreviewUrl: string | null;
  brandAssetEnabled: boolean;
  brandAssetMediaId: string | null;
  brandSizePreset: BrandSizePreset;
  brandXNorm: number;
  brandYNorm: number;
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

export function parseBrandSizePreset(raw: unknown): BrandSizePreset | null {
  if (raw === "S" || raw === "M" || raw === "L") return raw;
  return null;
}

/** Fail-closed: only exact contract presets. */
export function parseMinVisibleMs(raw: unknown): SystemStartMinVisibleMs | null {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return null;
  for (const p of SYSTEM_START_MIN_VISIBLE_PRESETS_MS) {
    if (p === n) return p;
  }
  return null;
}

/**
 * Read-path coerce for already-persisted rows only.
 * Write path must use parseMinVisibleMs (fail-closed).
 */
export function coerceMinVisibleMsForRead(raw: unknown, fallback = 500): number {
  const parsed = parseMinVisibleMs(raw);
  if (parsed != null) return parsed;
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

/** @deprecated Use parseBrandSizePreset (writes) or coerce for reads. */
export function normalizeBrandSizePreset(raw: unknown): BrandSizePreset {
  return parseBrandSizePreset(raw) ?? "M";
}

/** @deprecated Use parseMinVisibleMs on writes; coerceMinVisibleMsForRead on reads. */
export function normalizeMinVisibleMs(raw: unknown, fallback = 500): number {
  return coerceMinVisibleMsForRead(raw, fallback);
}
