/**
 * DIBAY Intro (launch intro) — the ONE canonical document schema (contract §1).
 * Admin preview, Android and iOS render this same JSON with the same renderer.
 * No platform-specific fields or documents. Pure module (server + client).
 *
 * FIRST VERTICAL SLICE: exactly one scene (background, one image, text, one internal CTA, duration).
 * The schema is `scenes[]` from day one so expansion needs no migration.
 */

export const LAUNCH_INTRO_SCHEMA_VERSION = 1 as const;
export const LAUNCH_INTRO_MAX_SCENES_SLICE = 1;
export const LAUNCH_INTRO_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const LAUNCH_INTRO_IMAGE_MIN_EDGE = 64;
export const LAUNCH_INTRO_IMAGE_MAX_EDGE = 4096;
export const LAUNCH_INTRO_DURATION_MIN_MS = 1000;
export const LAUNCH_INTRO_DURATION_MAX_MS = 10000;
export const LAUNCH_INTRO_DURATION_DEFAULT_MS = 3000;
export const LAUNCH_INTRO_TEXT_MAX = 80;
export const LAUNCH_INTRO_CTA_LABEL_MAX = 24;
export const LAUNCH_INTRO_CTA_PATH_MAX = 200;

export const LAUNCH_INTRO_PUBLIC_BUCKET = "launch-intro-assets";
export const LAUNCH_INTRO_DRAFT_BUCKET = "launch-intro-drafts";

export type LaunchIntroImageMime = "image/png" | "image/jpeg" | "image/webp";

export type LaunchIntroImageRef = {
  sha256: string;
  mime: LaunchIntroImageMime;
  bytes: number;
  width: number;
  height: number;
  /** Draft only: private storage object path. Never present in a publication. */
  draftPath?: string;
};

export type LaunchIntroScene = {
  id: string;
  background: string;
  image: LaunchIntroImageRef | null;
  text: { value: string; color: string } | null;
  cta: { label: string; path: string } | null;
  durationMs: number;
};

export type LaunchIntroDocument = {
  schemaVersion: typeof LAUNCH_INTRO_SCHEMA_VERSION;
  scenes: LaunchIntroScene[];
};

/** Publication asset manifest entry (content-addressed, immutable). */
export type LaunchIntroAsset = {
  sha256: string;
  mime: LaunchIntroImageMime;
  bytes: number;
  path: string;
};

/** Slice eligibility: native app, every_launch. startAt/endAt reserved for the schedule step. */
export type LaunchIntroEligibility = {
  frequency: "every_launch";
  startAt?: string | null;
  endAt?: string | null;
};

export const LAUNCH_INTRO_SLICE_ELIGIBILITY: LaunchIntroEligibility = { frequency: "every_launch" };

export type LaunchIntroLiveState = "active" | "paused" | "unpublished";

/** Runtime discovery payload (GET /api/launch-intro/live). */
export type LaunchIntroLivePayload = {
  ok: true;
  revision: number;
  state: LaunchIntroLiveState;
  publication: {
    id: string;
    document: LaunchIntroDocument;
    assets: Array<LaunchIntroAsset & { url: string }>;
    eligibility: LaunchIntroEligibility;
  } | null;
};

const HEX_RE = /^#[0-9A-F]{6}$/;
const SHA_RE = /^[0-9a-f]{64}$/;
const MIMES: readonly LaunchIntroImageMime[] = ["image/png", "image/jpeg", "image/webp"];

export function normalizeLaunchIntroHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let s = value.trim().toUpperCase();
  if (!s.startsWith("#")) s = `#${s}`;
  if (/^#[0-9A-F]{3}$/.test(s)) s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return HEX_RE.test(s) ? s : null;
}

/** Internal app route only: starts with a single "/", no scheme, no "//", no backslash, no control chars. */
export function isLaunchIntroInternalPath(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length < 1 || value.length > LAUNCH_INTRO_CTA_PATH_MAX) return false;
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  if (/[\\\s\u0000-\u001f]/.test(value)) return false;
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(value)) return false;
  return true;
}

