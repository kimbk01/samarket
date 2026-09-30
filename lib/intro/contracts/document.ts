/**
 * DIBAY INTRO — Canonical document / pack contracts.
 * Single semantics for Admin Preview, Android, iOS.
 * Capability tokens: lib/intro/contracts/capability-registry.ts
 */

import {
  DEFAULT_MOTION,
  DEFAULT_TRANSITION_CUT,
  DEFAULT_TRANSITION_FADE,
  isMotionTypeV1,
  normalizeMotionV1,
  normalizeTransitionV1,
  type MotionTypeV1,
  type MotionV1,
  type TransitionV1,
} from "@/lib/intro/contracts/capability-registry";

export {
  DEFAULT_MOTION,
  DEFAULT_TRANSITION_CUT,
  DEFAULT_TRANSITION_FADE,
  MOTION_TYPES_V1,
  MOTION_OPERATOR_LABELS,
  TRANSITION_TYPES_V1,
  TRANSITION_OPERATOR_LABELS,
  isMotionTypeV1,
  isTransitionTypeV1,
  normalizeMotionV1,
  normalizeTransitionV1,
  transitionSlideAxis,
  type MotionTypeV1,
  type MotionV1,
  type TransitionTypeV1,
  type TransitionV1,
} from "@/lib/intro/contracts/capability-registry";

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

export type ColorHex = string;

export type SceneBackgroundV1 =
  | { readonly type: "COLOR"; readonly color: ColorHex }
  | { readonly type: "IMAGE"; readonly mediaId: string; readonly fit: "COVER" | "CONTAIN" };

export type ElementTypeV1 = "IMAGE" | "LOGO" | "TEXT" | "CTA" | "VIDEO";

export type TextPayloadV1 = {
  readonly text: string;
  readonly color: ColorHex;
  readonly fontSizeNorm: number;
  readonly align: "left" | "center" | "right";
  readonly weight: "regular" | "medium" | "bold";
};

export type ImagePayloadV1 = {
  readonly mediaId: string;
  readonly fit: "COVER" | "CONTAIN";
};

export type VideoPayloadV1 = {
  readonly mediaId: string;
  readonly fit: "COVER" | "CONTAIN";
  readonly loop: boolean;
  readonly muted: boolean;
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
  readonly payload:
    | TextPayloadV1
    | ImagePayloadV1
    | CtaPayloadV1
    | VideoPayloadV1;
};

