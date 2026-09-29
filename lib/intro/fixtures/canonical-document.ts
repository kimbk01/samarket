/**
 * DIBAY INTRO — Phase 1
 * Canonical deterministic multi-scene fixture.
 * No Production DB / Supabase / Storage / signed URLs.
 */

import type { IntroDocumentV1 } from "../contracts/document";
import { PRETENDARD_WEIGHT_TO_ASSET } from "../contracts/document";
import { asMediaRefId } from "../contracts/identities";
import {
  GifFixtureClass,
  GIF_MANDATORY_DISPOSAL_FIXTURE_ID,
  GIF_RUNTIME_CONTRACT,
} from "../contracts/gif";

const mediaLogo = asMediaRefId("fixture-media-ref-logo");
const mediaContent = asMediaRefId("fixture-media-ref-content-image");
const mediaViewport = asMediaRefId("fixture-media-ref-viewport-image");
const mediaGif = asMediaRefId("fixture-media-ref-gif-05");

/**
 * 3 scenes; durations + transitions = 2500+300+3000+300+2000 = 8100ms
 * Includes IMAGE (CONTENT + VIEWPORT), LOGO, TEXT, CTA,
 * CUT / FADE / SLIDE, tablet override, GIF mediaRef, FINISH_INTRO.
 */
export const CANONICAL_INTRO_FIXTURE_DOCUMENT: IntroDocumentV1 = {
  schemaVersion: 1,
  documentId: "fixture-document-canonical-v1",
  title: "Canonical Phase 1 Fixture",
  settings: {
    compositionAspect: { w: 9, h: 16 },
    tabletLandscapeAspect: { w: 16, h: 10 },
  },
  scenes: [
    {
      sceneId: "fixture-scene-1",
      name: "Brand",
      durationMs: 2500,
      background: { type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 } },
      transitionAfter: { type: "FADE", durationMs: 300 },
      layers: [
        {
          layerId: "fixture-layer-viewport-bg",
          type: "IMAGE",
          frame: { x: 0, y: 0, w: 1, h: 1 },
          visible: true,
          opacity: 1,
          zIndex: 0,
          mediaRefId: mediaViewport,
          fit: "COVER",
          surface: "VIEWPORT",
        },
        {
          layerId: "fixture-layer-logo",
          type: "LOGO",
          frame: { x: 0.3, y: 0.12, w: 0.4, h: 0.12 },
          layoutOverrides: {
            TABLET_LANDSCAPE: {
              frame: { x: 0.35, y: 0.08, w: 0.3, h: 0.14 },
            },
          },
          visible: true,
          opacity: 1,
          zIndex: 1,
          mediaRefId: mediaLogo,
          fit: "CONTAIN",
        },
        {
          layerId: "fixture-layer-text-1",
          type: "TEXT",
          frame: { x: 0.1, y: 0.45, w: 0.8, h: 0.2 },
          visible: true,
          opacity: 1,
          zIndex: 2,
          content: "Welcome to Dibay",
          font: {
            family: "Pretendard",
            weight: "BOLD",
            assetId: PRETENDARD_WEIGHT_TO_ASSET.BOLD,
          },
          fontSize: 0.05,
          lineHeight: 1.25,
          letterSpacing: 0,
          align: "CENTER",
          color: { r: 1, g: 1, b: 1, a: 1 },
          wrap: "SOFT",
          maxLines: 2,
          overflow: "CLIP",
        },
      ],
    },
    {
      sceneId: "fixture-scene-2",
      name: "Feature",
      durationMs: 3000,
      background: { type: "SOLID", color: { r: 0.05, g: 0.05, b: 0.08, a: 1 } },
      transitionAfter: { type: "SLIDE", durationMs: 300, direction: "LEFT" },
      layers: [
        {
          layerId: "fixture-layer-content-image",
          type: "IMAGE",
          frame: { x: 0.1, y: 0.2, w: 0.8, h: 0.45 },
          visible: true,
          opacity: 1,
          zIndex: 0,
          mediaRefId: mediaContent,
          fit: "CONTAIN",
          surface: "CONTENT",
        },
        {
          layerId: "fixture-layer-gif",
          type: "IMAGE",
          frame: { x: 0.25, y: 0.68, w: 0.5, h: 0.2 },
          visible: true,
          opacity: 1,
          zIndex: 1,
          mediaRefId: mediaGif,
          fit: "CONTAIN",
          surface: "CONTENT",
        },
        {
          layerId: "fixture-layer-text-2",
          type: "TEXT",
          frame: { x: 0.1, y: 0.05, w: 0.8, h: 0.12 },
          visible: true,
          opacity: 1,
          zIndex: 2,
          content: "Animated stories",
          font: {
            family: "Pretendard",
            weight: "SEMIBOLD",
            assetId: PRETENDARD_WEIGHT_TO_ASSET.SEMIBOLD,
          },
          fontSize: 0.04,
          lineHeight: 1.2,
          letterSpacing: 0,
          align: "CENTER",
          color: { r: 1, g: 1, b: 1, a: 1 },
          wrap: "SOFT",
          maxLines: 1,
          overflow: "CLIP",
        },
      ],
    },
    {
      sceneId: "fixture-scene-3",
      name: "Finish",
      durationMs: 2000,
      background: { type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 } },
      transitionAfter: null,
      layers: [
        {
          layerId: "fixture-layer-text-3",
          type: "TEXT",
          frame: { x: 0.1, y: 0.35, w: 0.8, h: 0.15 },
          visible: true,
          opacity: 1,
          zIndex: 0,
          content: "Ready when you are",
          font: {
            family: "Pretendard",
            weight: "MEDIUM",
            assetId: PRETENDARD_WEIGHT_TO_ASSET.MEDIUM,
          },
          fontSize: 0.045,
          lineHeight: 1.25,
          letterSpacing: 0,
          align: "CENTER",
          color: { r: 1, g: 1, b: 1, a: 1 },
          wrap: "SOFT",
          maxLines: 2,
          overflow: "CLIP",
        },
        {
          layerId: "fixture-layer-cta",
          type: "CTA",
          frame: { x: 0.2, y: 0.72, w: 0.6, h: 0.1 },
          layoutOverrides: {
            TABLET_LANDSCAPE: {
              frame: { x: 0.35, y: 0.75, w: 0.3, h: 0.12 },
            },
          },
          visible: true,
          opacity: 1,
          zIndex: 1,
          label: "Get started",
          text: {
            font: {
              family: "Pretendard",
              weight: "BOLD",
              assetId: PRETENDARD_WEIGHT_TO_ASSET.BOLD,
            },
            fontSize: 0.035,
            letterSpacing: 0,
            color: { r: 1, g: 1, b: 1, a: 1 },
            align: "CENTER",
          },
          background: {
            color: { r: 0.2, g: 0.45, b: 1, a: 1 },
            cornerRadius: 0.25,
          },
          action: { type: "FINISH_INTRO" },
        },
      ],
    },
  ],
};

