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
/** Owner decision (P3): each MP4 in a publication ≤ 5MB (mobile data). Enforced by upload, validator, publish. */
export const LAUNCH_INTRO_VIDEO_MAX_BYTES = 5 * 1024 * 1024;
export const LAUNCH_INTRO_VIDEO_MAX_DURATION_MS = 30_000;
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

/** Still or animated images. GIF animates as soon as it is shown; its first frame is what decode() proves. */
export type LaunchIntroImageMime = "image/png" | "image/jpeg" | "image/webp" | "image/gif";
export type LaunchIntroVideoMime = "video/mp4";
export type LaunchIntroAssetMime = LaunchIntroImageMime | LaunchIntroVideoMime;

export type LaunchIntroImageRef = {
  sha256: string;
  mime: LaunchIntroImageMime;
  bytes: number;
  width: number;
  height: number;
  /** Draft only: private storage object path. Never present in a publication. */
  draftPath?: string;
};

/** MP4 (H.264). Only ever used together with a poster image, which is the first meaningful frame. */
export type LaunchIntroVideoRef = {
  sha256: string;
  mime: LaunchIntroVideoMime;
  bytes: number;
  /** Display size (rotation applied). The poster must have the same aspect ratio. */
  width: number;
  height: number;
  durationMs: number;
  draftPath?: string;
};

/**
 * A visual slot (main media / background). `asset` is the image shown first — for a video it is the
 * poster: decoded before the OS release, shown until the video plays, and kept if it never does.
 */
export type LaunchIntroFittedMedia = { asset: LaunchIntroImageRef; fit: LaunchIntroFit; video: LaunchIntroVideoRef | null };

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
  background: { color: string; media: LaunchIntroFittedMedia | null };
  media: LaunchIntroFittedMedia | null;
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
  mime: LaunchIntroAssetMime;
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
const MIMES: readonly LaunchIntroImageMime[] = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const DRAFT_PATH_RE = /^draft\/[0-9a-f-]{36}\.(png|jpg|webp|gif|mp4)$/;

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

export function launchIntroAssetExtension(mime: LaunchIntroAssetMime): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "video/mp4":
      return "mp4";
  }
}

export function launchIntroPublicAssetPath(sha256: string, mime: LaunchIntroAssetMime): string {
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
    if (typeof o.draftPath !== "string" || !DRAFT_PATH_RE.test(o.draftPath)) {
      return "image_draft_path_invalid";
    }
    ref.draftPath = o.draftPath;
  }
  return ref;
}

function validateVideo(raw: unknown, mode: "draft" | "publication"): LaunchIntroVideoRef | string | null {
  if (raw == null) return null;
  if (typeof raw !== "object") return "video_invalid";
  const o = raw as Record<string, unknown>;
  const sha = typeof o.sha256 === "string" ? o.sha256 : "";
  const bytes = Number(o.bytes);
  const width = Number(o.width);
  const height = Number(o.height);
  const durationMs = Number(o.durationMs);
  if (!SHA_RE.test(sha)) return "video_sha_invalid";
  if (o.mime !== "video/mp4") return "video_mime_invalid";
  if (!Number.isInteger(bytes) || bytes <= 0 || bytes > LAUNCH_INTRO_VIDEO_MAX_BYTES) return "video_too_big";
  for (const edge of [width, height]) {
    if (!Number.isInteger(edge) || edge < LAUNCH_INTRO_IMAGE_MIN_EDGE || edge > LAUNCH_INTRO_IMAGE_MAX_EDGE) {
      return "video_size_invalid";
    }
  }
  if (!Number.isInteger(durationMs) || durationMs <= 0 || durationMs > LAUNCH_INTRO_VIDEO_MAX_DURATION_MS) {
    return "video_duration_invalid";
  }
  const ref: LaunchIntroVideoRef = { sha256: sha, mime: "video/mp4", bytes, width, height, durationMs };
  if (mode === "draft") {
    if (typeof o.draftPath !== "string" || !DRAFT_PATH_RE.test(o.draftPath) || !o.draftPath.endsWith(".mp4")) {
      return "video_draft_path_invalid";
    }
    ref.draftPath = o.draftPath;
  }
  return ref;
}

