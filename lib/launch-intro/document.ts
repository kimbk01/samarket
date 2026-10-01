/**
 * DIBAY Intro (launch intro) — the ONE canonical document schema (contract §1).
 * Admin preview, Android and iOS render this same JSON with the same renderer.
 * No platform-specific fields or documents. Pure module (server + client).
 *
 * Schema v2 (expansion P1): multi-scene, headline + supporting text presets, CTA action types
 * (route | next), Skip on/off. v1 documents (first vertical slice: one scene) are read through
 * `upgradeLaunchIntroDocumentV1` — immutable v1 publications stay as stored; every reader
 * (Admin, server payload, device cache) normalizes through `validateLaunchIntroDocument`.
 */

export const LAUNCH_INTRO_SCHEMA_VERSION = 2 as const;
export const LAUNCH_INTRO_SCHEMA_VERSION_V1 = 1 as const;
export const LAUNCH_INTRO_MAX_SCENES = 8;
export const LAUNCH_INTRO_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const LAUNCH_INTRO_IMAGE_MIN_EDGE = 64;
export const LAUNCH_INTRO_IMAGE_MAX_EDGE = 4096;
export const LAUNCH_INTRO_DURATION_MIN_MS = 1000;
export const LAUNCH_INTRO_DURATION_MAX_MS = 10000;
export const LAUNCH_INTRO_DURATION_DEFAULT_MS = 3000;
/** Headline keeps the v1 text limit so every v1 document upgrades losslessly. Short copy is recommended in Admin. */
export const LAUNCH_INTRO_HEADLINE_MAX = 80;
export const LAUNCH_INTRO_SUPPORTING_MAX = 120;
export const LAUNCH_INTRO_CTA_LABEL_MAX = 24;
export const LAUNCH_INTRO_CTA_PATH_MAX = 200;
export const LAUNCH_INTRO_DEFAULT_BACKGROUND = "#075740";

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

export const LAUNCH_INTRO_TEXT_SIZES = ["S", "M", "L", "XL"] as const;
export type LaunchIntroTextSize = (typeof LAUNCH_INTRO_TEXT_SIZES)[number];
export const LAUNCH_INTRO_TEXT_WEIGHTS = ["regular", "bold"] as const;
export type LaunchIntroTextWeight = (typeof LAUNCH_INTRO_TEXT_WEIGHTS)[number];
export const LAUNCH_INTRO_TEXT_ALIGNS = ["center", "left"] as const;
export type LaunchIntroTextAlign = (typeof LAUNCH_INTRO_TEXT_ALIGNS)[number];

export type LaunchIntroTextStyle = {
  value: string;
  size: LaunchIntroTextSize;
  weight: LaunchIntroTextWeight;
  color: string;
};

export type LaunchIntroSceneText = {
  headline: LaunchIntroTextStyle | null;
  supporting: LaunchIntroTextStyle | null;
  align: LaunchIntroTextAlign;
};

/** route = leave the Intro to an internal path (exit latch). next = go to the next scene (no exit). */
export type LaunchIntroCtaAction = { type: "route"; path: string } | { type: "next" };

/**
 * Safe compositions (P2). The renderer owns the geometry; Admin only picks one.
 * stack = visual, then text, centered (first slice look) · fullbleed = visual fills the scene, text
 * at the bottom over a soft shade · logo = logo first, large, then text.
 */