/** Scene 1 also exercises CUT via a dedicated test mutation helper expectation. */
export const FIXTURE_TRANSITION_TYPES = ["FADE", "SLIDE", "CUT"] as const;

export type GifFixtureMetadata = {
  readonly mediaRefId: string;
  readonly runtimeFormat: typeof GIF_RUNTIME_CONTRACT.runtimeFormat;
  readonly fixtureClasses: readonly (typeof GifFixtureClass)[keyof typeof GifFixtureClass][];
  readonly mandatoryDisposalFixtureId: typeof GIF_MANDATORY_DISPOSAL_FIXTURE_ID;
  readonly processorPassClaimed: false;
};

export const GIF_FIXTURE_METADATA: GifFixtureMetadata = {
  mediaRefId: mediaGif,
  runtimeFormat: GIF_RUNTIME_CONTRACT.runtimeFormat,
  fixtureClasses: GIF_RUNTIME_CONTRACT.mandatoryFixtureClasses,
  mandatoryDisposalFixtureId: GIF_MANDATORY_DISPOSAL_FIXTURE_ID,
  processorPassClaimed: false,
};

export const GEOMETRY_FIXTURES = {
  PHONE_360x800: { width: 360, height: 800 },
  IPHONE_430x932: { width: 430, height: 932 },
  TABLET_1280x800: { width: 1280, height: 800 },
} as const;

export const TABLET_NO_OVERRIDE_EXPECTED = {
  RW: 450,
  RH: 800,
  OX: 415,
  OY: 0,
} as const;