export function launchIntroAssetExtension(mime: LaunchIntroImageMime): string {
  return mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : "webp";
}

export function launchIntroPublicAssetPath(sha256: string, mime: LaunchIntroImageMime): string {
  return `pub/${sha256}.${launchIntroAssetExtension(mime)}`;
}

export function emptyLaunchIntroDocument(): LaunchIntroDocument {
  return {
    schemaVersion: LAUNCH_INTRO_SCHEMA_VERSION,
    scenes: [
      {
        id: "scene-1",
        background: "#075740",
        image: null,
        text: null,
        cta: null,
        durationMs: LAUNCH_INTRO_DURATION_DEFAULT_MS,
      },
    ],
  };
}

export type LaunchIntroValidation =
  | { ok: true; document: LaunchIntroDocument }
  | { ok: false; error: string };

function validateImage(raw: unknown, mode: "draft" | "publication"): LaunchIntroImageRef | string | null {
  if (raw == null) return null;
  if (typeof raw !== "object") return "image_invalid";
  const o = raw as Record<string, unknown>;
  const sha = typeof o.sha256 === "string" ? o.sha256 : "";
  const mime = o.mime as LaunchIntroImageMime;
  const bytes = Number(o.bytes);
  const width = Number(o.width);
  const height = Number(o.height);
  if (!SHA_RE.test(sha)) return "image_sha_invalid";
  if (!MIMES.includes(mime)) return "image_mime_invalid";
  if (!Number.isInteger(bytes) || bytes <= 0 || bytes > LAUNCH_INTRO_IMAGE_MAX_BYTES) return "image_bytes_invalid";
  for (const edge of [width, height]) {
    if (!Number.isInteger(edge) || edge < LAUNCH_INTRO_IMAGE_MIN_EDGE || edge > LAUNCH_INTRO_IMAGE_MAX_EDGE) {
      return "image_size_invalid";
    }
  }
  const ref: LaunchIntroImageRef = { sha256: sha, mime, bytes, width, height };
  if (mode === "draft") {
    if (typeof o.draftPath !== "string" || !/^draft\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(o.draftPath)) {
      return "image_draft_path_invalid";
    }
    ref.draftPath = o.draftPath;
  }
  return ref;
}

/**
 * Validates and normalizes a document. `draft` mode accepts empty optional parts;
 * `publication` mode additionally requires a publishable scene (image or text) and no draft paths.
 */