export const LAUNCH_INTRO_LAYOUTS = ["stack", "fullbleed", "logo"] as const;
export type LaunchIntroLayout = (typeof LAUNCH_INTRO_LAYOUTS)[number];
/** contain = whole image, aspect kept, never cut (default) · cover = fills its box, edges cropped (explicit). */
export const LAUNCH_INTRO_FITS = ["contain", "cover"] as const;
export type LaunchIntroFit = (typeof LAUNCH_INTRO_FITS)[number];
export const LAUNCH_INTRO_ENTER_MOTIONS = ["none", "fade", "slide-up", "scale"] as const;
export type LaunchIntroEnterMotion = (typeof LAUNCH_INTRO_ENTER_MOTIONS)[number];
export const LAUNCH_INTRO_TRANSITIONS = ["none", "fade", "slide"] as const;
export type LaunchIntroTransition = (typeof LAUNCH_INTRO_TRANSITIONS)[number];
export const LAUNCH_INTRO_DECORATION_SLOTS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;
export type LaunchIntroDecorationSlot = (typeof LAUNCH_INTRO_DECORATION_SLOTS)[number];
export const LAUNCH_INTRO_DECORATION_SIZES = ["S", "M"] as const;
export type LaunchIntroDecorationSize = (typeof LAUNCH_INTRO_DECORATION_SIZES)[number];
export const LAUNCH_INTRO_MAX_DECORATIONS = 3;

export type LaunchIntroDecoration = {
  asset: LaunchIntroImageRef;
  slot: LaunchIntroDecorationSlot;
  size: LaunchIntroDecorationSize;
};

export type LaunchIntroScene = {
  id: string;
  layout: LaunchIntroLayout;
  background: { color: string; media: { asset: LaunchIntroImageRef; fit: LaunchIntroFit } | null };
  media: { asset: LaunchIntroImageRef; fit: LaunchIntroFit } | null;
  logo: { asset: LaunchIntroImageRef } | null;
  decorations: LaunchIntroDecoration[];
  text: LaunchIntroSceneText | null;
  cta: { label: string; action: LaunchIntroCtaAction } | null;
  /** enter = how the scene's parts appear; float = gentle idle motion of the main visual. */
  motion: { enter: LaunchIntroEnterMotion; float: boolean };
  /** How this scene replaces the previous one (ignored for the first scene). */
  transition: LaunchIntroTransition;
  durationMs: number;
};

export type LaunchIntroSettings = { skip: { enabled: boolean } };

export type LaunchIntroDocument = {
  schemaVersion: typeof LAUNCH_INTRO_SCHEMA_VERSION;
  settings: LaunchIntroSettings;
  scenes: LaunchIntroScene[];
};

/** Publication asset manifest entry (content-addressed, immutable). */
export type LaunchIntroAsset = {
  sha256: string;
  mime: LaunchIntroImageMime;
  bytes: number;
  path: string;
};

/** Eligibility: native app, every_launch. startAt/endAt reserved for the schedule phase. */
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

export function newLaunchIntroSceneId(existing: readonly string[]): string {
  let n = existing.length + 1;
  while (existing.includes(`scene-${n}`)) n += 1;
  return `scene-${n}`;
}

export function emptyLaunchIntroScene(id: string): LaunchIntroScene {
  return {
    id,
    layout: "stack",
    background: { color: LAUNCH_INTRO_DEFAULT_BACKGROUND, media: null },
    media: null,
    logo: null,
    decorations: [],
    text: null,
    cta: null,
    motion: { enter: "fade", float: false },
    transition: "fade",
    durationMs: LAUNCH_INTRO_DURATION_DEFAULT_MS,
  };
}

export function emptyLaunchIntroDocument(): LaunchIntroDocument {
  return {
    schemaVersion: LAUNCH_INTRO_SCHEMA_VERSION,
    settings: { skip: { enabled: true } },
    scenes: [emptyLaunchIntroScene("scene-1")],
  };
}

export type LaunchIntroValidation =
  | { ok: true; document: LaunchIntroDocument }
  | { ok: false; error: string };

/**
 * v1 (first vertical slice) → v2, structurally, before validation. Same visual meaning:
 * text → headline L bold centered, image → media contain, cta path → route action, Skip shown.
 */
