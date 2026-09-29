/**
 * DIBAY INTRO — Phase 1
 * Canonical authored document / scene / layer / transition contracts.
 *
 * Gate B HARD LOCK + Gate E C-R1 amendment:
 * - mediaRefId only in authored document (no mediaCatalog)
 * - no runtimeArtifactId / sealedAssetId in authored document
 * - CONTENT_FIT_PLUS_OPTIONAL_TABLET_OVERRIDE
 * - IMAGE surface CONTENT | VIEWPORT
 */

import type { MediaRefId } from "./identities";

export const INTRO_SCHEMA_VERSION = 1 as const;

export type AspectRatioV1 = { readonly w: number; readonly h: number };

export const BASE_COMPOSITION_ASPECT: AspectRatioV1 = { w: 9, h: 16 };
export const TABLET_LANDSCAPE_ASPECT: AspectRatioV1 = { w: 16, h: 10 };

export type ColorV1 =
  | { readonly r: number; readonly g: number; readonly b: number; readonly a: number }
  | string;

/** Normalized composition frame. Origin top-left. */
export type FrameV1 = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};

export const MIN_FRAME = 0.01;

export type DocumentSettingsV1 = {
  readonly compositionAspect: AspectRatioV1; // required 9:16
  readonly tabletLandscapeAspect: AspectRatioV1; // required 16:10 SSOT for override space
};

export type SceneBackgroundV1 = {
  readonly type: "SOLID";
  readonly color: ColorV1;
};

export type TransitionCutV1 = {
  readonly type: "CUT";
  readonly durationMs: 0;
};

export type TransitionFadeV1 = {
  readonly type: "FADE";
  readonly durationMs: number; // > 0
};

export type TransitionSlideV1 = {
  readonly type: "SLIDE";
  readonly durationMs: number; // > 0
  readonly direction: "LEFT" | "RIGHT" | "UP" | "DOWN";
};

export type TransitionV1 =
  | TransitionCutV1
  | TransitionFadeV1
  | TransitionSlideV1;

export type LayerTypeV1 = "IMAGE" | "LOGO" | "TEXT" | "CTA";

export type MediaFitV1 = "CONTAIN" | "COVER";

export type ImageSurfaceV1 = "CONTENT" | "VIEWPORT";

export type TabletGeometryOverrideV1 = {
  readonly frame: FrameV1;
};

export type LayerLayoutOverridesV1 = {
  readonly TABLET_LANDSCAPE?: TabletGeometryOverrideV1;
};

export type LayerCommonV1 = {
  readonly layerId: string;
  readonly type: LayerTypeV1;
  readonly frame: FrameV1;
  readonly layoutOverrides?: LayerLayoutOverridesV1;
  readonly visible: boolean;
  readonly opacity: number;
  readonly zIndex: number;
};

export type PretendardWeightV1 =
  | "REGULAR"
  | "MEDIUM"
  | "SEMIBOLD"
  | "BOLD";

export type PretendardAssetIdV1 =
  | "Pretendard-Regular.otf"
  | "Pretendard-Medium.otf"
  | "Pretendard-SemiBold.otf"
  | "Pretendard-Bold.otf";

export const PRETENDARD_WEIGHT_TO_ASSET: Record<
  PretendardWeightV1,
  PretendardAssetIdV1
> = {
  REGULAR: "Pretendard-Regular.otf",
  MEDIUM: "Pretendard-Medium.otf",
  SEMIBOLD: "Pretendard-SemiBold.otf",
  BOLD: "Pretendard-Bold.otf",
};

export type TextFontV1 = {
  readonly family: "Pretendard";
  readonly assetId: PretendardAssetIdV1;
  readonly weight: PretendardWeightV1;
};

export type ImageLayerV1 = LayerCommonV1 & {
  readonly type: "IMAGE";
  readonly mediaRefId: MediaRefId | string;
  readonly fit: MediaFitV1;
  /** CONTENT = positioned composition geometry; VIEWPORT = full-bleed mode only. */
  readonly surface: ImageSurfaceV1;
};

export type LogoLayerV1 = LayerCommonV1 & {
  readonly type: "LOGO";
  readonly mediaRefId: MediaRefId | string;
  readonly fit: MediaFitV1;
};

export type TextLayerV1 = LayerCommonV1 & {
  readonly type: "TEXT";
  readonly content: string;
  readonly font: TextFontV1;
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly letterSpacing: number;
  readonly align: "LEFT" | "CENTER" | "RIGHT";
  readonly color: ColorV1;
  readonly wrap: "SOFT";
  readonly maxLines: number | null;
  readonly overflow: "CLIP";
};

export type CtaActionContinueV1 = { readonly type: "CONTINUE" };
export type CtaActionFinishIntroV1 = { readonly type: "FINISH_INTRO" };
export type CtaActionApprovedInternalRouteV1 = {
  readonly type: "APPROVED_INTERNAL_ROUTE";
  readonly routeId: string;
};

export type CtaActionV1 =
  | CtaActionContinueV1
  | CtaActionFinishIntroV1
  | CtaActionApprovedInternalRouteV1;

export const CTA_ACTION_TYPES = [
  "CONTINUE",
  "FINISH_INTRO",
  "APPROVED_INTERNAL_ROUTE",
] as const;

export type CtaLayerV1 = LayerCommonV1 & {
  readonly type: "CTA";
  readonly label: string;
  readonly text: {
    readonly font: TextFontV1;
    readonly fontSize: number;
    readonly letterSpacing: number;
    readonly color: ColorV1;
    readonly align: "CENTER";
  };
  readonly background: {
    readonly color: ColorV1;
    readonly cornerRadius: number;
  };
  readonly action: CtaActionV1;
};

export type LayerV1 = ImageLayerV1 | LogoLayerV1 | TextLayerV1 | CtaLayerV1;

export type SceneV1 = {
  readonly sceneId: string;
  readonly name: string;
  readonly durationMs: number;
  readonly background: SceneBackgroundV1;
  /** Outgoing transition. MUST be null on last scene. */
  readonly transitionAfter: TransitionV1 | null;
  readonly layers: LayerV1[];
};

/**
 * Authored Intro product document.
 * No storage path, runtimeArtifactId, or sealedAssetId.
 */
export type IntroDocumentV1 = {
  readonly schemaVersion: typeof INTRO_SCHEMA_VERSION;
  readonly documentId: string;
  readonly title: string;
  readonly settings: DocumentSettingsV1;
  readonly scenes: SceneV1[];
};

export type DeviceClassV1 = "PHONE_PORTRAIT" | "TABLET_LANDSCAPE";

/**
 * Gate B / E text regression:
 * same-class unexpected line-count divergence = FAIL.
 * No universal ±1-line acceptance.
 */
export type TextLineCountConformanceRule = {
  readonly rule: "SAME_CLASS_UNEXPECTED_LINE_COUNT_DIVERGENCE";
  readonly outcome: "FAIL";
  readonly universalPlusMinusOneAcceptance: false;
};

export const TEXT_LINE_COUNT_CONFORMANCE: TextLineCountConformanceRule = {
  rule: "SAME_CLASS_UNEXPECTED_LINE_COUNT_DIVERGENCE",
  outcome: "FAIL",
  universalPlusMinusOneAcceptance: false,
};
