/**
 * REBUILD 14 P6 — Admin media exposure = Preview capability truth.
 *
 * Do not expose GIF/MP4 authoring if Preview cannot execute shared-timeline
 * semantics. Native playback remains NOT_PROVEN.
 * MP4 AUDIO = OPEN PRODUCT DECISION — never silently authored.
 */

import { INTRO_MEDIA_FORMAT_CONTRACTS } from "@/lib/startup-compositor/intro/media-formats";

export type AdminMediaKind = "PNG" | "JPG" | "JPEG" | "WEBP" | "GIF" | "MP4";

export type AdminMediaCapability = {
  readonly kind: AdminMediaKind;
  /** May appear in Owner media picker / insert controls. */
  readonly adminExposed: boolean;
  readonly previewSharedTimeline: boolean;
  readonly nativePlayback: "NOT_PROVEN";
  readonly notes: string;
};

/**
 * P6 Preview truth:
 * - Static images: Preview can show still frames under shared clock → exposed.
 * - GIF: browser <img> animates autonomously while hidden → NOT shared-timeline
 *   authority in Admin Preview → do NOT expose for authoring at P6.
 * - MP4: browser <video autoPlay> is not visibility-gated semantic clock →
 *   do NOT expose for authoring at P6 until Preview path uses canonical control.
 * - MP4 audio: OPEN — no Admin audio on/off/volume controls.
 */
export const ADMIN_MEDIA_CAPABILITIES: Readonly<
  Record<AdminMediaKind, AdminMediaCapability>
> = {
  PNG: {
    kind: "PNG",
    adminExposed: true,
    previewSharedTimeline: true,
    nativePlayback: "NOT_PROVEN",
    notes: INTRO_MEDIA_FORMAT_CONTRACTS.PNG.notes,
  },
  JPG: {
    kind: "JPG",
    adminExposed: true,
    previewSharedTimeline: true,
    nativePlayback: "NOT_PROVEN",
    notes: INTRO_MEDIA_FORMAT_CONTRACTS.JPG.notes,
  },
  JPEG: {
    kind: "JPEG",
    adminExposed: true,
    previewSharedTimeline: true,
    nativePlayback: "NOT_PROVEN",
    notes: INTRO_MEDIA_FORMAT_CONTRACTS.JPEG.notes,
  },
  WEBP: {
    kind: "WEBP",
    adminExposed: true,
    previewSharedTimeline: true,
    nativePlayback: "NOT_PROVEN",
    notes: INTRO_MEDIA_FORMAT_CONTRACTS.WEBP.notes,
  },
  GIF: {
    kind: "GIF",
    adminExposed: false,
    previewSharedTimeline: false,
    nativePlayback: "NOT_PROVEN",
    notes:
      "P6 Admin Preview cannot gate browser GIF animation to IntroTimelineClock; " +
      "hidden time would advance. Exposure deferred. Contract sharedTimeline exists at P4 schema level only.",
  },
  MP4: {
    kind: "MP4",
    adminExposed: false,
    previewSharedTimeline: false,
    nativePlayback: "NOT_PROVEN",
    notes:
      "P6 Admin Preview must not use autonomous <video autoPlay> as semantic authority. " +
      "MP4 AUDIO = OPEN PRODUCT DECISION — no Admin audio controls.",
  },
};

export function isAdminMediaExposed(kind: AdminMediaKind): boolean {
  return ADMIN_MEDIA_CAPABILITIES[kind].adminExposed;
}

export const MP4_AUDIO_PRODUCT_DECISION = "OPEN" as const;

/** Authoring must not invent product audio fields. */
export const MP4_AUDIO_ADMIN_CONTROLS_EXPOSED = false as const;