export function upgradeLaunchIntroDocumentV1(raw: Record<string, unknown>): Record<string, unknown> {
  const scenes = Array.isArray(raw.scenes) ? raw.scenes : [];
  return {
    schemaVersion: LAUNCH_INTRO_SCHEMA_VERSION,
    settings: { skip: { enabled: true } },
    scenes: scenes.map((rawScene) => {
      const sc = (rawScene ?? {}) as Record<string, unknown>;
      const text = sc.text as { value?: unknown; color?: unknown } | null | undefined;
      const cta = sc.cta as { label?: unknown; path?: unknown } | null | undefined;
      return {
        id: sc.id,
        background: { color: sc.background },
        media: sc.image ? { asset: sc.image, fit: "contain" } : null,
        text:
          text && typeof text.value === "string" && text.value.trim()
            ? {
                headline: { value: text.value, size: "L", weight: "bold", color: text.color },
                supporting: null,
                align: "center",
              }
            : null,
        cta: cta ? { label: cta.label, action: { type: "route", path: cta.path } } : null,
        durationMs: sc.durationMs,
      };
    }),
  };
}

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

function validateFittedImage(
  raw: unknown,
  mode: "draft" | "publication",
  field: string
): { asset: LaunchIntroImageRef; fit: LaunchIntroFit } | null | string {
  if (raw == null) return null;
  const m = raw as { asset?: unknown; fit?: unknown };
  const fit = m.fit as LaunchIntroFit;
  if (!LAUNCH_INTRO_FITS.includes(fit)) return `${field}_fit_invalid`;
  const asset = validateImage(m.asset, mode);
  if (typeof asset === "string") return asset;
  return asset ? { asset, fit } : null;
}

function validateTextStyle(raw: unknown, max: number, field: string): LaunchIntroTextStyle | string | null {
  if (raw == null) return null;
  if (typeof raw !== "object") return `${field}_invalid`;
  const t = raw as Record<string, unknown>;
  const value = typeof t.value === "string" ? t.value.trim() : "";
  if (!value) return null;
  if (value.length > max) return `${field}_too_long`;
  const color = normalizeLaunchIntroHex(t.color);
  if (!color) return `${field}_color_invalid`;
  const size = t.size as LaunchIntroTextSize;
  if (!LAUNCH_INTRO_TEXT_SIZES.includes(size)) return `${field}_size_invalid`;
  const weight = t.weight as LaunchIntroTextWeight;
  if (!LAUNCH_INTRO_TEXT_WEIGHTS.includes(weight)) return `${field}_weight_invalid`;
  return { value, size, weight, color };
}

/**
 * Validates and normalizes a document (v1 is upgraded first). `draft` mode accepts empty optional
 * parts; `publication` mode requires every scene to show something (media or text) and no draft paths.
 */