/** Poster and video must share the aspect ratio (≤1%), so the poster → video swap never jumps or distorts. */
export function launchIntroPosterMatchesVideo(poster: { width: number; height: number }, video: { width: number; height: number }): boolean {
  const a = poster.width / poster.height;
  const b = video.width / video.height;
  return Math.abs(a - b) / b <= 0.01;
}

function validateFittedImage(
  raw: unknown,
  mode: "draft" | "publication",
  field: string
): LaunchIntroFittedMedia | null | string {
  if (raw == null) return null;
  const m = raw as { asset?: unknown; fit?: unknown; video?: unknown };
  const fit = m.fit as LaunchIntroFit;
  if (!LAUNCH_INTRO_FITS.includes(fit)) return `${field}_fit_invalid`;
  const asset = validateImage(m.asset, mode);
  if (typeof asset === "string") return asset;
  const video = validateVideo(m.video, mode);
  if (typeof video === "string") return video;
  if (video && !asset) return "video_poster_required";
  if (video && asset && !launchIntroPosterMatchesVideo(asset, video)) return "video_poster_aspect_mismatch";
  return asset ? { asset, fit, video } : null;
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

/** Every video reference (scene order). */
export function launchIntroDocumentVideoRefs(doc: LaunchIntroDocument): LaunchIntroVideoRef[] {
  const refs: LaunchIntroVideoRef[] = [];
  for (const s of doc.scenes) {
    if (s.background.media?.video) refs.push(s.background.media.video);
    if (s.media?.video) refs.push(s.media.video);
  }
  return refs;
}

/** Every stored object the document needs (images, posters, videos): publish copy, manifest, signing, delete. */
export function launchIntroDocumentAllRefs(doc: LaunchIntroDocument): Array<LaunchIntroImageRef | LaunchIntroVideoRef> {
  return [...launchIntroDocumentImageRefs(doc), ...launchIntroDocumentVideoRefs(doc)];
}

/** Every image reference (images + video posters), in scene order. These are decoded before the first frame. */
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

function stripFitted(m: LaunchIntroFittedMedia | null): LaunchIntroFittedMedia | null {
  if (!m) return null;
  const v = m.video;
  return {
    fit: m.fit,
    asset: stripDraftPath(m.asset),
    video: v ? { sha256: v.sha256, mime: v.mime, bytes: v.bytes, width: v.width, height: v.height, durationMs: v.durationMs } : null,
  };
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
        media: stripFitted(s.background.media),
      },
      media: stripFitted(s.media),
      logo: s.logo ? { asset: stripDraftPath(s.logo.asset) } : null,
      decorations: s.decorations.map((d) => ({ ...d, asset: stripDraftPath(d.asset) })),
    })),
  };
}

