/**
 * REBUILD 14 P4 — Intro media format semantic contracts.
 *
 * Schema/contract ≠ native playback.
 * GIF/MP4 native playback = NOT_PROVEN at P4.
 */

export const INTRO_MEDIA_FORMATS = [
  "PNG",
  "JPG",
  "JPEG",
  "WEBP",
  "GIF",
  "MP4",
] as const;

export type IntroMediaFormat = (typeof INTRO_MEDIA_FORMATS)[number];

export type MediaFormatContract = {
  readonly format: IntroMediaFormat;
  /** Shared semantic contract implemented at P4. */
  readonly contractImplemented: true;
  /** Shared timeline semantics (visibility-gated clocks). */
  readonly sharedTimelineImplemented: boolean;
  /** Platform decode/playback — P4 = false. */
  readonly nativePlaybackProven: false;
  readonly notes: string;
};

export const INTRO_MEDIA_FORMAT_CONTRACTS: Readonly<
  Record<IntroMediaFormat, MediaFormatContract>
> = {
  PNG: {
    format: "PNG",
    contractImplemented: true,
    sharedTimelineImplemented: true,
    nativePlaybackProven: false,
    notes: "Static image; first meaningful frame = decode of bitmap.",
  },
  JPG: {
    format: "JPG",
    contractImplemented: true,
    sharedTimelineImplemented: true,
    nativePlaybackProven: false,
    notes: "Static image; first meaningful frame = decode of bitmap.",
  },
  JPEG: {
    format: "JPEG",
    contractImplemented: true,
    sharedTimelineImplemented: true,
    nativePlaybackProven: false,
    notes: "Alias of JPG.",
  },
  WEBP: {
    format: "WEBP",
    contractImplemented: true,
    sharedTimelineImplemented: true,
    nativePlaybackProven: false,
    notes: "Static WebP in Intro; animated WebP not a separate product type.",
  },
  GIF: {
    format: "GIF",
    contractImplemented: true,
    sharedTimelineImplemented: true,
    nativePlaybackProven: false,
    notes:
      "Not equivalent to static first frame. Animation clock starts only when Intro OWNER_VISIBLE; " +
      "hidden/covered must not consume animation time. Native playback NOT_PROVEN.",
  },
  MP4: {
    format: "MP4",
    contractImplemented: true,
    sharedTimelineImplemented: true,
    nativePlaybackProven: false,
    notes:
      "Verified local media only; no network stream on cold Intro. Playback clock visibility-gated. " +
      "Audio: muted from VideoPayloadV1 by default; do not invent autoplay sound. Native playback NOT_PROVEN.",
  },
};

export function isIntroMediaFormat(raw: unknown): raw is IntroMediaFormat {
  return typeof raw === "string" && (INTRO_MEDIA_FORMATS as readonly string[]).includes(raw);
}

export function normalizeIntroMediaFormat(raw: unknown): IntroMediaFormat | null {
  if (typeof raw !== "string") return null;
  const u = raw.trim().toUpperCase();
  if (u === "JPEG") return "JPEG";
  if (u === "JPG") return "JPG";
  if (isIntroMediaFormat(u)) return u;
  return null;
}

/**
 * Scene BACKGROUND slot support (document contract).
 * GIF/VIDEO are media formats / element types — NOT scene background kinds in IntroDocumentV1.
 */
export const SCENE_BACKGROUND_KINDS = ["COLOR", "IMAGE"] as const;
export type SceneBackgroundKind = (typeof SCENE_BACKGROUND_KINDS)[number];

export const SCENE_BACKGROUND_GIF_SUPPORTED = false as const;
export const SCENE_BACKGROUND_VIDEO_SUPPORTED = false as const;
