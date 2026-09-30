/**
 * REBUILD 14 P4 — Intro semantic render model for ONE compositor.
 * No Editor chrome. No presentation surface attachment.
 */

import type {
  CtaPayloadV1,
  ElementV1,
  FrameV1,
  ImagePayloadV1,
  IntroDocumentV1,
  SceneBackgroundV1,
  SceneV1,
  TextPayloadV1,
  TransitionV1,
  VideoPayloadV1,
} from "@/lib/intro/contracts/document";
import type { MotionV1 } from "@/lib/intro/contracts/capability-registry";
import type { IntroVisibilityStep } from "@/lib/startup-compositor/intro/phase";

export type IntroElementRenderNode = {
  readonly elementId: string;
  readonly type: "IMAGE" | "LOGO" | "TEXT" | "CTA" | "VIDEO";
  readonly frame: FrameV1;
  readonly zIndex: number;
  readonly opacity: number;
  readonly motion: MotionV1;
  readonly fit: "COVER" | "CONTAIN" | null;
  readonly mediaId: string | null;
  readonly text: TextPayloadV1 | null;
  readonly cta: CtaPayloadV1 | null;
  readonly video: VideoPayloadV1 | null;
  /** Intrinsic aspect preserved for IMAGE/LOGO/VIDEO when meta known. */
  readonly preserveIntrinsicAspect: boolean;
};

export type IntroSceneRenderNode = {
  readonly sceneId: string;
  readonly name: string;
  readonly order: number;
  readonly durationMs: number;
  readonly background: SceneBackgroundV1;
  readonly transition: TransitionV1;
  readonly elements: readonly IntroElementRenderNode[];
};

/**
 * Device render IR — MUST NOT contain editor chrome.
 */
export type IntroRenderModel = {
  readonly kind: "INTRO_PHASE";
  readonly present: true;
  readonly documentTitle: string;
  readonly compositionAspect: { readonly w: 9; readonly h: 16 };
  readonly scenes: readonly IntroSceneRenderNode[];
  readonly activeSceneIndex: number;
  readonly visibility: IntroVisibilityStep;
  readonly scene1Paintable: boolean;
  readonly hasEditorChrome: false;
  readonly presentationSurface: "COMPOSITOR_PHASE_ONLY";
};

export type IntroAbsentModel = {
  readonly kind: "INTRO_ABSENT";
  readonly present: false;
  readonly path: "SYSTEM_START_TO_HOME";
};

export type IntroPhaseModel = IntroRenderModel | IntroAbsentModel;

function mapElement(el: ElementV1): IntroElementRenderNode {
  const base = {
    elementId: el.id,
    frame: el.frame,
    zIndex: el.zIndex,
    opacity: el.opacity,
    motion: el.motion,
  };
  if (el.type === "TEXT") {
    return {
      ...base,
      type: "TEXT",
      fit: null,
      mediaId: null,
      text: el.payload as TextPayloadV1,
      cta: null,
      video: null,
      preserveIntrinsicAspect: false,
    };
  }
  if (el.type === "CTA") {
    return {
      ...base,
      type: "CTA",
      fit: null,
      mediaId: null,
      text: null,
      cta: el.payload as CtaPayloadV1,
      video: null,
      preserveIntrinsicAspect: false,
    };
  }
  if (el.type === "VIDEO") {
    const p = el.payload as VideoPayloadV1;
    return {
      ...base,
      type: "VIDEO",
      fit: p.fit,
      mediaId: p.mediaId,
      text: null,
      cta: null,
      video: p,
      preserveIntrinsicAspect: true,
    };
  }
  // IMAGE | LOGO
  const p = el.payload as ImagePayloadV1;
  return {
    ...base,
    type: el.type === "LOGO" ? "LOGO" : "IMAGE",
    fit: p.fit ?? "CONTAIN",
    mediaId: p.mediaId,
    text: null,
    cta: null,
    video: null,
    preserveIntrinsicAspect: true,
  };
}

export function sceneToRenderNode(scene: SceneV1, order: number): IntroSceneRenderNode {
  return {
    sceneId: scene.id,
    name: scene.name,
    order,
    durationMs: scene.durationMs,
    background: scene.background,
    transition: scene.transition,
    elements: scene.elements
      .filter((e) => e.visible !== false)
      .map(mapElement)
      .sort((a, b) => a.zIndex - b.zIndex),
  };
}

export function documentToIntroRenderModel(
  doc: IntroDocumentV1,
  opts?: {
    readonly activeSceneIndex?: number;
    readonly visibility?: IntroVisibilityStep;
    readonly scene1Paintable?: boolean;
  },
): IntroRenderModel {
  const scenes = doc.scenes.map((s, i) => sceneToRenderNode(s, i));
  return {
    kind: "INTRO_PHASE",
    present: true,
    documentTitle: doc.title,
    compositionAspect: { w: 9, h: 16 },
    scenes,
    activeSceneIndex: opts?.activeSceneIndex ?? 0,
    visibility: opts?.visibility ?? "INTRO_IR_READY",
    scene1Paintable: opts?.scene1Paintable ?? false,
    hasEditorChrome: false,
    presentationSurface: "COMPOSITOR_PHASE_ONLY",
  };
}

/** Detect editor chrome leakage into device IR. */
export function introRenderModelHasEditorChrome(model: IntroRenderModel): boolean {
  const json = JSON.stringify(model);
  const forbidden = [
    "selectionBorder",
    "resizeHandle",
    "dragHandle",
    "editorLabel",
    "editorChrome",
    "selectedElementId",
  ];
  return forbidden.some((k) => json.includes(k));
}
