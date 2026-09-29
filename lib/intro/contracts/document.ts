/**
 * DIBAY INTRO 13 — Canonical document / pack contracts (V0+).
 * Single semantics for Admin Preview, Android, iOS.
 */

export const INTRO13_SCHEMA_VERSION = 1 as const;
export const INTRO13_PROTOCOL_VERSION = 1 as const;
export const INTRO13_RENDER_SPEC_VERSION = 1 as const;

export type AspectV1 = { readonly w: number; readonly h: number };
export const BASE_COMPOSITION_ASPECT: AspectV1 = { w: 9, h: 16 };

/** Normalized composition frame. Origin top-left. */
export type FrameV1 = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};

export type ColorHex = string; // #RRGGBB or #RRGGBBAA

export type SceneBackgroundV1 =
  | { readonly type: "COLOR"; readonly color: ColorHex }
  | { readonly type: "IMAGE"; readonly mediaId: string; readonly fit: "COVER" | "CONTAIN" };

export type TransitionV1 =
  | { readonly type: "CUT"; readonly durationMs: 0 }
  | { readonly type: "FADE"; readonly durationMs: number }
  | {
      readonly type: "SLIDE";
      readonly durationMs: number;
      readonly direction: "LEFT" | "RIGHT" | "UP" | "DOWN";
    };

export type MotionTypeV1 =
  | "NONE"
  | "FADE_IN"
  | "ENTER_TOP"
  | "ENTER_BOTTOM"
  | "ENTER_LEFT"
  | "ENTER_RIGHT"
  | "SCALE_IN";

export type MotionV1 = {
  readonly type: MotionTypeV1;
  readonly startMs: number;
  readonly durationMs: number;
};

export type ElementTypeV1 = "IMAGE" | "LOGO" | "TEXT" | "CTA";

export type TextPayloadV1 = {
  readonly text: string;
  readonly color: ColorHex;
  /** Font size as fraction of composition height. */
  readonly fontSizeNorm: number;
  readonly align: "left" | "center" | "right";
  readonly weight: "regular" | "medium" | "bold";
};

export type ImagePayloadV1 = {
  readonly mediaId: string;
  readonly fit: "COVER" | "CONTAIN";
};

export type CtaPayloadV1 = {
  readonly label: string;
  readonly action:
    | { readonly type: "NEXT_SCENE" }
    | { readonly type: "FINISH_INTRO" }
    | {
        readonly type: "INTERNAL_DESTINATION";
        readonly destination: "community" | "trade" | "food" | "chat" | "my";
      };
  readonly backgroundColor: ColorHex;
  readonly textColor: ColorHex;
};

export type ElementV1 = {
  readonly id: string;
  readonly type: ElementTypeV1;
  readonly frame: FrameV1;
  readonly zIndex: number;
  readonly visible: boolean;
  readonly opacity: number;
  readonly motion: MotionV1;
  readonly payload: TextPayloadV1 | ImagePayloadV1 | CtaPayloadV1;
};

export type SceneV1 = {
  readonly id: string;
  readonly durationMs: number;
  readonly background: SceneBackgroundV1;
  readonly transition: TransitionV1;
  readonly elements: readonly ElementV1[];
};

export type IntroDocumentV1 = {
  readonly schemaVersion: typeof INTRO13_SCHEMA_VERSION;
  readonly title: string;
  readonly compositionAspect: AspectV1;
  readonly scenes: readonly SceneV1[];
};

export type IntroRuntimePackageV1 = {
  readonly schemaVersion: typeof INTRO13_SCHEMA_VERSION;
  readonly protocolVersion: typeof INTRO13_PROTOCOL_VERSION;
  readonly renderSpecVersion: typeof INTRO13_RENDER_SPEC_VERSION;
  readonly packageId: string;
  readonly releaseId: string;
  readonly packageIntegrity: string;
  readonly compositionAspect: AspectV1;
  readonly scenes: readonly SceneV1[];
  /** Assets keyed by mediaId — relative path + integrity under pack root. */
  readonly assets: Readonly<
    Record<
      string,
      {
        readonly relativePath: string;
        readonly integrity: string;
        readonly width: number;
        readonly height: number;
        readonly format: string;
      }
    >
  >;
};

export const DEFAULT_MOTION: MotionV1 = {
  type: "NONE",
  startMs: 0,
  durationMs: 0,
};

export function createEmptyV0Document(title = "Intro"): IntroDocumentV1 {
  const sceneId = cryptoRandomId();
  const textId = cryptoRandomId();
  return {
    schemaVersion: INTRO13_SCHEMA_VERSION,
    title,
    compositionAspect: BASE_COMPOSITION_ASPECT,
    scenes: [
      {
        id: sceneId,
        durationMs: 2500,
        background: { type: "COLOR", color: "#4F46E5" },
        transition: { type: "CUT", durationMs: 0 },
        elements: [
          {
            id: textId,
            type: "TEXT",
            frame: { x: 0.08, y: 0.42, w: 0.84, h: 0.12 },
            zIndex: 1,
            visible: true,
            opacity: 1,
            motion: DEFAULT_MOTION,
            payload: {
              text: "DIBAY",
              color: "#FFFFFF",
              fontSizeNorm: 0.045,
              align: "center",
              weight: "bold",
            },
          },
        ],
      },
    ],
  };
}

export function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function isColorHex(v: unknown): v is ColorHex {
  return typeof v === "string" && /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v);
}

export function validateDocumentV0(doc: IntroDocumentV1): string | null {
  if (doc.schemaVersion !== INTRO13_SCHEMA_VERSION) return "bad_schema";
  if (!doc.scenes.length) return "no_scenes";
  for (const scene of doc.scenes) {
    if (scene.durationMs < 100) return "scene_duration";
    if (scene.background.type === "COLOR" && !isColorHex(scene.background.color)) {
      return "bad_bg_color";
    }
    if (scene.background.type === "IMAGE" && !scene.background.mediaId) {
      return "bg_image_missing_media";
    }
    for (const el of scene.elements) {
      if (el.type === "TEXT") {
        const p = el.payload as TextPayloadV1;
        if (!p.text?.trim()) return "empty_text";
        if (!isColorHex(p.color)) return "bad_text_color";
      }
      if (el.type === "IMAGE" || el.type === "LOGO") {
        const p = el.payload as ImagePayloadV1;
        if (!p.mediaId?.trim()) return "image_missing_media";
        if (p.fit !== "COVER" && p.fit !== "CONTAIN") return "bad_image_fit";
      }
      const f = el.frame;
      if (f.w < 0.01 || f.h < 0.01) return "frame_too_small";
      if (f.x < 0 || f.y < 0 || f.x + f.w > 1.001 || f.y + f.h > 1.001) {
        return "frame_out_of_bounds";
      }
    }
  }
  return null;
}

export function collectDocumentMediaIds(doc: IntroDocumentV1): string[] {
  const ids = new Set<string>();
  for (const scene of doc.scenes) {
    if (scene.background.type === "IMAGE" && scene.background.mediaId) {
      ids.add(scene.background.mediaId);
    }
    for (const el of scene.elements) {
      if (el.type === "IMAGE" || el.type === "LOGO") {
        const p = el.payload as ImagePayloadV1;
        if (p.mediaId) ids.add(p.mediaId);
      }
    }
  }
  return [...ids].sort();
}