export function validateLaunchIntroDocument(
  raw: unknown,
  mode: "draft" | "publication"
): LaunchIntroValidation {
  if (raw == null || typeof raw !== "object") return { ok: false, error: "document_invalid" };
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== LAUNCH_INTRO_SCHEMA_VERSION) return { ok: false, error: "schema_version_unknown" };
  if (!Array.isArray(o.scenes)) return { ok: false, error: "scenes_invalid" };
  if (o.scenes.length !== LAUNCH_INTRO_MAX_SCENES_SLICE) return { ok: false, error: "scenes_count_invalid" };

  const scenes: LaunchIntroScene[] = [];
  for (const rawScene of o.scenes) {
    if (rawScene == null || typeof rawScene !== "object") return { ok: false, error: "scene_invalid" };
    const sc = rawScene as Record<string, unknown>;
    const id = typeof sc.id === "string" && /^[a-z0-9-]{1,40}$/.test(sc.id) ? sc.id : null;
    if (!id) return { ok: false, error: "scene_id_invalid" };
    const background = normalizeLaunchIntroHex(sc.background);
    if (!background) return { ok: false, error: "background_invalid" };

    const image = validateImage(sc.image, mode);
    if (typeof image === "string") return { ok: false, error: image };

    let text: LaunchIntroScene["text"] = null;
    if (sc.text != null) {
      const t = sc.text as Record<string, unknown>;
      const value = typeof t.value === "string" ? t.value.trim() : "";
      const color = normalizeLaunchIntroHex(t.color);
      if (!color) return { ok: false, error: "text_color_invalid" };
      if (value.length > LAUNCH_INTRO_TEXT_MAX) return { ok: false, error: "text_too_long" };
      text = value ? { value, color } : null;
    }

    let cta: LaunchIntroScene["cta"] = null;
    if (sc.cta != null) {
      const c = sc.cta as Record<string, unknown>;
      const label = typeof c.label === "string" ? c.label.trim() : "";
      const path = typeof c.path === "string" ? c.path.trim() : "";
      if (label || path) {
        if (!label || label.length > LAUNCH_INTRO_CTA_LABEL_MAX) return { ok: false, error: "cta_label_invalid" };
        if (!isLaunchIntroInternalPath(path)) return { ok: false, error: "cta_path_invalid" };
        cta = { label, path };
      }
    }

    const durationMs = Number(sc.durationMs);
    if (
      !Number.isInteger(durationMs) ||
      durationMs < LAUNCH_INTRO_DURATION_MIN_MS ||
      durationMs > LAUNCH_INTRO_DURATION_MAX_MS
    ) {
      return { ok: false, error: "duration_invalid" };
    }

    if (mode === "publication" && !image && !text) return { ok: false, error: "scene_empty" };
    scenes.push({ id, background, image, text, cta, durationMs });
  }
  return { ok: true, document: { schemaVersion: LAUNCH_INTRO_SCHEMA_VERSION, scenes } };
}

/** Draft → publication document: strips draft-only storage paths. */
export function toPublicationDocument(draft: LaunchIntroDocument): LaunchIntroDocument {
  return {
    schemaVersion: draft.schemaVersion,
    scenes: draft.scenes.map((s) => ({
      ...s,
      image: s.image
        ? { sha256: s.image.sha256, mime: s.image.mime, bytes: s.image.bytes, width: s.image.width, height: s.image.height }
        : null,
    })),
  };
}

export function launchIntroDocumentAssets(doc: LaunchIntroDocument): LaunchIntroAsset[] {
  const seen = new Map<string, LaunchIntroAsset>();
  for (const s of doc.scenes) {
    if (s.image && !seen.has(s.image.sha256)) {
      seen.set(s.image.sha256, {
        sha256: s.image.sha256,
        mime: s.image.mime,
        bytes: s.image.bytes,
        path: launchIntroPublicAssetPath(s.image.sha256, s.image.mime),
      });
    }
  }
  return [...seen.values()];
}

/** Image header sniff (PNG / JPEG / WebP) → mime + dimensions. Pure, no decoding. */
export function sniffLaunchIntroImage(
  bytes: Uint8Array
): { mime: LaunchIntroImageMime; width: number; height: number } | null {
  const u32 = (o: number) => ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0;
  const u16be = (o: number) => (bytes[o] << 8) | bytes[o + 1];
  const u16le = (o: number) => bytes[o] | (bytes[o + 1] << 8);
  const u24le = (o: number) => bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16);
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { mime: "image/png", width: u32(16), height: u32(20) };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let o = 2;
    while (o + 9 < bytes.length) {
      if (bytes[o] !== 0xff) return null;
      const marker = bytes[o + 1];
      const len = u16be(o + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { mime: "image/jpeg", width: u16be(o + 7), height: u16be(o + 5) };
      }
      o += 2 + len;
    }
    return null;
  }
  if (
    bytes.length >= 30 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (chunk === "VP8X") return { mime: "image/webp", width: u24le(24) + 1, height: u24le(27) + 1 };
    if (chunk === "VP8 ") return { mime: "image/webp", width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff };
    if (chunk === "VP8L") {
      const b = bytes;
      const width = 1 + (((b[22] & 0x3f) << 8) | b[21]);
      const height = 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6));
      return { mime: "image/webp", width, height };
    }
  }
  return null;
}
