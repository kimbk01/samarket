import { BUILT_IN_OS_ENTRY_CONFIG } from "@/lib/os-entry/defaults";
import {
  OS_ENTRY_IMAGE_FIT,
  OS_ENTRY_TEXT_ALIGNS,
  type OsEntryConfig,
  type OsEntryTextAlign,
} from "@/lib/os-entry/types";

function clamp01(n: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

function asHexColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const t = value.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(t)) return t.toUpperCase();
  if (/^#[0-9A-Fa-f]{3}$/.test(t)) {
    const r = t[1];
    const g = t[2];
    const b = t[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return fallback;
}

function asNullableString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function asTextAlign(value: unknown, fallback: OsEntryTextAlign): OsEntryTextAlign {
  if (typeof value !== "string") return fallback;
  const t = value.trim().toLowerCase();
  return (OS_ENTRY_TEXT_ALIGNS as readonly string[]).includes(t)
    ? (t as OsEntryTextAlign)
    : fallback;
}

function asIntMs(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(30_000, Math.round(n)));
}

function asRevision(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

/** Accept camelCase or snake_case DB / API payloads. */
export function normalizeOsEntryConfig(raw: unknown, base = BUILT_IN_OS_ENTRY_CONFIG): OsEntryConfig {
  if (raw == null || typeof raw !== "object") {
    return { ...base };
  }
  const p = raw as Record<string, unknown>;
  return {
    backgroundColor: asHexColor(p.backgroundColor ?? p.background_color, base.backgroundColor),
    imageUrl: asNullableString(p.imageUrl ?? p.image_url ?? p.image_public_url) ?? null,
    imageStoragePath:
      asNullableString(p.imageStoragePath ?? p.image_storage_path ?? p.image_asset) ?? null,
    imageSha256: asNullableString(p.imageSha256 ?? p.image_sha256) ?? null,
    imageMimeType: asNullableString(p.imageMimeType ?? p.image_mime_type) ?? null,
    imageByteLength: (() => {
      const v = p.imageByteLength ?? p.image_byte_length;
      if (v == null) return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
    })(),
    imageX: clamp01(Number(p.imageX ?? p.image_x ?? base.imageX), base.imageX),
    imageY: clamp01(Number(p.imageY ?? p.image_y ?? base.imageY), base.imageY),
    imageWidth: clamp01(Number(p.imageWidth ?? p.image_width ?? base.imageWidth), base.imageWidth),
    imageHeight: clamp01(
      Number(p.imageHeight ?? p.image_height ?? base.imageHeight),
      base.imageHeight
    ),
    imageFit: OS_ENTRY_IMAGE_FIT,
    text: typeof (p.text ?? p.text_content) === "string" ? String(p.text ?? p.text_content) : "",
    textX: clamp01(Number(p.textX ?? p.text_x ?? base.textX), base.textX),
    textY: clamp01(Number(p.textY ?? p.text_y ?? base.textY), base.textY),
    textWidth: clamp01(Number(p.textWidth ?? p.text_width ?? base.textWidth), base.textWidth),
    textSize: clamp01(Number(p.textSize ?? p.text_size ?? base.textSize), base.textSize),
    textAlign: asTextAlign(p.textAlign ?? p.text_align, base.textAlign),
    minimumVisibleMs: asIntMs(
      p.minimumVisibleMs ?? p.minimum_visible_ms,
      base.minimumVisibleMs
    ),
    revision: asRevision(p.revision, base.revision),
    updatedAt:
      typeof (p.updatedAt ?? p.updated_at) === "string"
        ? String(p.updatedAt ?? p.updated_at)
        : base.updatedAt,
  };
}

export function osEntryConfigToDbRow(config: OsEntryConfig, lane: "draft" | "live") {
  return {
    lane,
    background_color: config.backgroundColor,
    image_storage_path: config.imageStoragePath,
    image_public_url: config.imageUrl,
    image_sha256: config.imageSha256,
    image_mime_type: config.imageMimeType,
    image_byte_length: config.imageByteLength,
    image_x: config.imageX,
    image_y: config.imageY,
    image_width: config.imageWidth,
    image_height: config.imageHeight,
    image_fit: config.imageFit,
    text_content: config.text,
    text_x: config.textX,
    text_y: config.textY,
    text_width: config.textWidth,
    text_size: config.textSize,
    text_align: config.textAlign,
    minimum_visible_ms: config.minimumVisibleMs,
    revision: config.revision,
    updated_at: config.updatedAt,
  };
}

/**
 * LIVE bundle is valid only when image refs are complete together.
 * Bundled path (no storage) is OK. Remote requires path + url + sha256.
 */
export function isOsEntryBundleComplete(config: OsEntryConfig): boolean {
  if (!config.imageUrl && !config.imageStoragePath) return true;
  if (config.imageUrl?.startsWith("/")) return true;
  if (!config.imageStoragePath || !config.imageUrl || !config.imageSha256) return false;
  return true;
}