export function launchIntroDocumentAssets(doc: LaunchIntroDocument): LaunchIntroAsset[] {
  const seen = new Map<string, LaunchIntroAsset>();
  for (const ref of launchIntroDocumentAllRefs(doc)) {
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
  if (
    bytes.length >= 10 &&
    bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61
  ) {
    return { mime: "image/gif", width: u16le(6), height: u16le(8) };
  }
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

/**
 * MP4 sniff (ISO BMFF box walk, no decoding): ftyp + moov → video track (hdlr 'vide') tkhd size with
 * rotation applied, mvhd duration, first sample entry codec. Only H.264 ('avc1'/'avc3') is accepted
 * so Android WebView and iOS WKWebView both play it.
 */
export function sniffLaunchIntroVideo(
  bytes: Uint8Array
): { mime: LaunchIntroVideoMime; width: number; height: number; durationMs: number; codec: string } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const type = (o: number) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  type Box = { type: string; start: number; end: number };
  const boxes = (from: number, to: number): Box[] => {
    const out: Box[] = [];
    let o = from;
    while (o + 8 <= to) {
      let size = view.getUint32(o);
      let header = 8;
      if (size === 1) {
        if (o + 16 > to) break;
        const hi = view.getUint32(o + 8);
        const lo = view.getUint32(o + 12);
        size = hi * 2 ** 32 + lo;
        header = 16;
      } else if (size === 0) {
        size = to - o;
      }
      if (size < header || o + size > to) break;
      out.push({ type: type(o + 4), start: o + header, end: o + size });
      o += size;
    }
    return out;
  };
  const child = (b: Box, t: string, skip = 0) => boxes(b.start + skip, b.end).find((x) => x.type === t) ?? null;

  const top = boxes(0, bytes.length);
  if (top[0]?.type !== "ftyp") return null;
  const moov = top.find((b) => b.type === "moov");
  if (!moov) return null;
  const mvhd = child(moov, "mvhd");
  if (!mvhd) return null;
  const mv1 = bytes[mvhd.start] === 1;
  const timescale = view.getUint32(mvhd.start + (mv1 ? 20 : 12));
  const duration = mv1
    ? view.getUint32(mvhd.start + 24) * 2 ** 32 + view.getUint32(mvhd.start + 28)
    : view.getUint32(mvhd.start + 16);
  if (!timescale) return null;

  for (const trak of boxes(moov.start, moov.end).filter((b) => b.type === "trak")) {
    const mdia = child(trak, "mdia");
    const hdlr = mdia ? child(mdia, "hdlr") : null;
    if (!hdlr || type(hdlr.start + 8) !== "vide") continue;
    const tkhd = child(trak, "tkhd");
    if (!tkhd) return null;
    const tk1 = bytes[tkhd.start] === 1;
    const matrixAt = tkhd.start + (tk1 ? 52 : 40);
    const a = view.getInt32(matrixAt);
    const b = view.getInt32(matrixAt + 4);
    let width = view.getUint32(tkhd.end - 8) >>> 16;
    let height = view.getUint32(tkhd.end - 4) >>> 16;
    if (a === 0 && Math.abs(b) === 0x10000) [width, height] = [height, width];
    const minf = mdia ? child(mdia, "minf") : null;
    const stbl = minf ? child(minf, "stbl") : null;
    const stsd = stbl ? child(stbl, "stsd") : null;
    const codec = stsd && stsd.start + 16 <= stsd.end ? type(stsd.start + 12) : "";
    if (codec !== "avc1" && codec !== "avc3") return null;
    if (!width || !height) return null;
    return { mime: "video/mp4", width, height, durationMs: Math.round((duration / timescale) * 1000), codec };
  }
  return null;
}

/**
 * The ONE asset authority (upload finalize + publish): what the bytes are, and whether they are allowed.
 * Images: PNG / JPEG / WebP / GIF ≤ 5MB. Video: MP4 (H.264) ≤ 5MB (Owner decision P3), ≤ 30s.
 */
export function inspectLaunchIntroAsset(
  bytes: Uint8Array
):
  | { ok: true; kind: "image"; mime: LaunchIntroImageRef["mime"]; width: number; height: number }
  | { ok: true; kind: "video"; mime: "video/mp4"; width: number; height: number; durationMs: number }
  | { ok: false; error: string } {
  if (bytes.length === 0) return { ok: false, error: "empty" };
  const image = sniffLaunchIntroImage(bytes);
  if (image) {
    if (bytes.length > LAUNCH_INTRO_IMAGE_MAX_BYTES) return { ok: false, error: "too_big_bytes" };
    for (const edge of [image.width, image.height]) {
      if (edge < LAUNCH_INTRO_IMAGE_MIN_EDGE) return { ok: false, error: "too_small" };
      if (edge > LAUNCH_INTRO_IMAGE_MAX_EDGE) return { ok: false, error: "too_big_dimensions" };
    }
    return { ok: true, kind: "image", ...image };
  }
  const video = sniffLaunchIntroVideo(bytes);
  if (video) {
    if (bytes.length > LAUNCH_INTRO_VIDEO_MAX_BYTES) return { ok: false, error: "video_too_big" };
    if (video.durationMs <= 0 || video.durationMs > LAUNCH_INTRO_VIDEO_MAX_DURATION_MS) return { ok: false, error: "video_duration_invalid" };
    for (const edge of [video.width, video.height]) {
      if (edge < LAUNCH_INTRO_IMAGE_MIN_EDGE || edge > LAUNCH_INTRO_IMAGE_MAX_EDGE) return { ok: false, error: "video_size_invalid" };
    }
    return { ok: true, kind: "video", mime: "video/mp4", width: video.width, height: video.height, durationMs: video.durationMs };
  }
  return { ok: false, error: "unsupported_media" };
}
