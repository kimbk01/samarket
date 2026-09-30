/**
 * REBUILD 14 P5 — Preview / Native consumption contracts.
 *
 * P6 Admin Preview and future Android/iOS hosts MUST consume these semantic
 * outputs. Hosts may map norm→pixels / opacity→alpha / transform→platform;
 * they must NOT invent product semantics.
 *
 * No Preview UI. No native wiring. Structural contracts only.
 */

import {
  applyExplicitCenter,
  fitMediaDrawInFrame,
  parseNormalizedFrame,
  projectCompositionRegion,
  projectFrameToPixels,
  type FitMode,
  type MediaDrawFit,
  type NormalizedFrame,
} from "@/lib/startup-compositor/execution/geometry";
import {
  evaluateMotionAtSceneElapsed,
  evaluateMotionProgress,
  motionLocalProgress,
  type SemanticMotionState,
} from "@/lib/startup-compositor/execution/motion";
import {
  evaluateTransitionAtElapsed,
  evaluateTransitionProgress,
  TRANSITION_DURATION_MODE,
  type SemanticTransitionState,
} from "@/lib/startup-compositor/execution/transition";
import {
  listCtaDestinationKeys,
  resolveCtaDestination,
} from "@/lib/startup-compositor/execution/cta-destination";
import {
  IntroTimelineClock,
  INTRO_TIMELINE_POLICY,
} from "@/lib/startup-compositor/intro/timeline";
import {
  IntroCtaActionGate,
  mapDocumentCtaAction,
} from "@/lib/startup-compositor/intro/cta";
import {
  evaluateIntroToHomeHandoff,
  HandoffOnceGate,
} from "@/lib/startup-compositor/intro/handoff";
import type { MotionV1 } from "@/lib/startup-compositor/registries/motion";
import type { TransitionV1 } from "@/lib/startup-compositor/registries/transition";

/** Stable module id for Preview import surface (P6). */
export const PREVIEW_SEMANTIC_MODULE_ID =
  "@dibay/startup-compositor/execution" as const;

/** Stable module id for native adapter binding (P7+). */
export const NATIVE_SEMANTIC_MODULE_ID =
  "@dibay/startup-compositor/execution" as const;

export type PreviewSemanticApi = {
  readonly moduleId: typeof PREVIEW_SEMANTIC_MODULE_ID;
  readonly parseNormalizedFrame: typeof parseNormalizedFrame;
  readonly applyExplicitCenter: typeof applyExplicitCenter;
  readonly fitMediaDrawInFrame: typeof fitMediaDrawInFrame;
  readonly projectCompositionRegion: typeof projectCompositionRegion;
  readonly evaluateMotionAtSceneElapsed: typeof evaluateMotionAtSceneElapsed;
  readonly evaluateTransitionAtElapsed: typeof evaluateTransitionAtElapsed;
  readonly resolveCtaDestination: typeof resolveCtaDestination;
  readonly listCtaDestinationKeys: typeof listCtaDestinationKeys;
  readonly INTRO_TIMELINE_POLICY: typeof INTRO_TIMELINE_POLICY;
  readonly TRANSITION_DURATION_MODE: typeof TRANSITION_DURATION_MODE;
  readonly createTimelineClock: () => IntroTimelineClock;
  readonly createCtaGate: () => IntroCtaActionGate;
};

export function createPreviewSemanticApi(): PreviewSemanticApi {
  return {
    moduleId: PREVIEW_SEMANTIC_MODULE_ID,
    parseNormalizedFrame,
    applyExplicitCenter,
    fitMediaDrawInFrame,
    projectCompositionRegion,
    evaluateMotionAtSceneElapsed,
    evaluateTransitionAtElapsed,
    resolveCtaDestination,
    listCtaDestinationKeys,
    INTRO_TIMELINE_POLICY,
    TRANSITION_DURATION_MODE,
    createTimelineClock: () => new IntroTimelineClock(),
    createCtaGate: () => new IntroCtaActionGate(),
  };
}

export type NativeSemanticFrameOutput = {
  readonly frame: NormalizedFrame;
  readonly draw: MediaDrawFit | null;
  readonly motion: SemanticMotionState | null;
};

export type NativeSemanticSceneOutput = {
  readonly transition: SemanticTransitionState | null;
  readonly transitionDurationMode: typeof TRANSITION_DURATION_MODE;
};

export type NativeAdapterContract = {
  readonly moduleId: typeof NATIVE_SEMANTIC_MODULE_ID;
  readonly mapFrameToPixels: typeof projectFrameToPixels;
  readonly projectCompositionRegion: typeof projectCompositionRegion;
  readonly buildElementSemantic: (args: {
    readonly frame: NormalizedFrame;
    readonly intrinsicAspect: number | null;
    readonly fit: FitMode | null;
    readonly motion: MotionV1 | null;
    readonly sceneElapsedMs: number;
  }) =>
    | { readonly ok: true; readonly value: NativeSemanticFrameOutput }
    | { readonly ok: false; readonly reason: string };
  readonly buildSceneTransitionSemantic: (args: {
    readonly transition: TransitionV1;
    readonly transitionElapsedMs: number;
  }) =>
    | { readonly ok: true; readonly value: NativeSemanticSceneOutput }
    | { readonly ok: false; readonly reason: string };
  readonly mapDocumentCtaAction: typeof mapDocumentCtaAction;
  readonly evaluateIntroToHomeHandoff: typeof evaluateIntroToHomeHandoff;
  readonly createHandoffOnceGate: () => HandoffOnceGate;
};

export function createNativeAdapterContract(): NativeAdapterContract {
  return {
    moduleId: NATIVE_SEMANTIC_MODULE_ID,
    mapFrameToPixels: projectFrameToPixels,
    projectCompositionRegion,
    buildElementSemantic(args) {
      const frameOk = parseNormalizedFrame(args.frame);
      if (!frameOk.ok) return { ok: false, reason: frameOk.reason };
      let draw: MediaDrawFit | null = null;
      if (args.intrinsicAspect != null && args.fit) {
        const fit = fitMediaDrawInFrame({
          frame: args.frame,
          intrinsicAspect: args.intrinsicAspect,
          mode: args.fit,
        });
        if (!fit.ok) return { ok: false, reason: fit.reason };
        draw = fit.value;
      }
      let motion: SemanticMotionState | null = null;
      if (args.motion) {
        const m = evaluateMotionAtSceneElapsed(args.motion, args.sceneElapsedMs);
        if (!m.ok) return { ok: false, reason: m.reason };
        motion = m.value;
      }
      return {
        ok: true,
        value: { frame: args.frame, draw, motion },
      };
    },
    buildSceneTransitionSemantic(args) {
      const t = evaluateTransitionAtElapsed(
        args.transition,
        args.transitionElapsedMs,
      );
      if (!t.ok) return { ok: false, reason: t.reason };
      return {
        ok: true,
        value: {
          transition: t.value,
          transitionDurationMode: TRANSITION_DURATION_MODE,
        },
      };
    },
    mapDocumentCtaAction,
    evaluateIntroToHomeHandoff,
    createHandoffOnceGate: () => new HandoffOnceGate(),
  };
}

/** Authority probe helpers used by P5-46 / P5-47 tests. */
export function previewConsumesSameMotionEngine(
  motion: MotionV1,
  progress: number,
): SemanticMotionState {
  const r = evaluateMotionProgress(motion, progress);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}

export function previewConsumesSameTransitionEngine(
  transition: TransitionV1,
  progress: number,
): SemanticTransitionState {
  const r = evaluateTransitionProgress(transition, progress);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}

export { motionLocalProgress };
