/**
 * DIBAY INTRO — CUT A
 * Canonical empty document + layer/scene factories.
 * Pure — no DB / network. Safe for Admin Studio (browser) and server.
 */

import type {
  CtaLayerV1,
  ImageLayerV1,
  IntroDocumentV1,
  LayerV1,
  LayerTypeV1,
  LogoLayerV1,
  SceneV1,
  TextLayerV1,
  TransitionV1,
} from "../contracts/document";
import {
  BASE_COMPOSITION_ASPECT,
  INTRO_SCHEMA_VERSION,
  PRETENDARD_WEIGHT_TO_ASSET,
  TABLET_LANDSCAPE_ASPECT,
} from "../contracts/document";

export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptyIntroDocument(args: {
  documentId: string;
  title: string;
}): IntroDocumentV1 {
  return {
    schemaVersion: INTRO_SCHEMA_VERSION,
    documentId: args.documentId,
    title: args.title.trim() || "Untitled Intro",
    settings: {
      compositionAspect: { ...BASE_COMPOSITION_ASPECT },
      tabletLandscapeAspect: { ...TABLET_LANDSCAPE_ASPECT },
    },
    scenes: [],
  };
}

export function createEmptyScene(args?: {
  sceneId?: string;
  name?: string;
  durationMs?: number;
  transitionAfter?: TransitionV1 | null;
}): SceneV1 {
  return {
    sceneId: args?.sceneId ?? newId(),
    name: args?.name ?? "Scene",
    durationMs: args?.durationMs ?? 2500,
    background: {
      type: "SOLID",
      color: { r: 0, g: 0, b: 0, a: 1 },
    },
    transitionAfter:
      args?.transitionAfter === undefined
        ? { type: "FADE", durationMs: 300 }
        : args.transitionAfter,
    layers: [],
  };
}

function nextZ(layers: readonly LayerV1[]): number {
  if (layers.length === 0) return 0;
  return Math.max(...layers.map((l) => l.zIndex)) + 1;
}

export function createDefaultLayer(
  type: LayerTypeV1,
  existing: readonly LayerV1[],
  opts?: { mediaRefId?: string | null },
): LayerV1 {
  const zIndex = nextZ(existing);
  const layerId = newId();
  switch (type) {
    case "IMAGE": {
      const layer: ImageLayerV1 = {
        layerId,
        type: "IMAGE",
        frame: { x: 0.1, y: 0.2, w: 0.8, h: 0.45 },
        visible: true,
        opacity: 1,
        zIndex,
        mediaRefId: opts?.mediaRefId ?? "",
        fit: "CONTAIN",
        surface: "CONTENT",
      };
      return layer;
    }
    case "LOGO": {
      const layer: LogoLayerV1 = {
        layerId,
        type: "LOGO",
        frame: { x: 0.3, y: 0.12, w: 0.4, h: 0.12 },
        visible: true,
        opacity: 1,
        zIndex,
        mediaRefId: opts?.mediaRefId ?? "",
        fit: "CONTAIN",
      };
      return layer;
    }
    case "TEXT": {
      const layer: TextLayerV1 = {
        layerId,
        type: "TEXT",
        frame: { x: 0.1, y: 0.45, w: 0.8, h: 0.2 },
        visible: true,
        opacity: 1,
        zIndex,
        content: "텍스트",
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
      };
      return layer;
    }
    case "CTA": {
      const layer: CtaLayerV1 = {
        layerId,
        type: "CTA",
        frame: { x: 0.2, y: 0.78, w: 0.6, h: 0.08 },
        visible: true,
        opacity: 1,
        zIndex,
        label: "시작하기",
        text: {
          font: {
            family: "Pretendard",
            weight: "SEMIBOLD",
            assetId: PRETENDARD_WEIGHT_TO_ASSET.SEMIBOLD,
          },
          fontSize: 0.035,
          letterSpacing: 0,
          color: { r: 1, g: 1, b: 1, a: 1 },
          align: "CENTER",
        },
        background: {
          color: { r: 0.15, g: 0.45, b: 0.95, a: 1 },
          cornerRadius: 0.02,
        },
        action: { type: "FINISH_INTRO" },
      };
      return layer;
    }
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown layer type: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Ensure non-last scenes have a transition; last scene has null transitionAfter.
 */
export function normalizeSceneTransitions(scenes: SceneV1[]): SceneV1[] {
  return scenes.map((scene, i) => {
    const isLast = i === scenes.length - 1;
    if (isLast) {
      return { ...scene, transitionAfter: null };
    }
    if (scene.transitionAfter == null) {
      return {
        ...scene,
        transitionAfter: { type: "FADE", durationMs: 300 },
      };
    }
    return scene;
  });
}