export type SceneV1 = {
  readonly id: string;
  /** Operator-visible name; empty falls back to "장면 N". */
  readonly name: string;
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
        name: "오프닝",
        durationMs: 2500,
        background: { type: "COLOR", color: "#0B3D91" },
        transition: DEFAULT_TRANSITION_CUT,
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

export type DocumentIssue = {
  code: string;
  sceneIndex?: number;
  elementId?: string;
  /** Operator-facing Korean. */
  messageKo: string;
};

function sceneLabel(scene: SceneV1, index: number): string {
  const n = (scene.name || "").trim();
  return n || `장면 ${index + 1}`;
}

/** Structured validation — prefer over raw string for Admin UX. */
export function validateDocumentIssues(doc: IntroDocumentV1): DocumentIssue[] {
  const issues: DocumentIssue[] = [];
  if (doc.schemaVersion !== INTRO13_SCHEMA_VERSION) {
    issues.push({ code: "bad_schema", messageKo: "문서 형식이 올바르지 않습니다." });
    return issues;
  }
  if (typeof doc.title !== "string" || !doc.title.trim()) {
    issues.push({ code: "missing_title", messageKo: "인트로 이름을 입력해 주세요." });
  }
  if (!doc.scenes.length) {
    issues.push({ code: "no_scenes", messageKo: "장면이 하나 이상 필요합니다." });
    return issues;
  }
  doc.scenes.forEach((scene, sceneIndex) => {
    const label = sceneLabel(scene, sceneIndex);
    if (scene.durationMs < 100) {
      issues.push({
        code: "scene_duration",
        sceneIndex,
        messageKo: `'${label}' 장면의 재생 시간을 확인해 주세요.`,
      });
    }
    if (scene.background.type === "COLOR" && !isColorHex(scene.background.color)) {
      issues.push({
        code: "bad_bg_color",
        sceneIndex,
        messageKo: `'${label}' 장면의 배경색을 확인해 주세요.`,
      });
    }
    if (scene.background.type === "IMAGE" && !scene.background.mediaId) {
      issues.push({
        code: "bg_image_missing_media",
        sceneIndex,
        messageKo: `'${label}' 장면의 배경 이미지를 선택해 주세요.`,
      });
    }
    const tr = normalizeTransitionV1(scene.transition);
    if (!tr) {
      issues.push({
        code: "bad_transition",
        sceneIndex,
        messageKo: `'${label}' 장면의 전환 효과를 확인해 주세요.`,
      });
    }
    for (const el of scene.elements) {
      if (!isMotionTypeV1(el.motion?.type)) {
        issues.push({
          code: `invalid_motion:${String(el.motion?.type ?? "missing")}`,
          sceneIndex,
          elementId: el.id,
          messageKo: `'${label}' 장면의 요소 등장 효과를 확인해 주세요.`,
        });
      } else if (
        !Number.isFinite(el.motion.startMs) ||
        !Number.isFinite(el.motion.durationMs) ||
        el.motion.startMs < 0 ||
        el.motion.durationMs < 0
      ) {
        issues.push({
          code: "bad_motion_timing",
          sceneIndex,
          elementId: el.id,
          messageKo: `'${label}' 장면의 요소 등장 시간 설정을 확인해 주세요.`,
        });
      }
      if (el.type === "TEXT") {
        const p = el.payload as TextPayloadV1;
        if (!p.text?.trim()) {
          issues.push({
            code: "empty_text",
            sceneIndex,
            elementId: el.id,
            messageKo: `'${label}' 장면의 텍스트 내용을 입력해 주세요.`,
          });
        }
        if (!isColorHex(p.color)) {
          issues.push({
            code: "bad_text_color",
            sceneIndex,
            elementId: el.id,
            messageKo: `'${label}' 장면의 텍스트 색상을 확인해 주세요.`,
          });
        }
      }
      if (el.type === "IMAGE" || el.type === "LOGO" || el.type === "VIDEO") {
        const p = el.payload as ImagePayloadV1 | VideoPayloadV1;
        if (!p.mediaId?.trim()) {
          issues.push({
            code: "image_missing_media",
            sceneIndex,
            elementId: el.id,
            messageKo: `'${label}' 장면의 미디어를 선택해 주세요.`,
          });
        }
        if (p.fit !== "COVER" && p.fit !== "CONTAIN") {
          issues.push({
            code: "bad_image_fit",
            sceneIndex,
            elementId: el.id,
            messageKo: `'${label}' 장면의 맞춤 방식을 확인해 주세요.`,
          });
        }
      }
      if (el.type === "CTA") {
        const p = el.payload as CtaPayloadV1;
        if (!p.label?.trim()) {
          issues.push({
            code: "empty_cta_label",
            sceneIndex,
            elementId: el.id,
            messageKo: `'${label}' 장면의 버튼 문구를 입력해 주세요.`,
          });
        }
        const actionType = p.action?.type;
        if (
          actionType !== "NEXT_SCENE" &&
          actionType !== "FINISH_INTRO" &&
          actionType !== "INTERNAL_DESTINATION"
        ) {
          issues.push({
            code: `invalid_cta_action:${String(actionType ?? "missing")}`,
            sceneIndex,
            elementId: el.id,
            messageKo: `'${label}' 장면의 버튼 동작을 확인해 주세요.`,
          });
        }
      }
      const f = el.frame;
      if (f.w < 0.01 || f.h < 0.01) {
        issues.push({
          code: "frame_too_small",
          sceneIndex,
          elementId: el.id,
          messageKo: `'${label}' 장면의 요소 크기를 확인해 주세요.`,
        });
      }
      if (f.x < 0 || f.y < 0 || f.x + f.w > 1.001 || f.y + f.h > 1.001) {
        issues.push({
          code: "frame_out_of_bounds",
          sceneIndex,
          elementId: el.id,
          messageKo: `'${label}' 장면의 요소 위치를 확인해 주세요.`,
        });
      }
    }
  });
  return issues;
}

/** Legacy string validator — first issue code (tests / throw paths). */
export function validateDocumentV0(doc: IntroDocumentV1): string | null {
  const issues = validateDocumentIssues(doc);
  return issues[0]?.code ?? null;
}

export function operatorMessageForDocument(doc: IntroDocumentV1): string | null {
  return validateDocumentIssues(doc)[0]?.messageKo ?? null;
}

/**
 * Normalize legacy transition/motion/name shapes before validate/save/package.
 * Records MOTION_NORMALIZATION_MAP applications; never invents illegal tokens.
 */
export function normalizeDocumentV1(doc: IntroDocumentV1): IntroDocumentV1 {
  return {
    ...doc,
    scenes: doc.scenes.map((scene, i) => {
      const tr =
        normalizeTransitionV1(scene.transition) ?? DEFAULT_TRANSITION_CUT;
      const name =
        typeof (scene as SceneV1).name === "string" && (scene as SceneV1).name.trim()
          ? (scene as SceneV1).name.trim()
          : `장면 ${i + 1}`;
      return {
        ...scene,
        name,
        transition: tr,
        elements: scene.elements.map((el) => {
          const motion = normalizeMotionV1(el.motion) ?? DEFAULT_MOTION;
          return { ...el, motion };
        }),
      };
    }),
  };
}

export function collectDocumentMediaIds(doc: IntroDocumentV1): string[] {
  const ids = new Set<string>();
  for (const scene of doc.scenes) {
    if (scene.background.type === "IMAGE" && scene.background.mediaId) {
      ids.add(scene.background.mediaId);
    }
    for (const el of scene.elements) {
      if (el.type === "IMAGE" || el.type === "LOGO" || el.type === "VIDEO") {
        const p = el.payload as ImagePayloadV1 | VideoPayloadV1;
        if (p.mediaId) ids.add(p.mediaId);
      }
    }
  }
  return [...ids].sort();
}

/** Re-export MotionType for older imports. */
export type { MotionTypeV1 as MotionTypeV1Export };