export function validateLaunchIntroDocument(
  raw: unknown,
  mode: "draft" | "publication"
): LaunchIntroValidation {
  if (raw == null || typeof raw !== "object") return { ok: false, error: "document_invalid" };
  let o = raw as Record<string, unknown>;
  if (o.schemaVersion === LAUNCH_INTRO_SCHEMA_VERSION_V1) o = upgradeLaunchIntroDocumentV1(o);
  if (o.schemaVersion !== LAUNCH_INTRO_SCHEMA_VERSION) return { ok: false, error: "schema_version_unknown" };
  if (!Array.isArray(o.scenes)) return { ok: false, error: "scenes_invalid" };
  if (o.scenes.length < 1 || o.scenes.length > LAUNCH_INTRO_MAX_SCENES) {
    return { ok: false, error: "scenes_count_invalid" };
  }

  const rawSettings = (o.settings ?? {}) as { skip?: { enabled?: unknown } };
  if (typeof rawSettings.skip?.enabled !== "boolean") return { ok: false, error: "settings_invalid" };
  const settings: LaunchIntroSettings = { skip: { enabled: rawSettings.skip.enabled } };

  const scenes: LaunchIntroScene[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < o.scenes.length; index += 1) {
    const rawScene = o.scenes[index];
    if (rawScene == null || typeof rawScene !== "object") return { ok: false, error: "scene_invalid" };
    const sc = rawScene as Record<string, unknown>;
    const id = typeof sc.id === "string" && /^[a-z0-9-]{1,40}$/.test(sc.id) ? sc.id : null;
    if (!id) return { ok: false, error: "scene_id_invalid" };
    if (ids.has(id)) return { ok: false, error: "scene_id_duplicate" };
    ids.add(id);

    // P2 fields are optional on read; absent = the P1 look (stack, no motion, no transition).
    const layout = (sc.layout ?? "stack") as LaunchIntroLayout;
    if (!LAUNCH_INTRO_LAYOUTS.includes(layout)) return { ok: false, error: "layout_invalid" };

    const bg = (sc.background ?? {}) as { color?: unknown; media?: unknown };
    const color = normalizeLaunchIntroHex(bg.color);
    if (!color) return { ok: false, error: "background_invalid" };
    const bgMedia = validateFittedImage(bg.media, mode, "background_media");
    if (typeof bgMedia === "string") return { ok: false, error: bgMedia };

    const media = validateFittedImage(sc.media, mode, "media");
    if (typeof media === "string") return { ok: false, error: media };

    let logo: LaunchIntroScene["logo"] = null;
    if (sc.logo != null) {
      const asset = validateImage((sc.logo as { asset?: unknown }).asset, mode);
      if (typeof asset === "string") return { ok: false, error: asset };
      logo = asset ? { asset } : null;
    }
    if (layout === "logo" && !logo) return { ok: false, error: "layout_logo_requires_logo" };

    const decorations: LaunchIntroDecoration[] = [];
    if (sc.decorations != null) {
      if (!Array.isArray(sc.decorations) || sc.decorations.length > LAUNCH_INTRO_MAX_DECORATIONS) {
        return { ok: false, error: "decorations_invalid" };
      }
      const slots = new Set<string>();
      for (const rawDeco of sc.decorations) {
        const d = (rawDeco ?? {}) as { asset?: unknown; slot?: unknown; size?: unknown };
        const asset = validateImage(d.asset, mode);
        if (typeof asset === "string") return { ok: false, error: asset };
        if (!asset) return { ok: false, error: "decoration_asset_missing" };
        const slot = d.slot as LaunchIntroDecorationSlot;
        if (!LAUNCH_INTRO_DECORATION_SLOTS.includes(slot) || slots.has(slot)) {
          return { ok: false, error: "decoration_slot_invalid" };
        }
        slots.add(slot);
        const size = d.size as LaunchIntroDecorationSize;
        if (!LAUNCH_INTRO_DECORATION_SIZES.includes(size)) return { ok: false, error: "decoration_size_invalid" };
        decorations.push({ asset, slot, size });
      }
    }

    const rawMotion = (sc.motion ?? { enter: "none", float: false }) as { enter?: unknown; float?: unknown };
    const enter = rawMotion.enter as LaunchIntroEnterMotion;
    if (!LAUNCH_INTRO_ENTER_MOTIONS.includes(enter) || typeof rawMotion.float !== "boolean") {
      return { ok: false, error: "motion_invalid" };
    }
    const transition = (sc.transition ?? "none") as LaunchIntroTransition;
    if (!LAUNCH_INTRO_TRANSITIONS.includes(transition)) return { ok: false, error: "transition_invalid" };

    let text: LaunchIntroScene["text"] = null;
    if (sc.text != null) {
      const t = sc.text as { headline?: unknown; supporting?: unknown; align?: unknown };
      const headline = validateTextStyle(t.headline, LAUNCH_INTRO_HEADLINE_MAX, "headline");
      if (typeof headline === "string") return { ok: false, error: headline };
      const supporting = validateTextStyle(t.supporting, LAUNCH_INTRO_SUPPORTING_MAX, "supporting");
      if (typeof supporting === "string") return { ok: false, error: supporting };
      const align = t.align as LaunchIntroTextAlign;
      if (!LAUNCH_INTRO_TEXT_ALIGNS.includes(align)) return { ok: false, error: "text_align_invalid" };
      text = headline || supporting ? { headline, supporting, align } : null;
    }

    let cta: LaunchIntroScene["cta"] = null;
    if (sc.cta != null) {
      const c = sc.cta as { label?: unknown; action?: { type?: unknown; path?: unknown } };
      const label = typeof c.label === "string" ? c.label.trim() : "";
      const type = c.action?.type;
      const path = typeof c.action?.path === "string" ? c.action.path.trim() : "";
      const empty = !label && (type !== "route" || !path);
      if (!empty) {
        if (!label || label.length > LAUNCH_INTRO_CTA_LABEL_MAX) return { ok: false, error: "cta_label_invalid" };
        if (type === "route") {
          if (!isLaunchIntroInternalPath(path)) return { ok: false, error: "cta_path_invalid" };
          cta = { label, action: { type: "route", path } };
        } else if (type === "next") {
          if (index === o.scenes.length - 1) return { ok: false, error: "cta_next_on_last_scene" };
          cta = { label, action: { type: "next" } };
        } else {
          return { ok: false, error: "cta_action_invalid" };
        }
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

    if (mode === "publication" && !media && !text && !logo && !bgMedia) return { ok: false, error: "scene_empty" };
    scenes.push({
      id,
      layout,
      background: { color, media: bgMedia },
      media,
      logo,
      decorations,
      text,
      cta,
      motion: { enter, float: rawMotion.float },
      transition,
      durationMs,
    });
  }
  return { ok: true, document: { schemaVersion: LAUNCH_INTRO_SCHEMA_VERSION, settings, scenes } };
}

/** Every image reference in the document, in scene order (draft paths included when present). */
export function launchIntroDocumentImageRefs(doc: LaunchIntroDocument): LaunchIntroImageRef[] {
  const refs: LaunchIntroImageRef[] = [];
  for (const s of doc.scenes) {
    if (s.background.media) refs.push(s.background.media.asset);
    if (s.media) refs.push(s.media.asset);
    if (s.logo) refs.push(s.logo.asset);
    for (const d of s.decorations) refs.push(d.asset);
  }
  return refs;
}

function stripDraftPath(ref: LaunchIntroImageRef): LaunchIntroImageRef {
  return { sha256: ref.sha256, mime: ref.mime, bytes: ref.bytes, width: ref.width, height: ref.height };
}

/** Draft → publication document: strips draft-only storage paths. */
export function toPublicationDocument(draft: LaunchIntroDocument): LaunchIntroDocument {
  return {
    schemaVersion: draft.schemaVersion,
    settings: { skip: { enabled: draft.settings.skip.enabled } },
    scenes: draft.scenes.map((s) => ({
      ...s,
      background: {
        color: s.background.color,
        media: s.background.media ? { fit: s.background.media.fit, asset: stripDraftPath(s.background.media.asset) } : null,
      },
      media: s.media ? { fit: s.media.fit, asset: stripDraftPath(s.media.asset) } : null,
      logo: s.logo ? { asset: stripDraftPath(s.logo.asset) } : null,
      decorations: s.decorations.map((d) => ({ ...d, asset: stripDraftPath(d.asset) })),
    })),
  };
}

export function launchIntroDocumentAssets(doc: LaunchIntroDocument): LaunchIntroAsset[] {
  const seen = new Map<string, LaunchIntroAsset>();
  for (const ref of launchIntroDocumentImageRefs(doc)) {
    if (!seen.has(ref.sha256)) {
      seen.set(ref.sha256, {
        sha256: ref.sha256,
        mime: ref.mime,
        bytes: ref.bytes,
        path: launchIntroPublicAssetPath(ref.sha256, ref.mime),
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
