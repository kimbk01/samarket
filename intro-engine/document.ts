import {
  DIBAY_GREEN,
  INTRO_SHOW_DEFAULT_DURATION_MS,
  INTRO_SHOW_DOCUMENT_VERSION,
} from "./identity";

export type IntroShowMediaFit = "contain" | "cover";
export type IntroShowLayerType = "LOGO" | "IMAGE";

export type IntroShowFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type IntroShowLayer = {
  id: string;
  type: IntroShowLayerType;
  frame: IntroShowFrame;
  zIndex: number;
  visible: boolean;
  opacity: number;
  mediaId: string;
  fit: IntroShowMediaFit;
};

export type IntroShowScene = {
  id: string;
  durationMs: number;
  background: { color: string };
  layers: IntroShowLayer[];
};

export type IntroShowDocument = {
  version: typeof INTRO_SHOW_DOCUMENT_VERSION;
  scene: IntroShowScene;
};

export type IntroShowSemanticLayer = {
  layerId: string;
  type: IntroShowLayerType;
  mediaId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fit: IntroShowMediaFit;
  zIndex: number;
  visible: boolean;
  opacity: number;
};

export type IntroShowSemanticDocument = {
  version: number;
  sceneId: string;
  durationMs: number;
  background: string;
  layers: IntroShowSemanticLayer[];
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isFrame(value: unknown): value is IntroShowFrame {
  if (!value || typeof value !== "object") return false;
  const frame = value as IntroShowFrame;
  return (
    isFiniteNumber(frame.x) &&
    isFiniteNumber(frame.y) &&
    isFiniteNumber(frame.width) &&
    isFiniteNumber(frame.height)
  );
}

function isLayer(value: unknown): value is IntroShowLayer {
  if (!value || typeof value !== "object") return false;
  const layer = value as IntroShowLayer;
  return (
    typeof layer.id === "string" &&
    layer.id.length > 0 &&
    (layer.type === "LOGO" || layer.type === "IMAGE") &&
    isFrame(layer.frame) &&
    isFiniteNumber(layer.zIndex) &&
    typeof layer.visible === "boolean" &&
    isFiniteNumber(layer.opacity) &&
    typeof layer.mediaId === "string" &&
    layer.mediaId.length > 0 &&
    (layer.fit === "contain" || layer.fit === "cover")
  );
}

export function createEmptyIntroShowDocument(input?: { sceneId?: string }): IntroShowDocument {
  const sceneId =
    input?.sceneId ??
    (typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `scene_${Date.now()}`);
  return {
    version: INTRO_SHOW_DOCUMENT_VERSION,
    scene: {
      id: sceneId,
      durationMs: INTRO_SHOW_DEFAULT_DURATION_MS,
      background: { color: DIBAY_GREEN },
      layers: [],
    },
  };
}

export function cloneIntroShowDocument(doc: IntroShowDocument): IntroShowDocument {
  return {
    version: INTRO_SHOW_DOCUMENT_VERSION,
    scene: {
      id: doc.scene.id,
      durationMs: doc.scene.durationMs,
      background: { color: doc.scene.background.color },
      layers: doc.scene.layers.map((layer) => ({
        ...layer,
        frame: { ...layer.frame },
      })),
    },
  };
}

export function parseIntroShowDocument(input: unknown): IntroShowDocument | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as { version?: unknown; scene?: unknown };
  if (raw.version !== INTRO_SHOW_DOCUMENT_VERSION) return null;
  if (!raw.scene || typeof raw.scene !== "object") return null;
  const scene = raw.scene as Partial<IntroShowScene>;
  if (typeof scene.id !== "string" || scene.id.length === 0) return null;
  if (!isFiniteNumber(scene.durationMs) || scene.durationMs <= 0) return null;
  if (!scene.background || typeof scene.background !== "object") return null;
  const color = (scene.background as { color?: unknown }).color;
  if (typeof color !== "string" || !color.startsWith("#")) return null;
  if (!Array.isArray(scene.layers)) return null;
  const layers: IntroShowLayer[] = [];
  for (const layer of scene.layers) {
    if (!isLayer(layer)) return null;
    layers.push({
      id: layer.id,
      type: layer.type,
      frame: {
        x: layer.frame.x,
        y: layer.frame.y,
        width: layer.frame.width,
        height: layer.frame.height,
      },
      zIndex: layer.zIndex,
      visible: layer.visible,
      opacity: layer.opacity,
      mediaId: layer.mediaId,
      fit: layer.fit,
    });
  }
  return {
    version: INTRO_SHOW_DOCUMENT_VERSION,
    scene: {
      id: scene.id,
      durationMs: scene.durationMs,
      background: { color },
      layers,
    },
  };
}

function roundNorm(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function toSemanticDocument(doc: IntroShowDocument): IntroShowSemanticDocument {
  const layers = [...doc.scene.layers]
    .map((layer) => ({
      layerId: layer.id,
      type: layer.type,
      mediaId: layer.mediaId,
      x: roundNorm(layer.frame.x),
      y: roundNorm(layer.frame.y),
      width: roundNorm(layer.frame.width),
      height: roundNorm(layer.frame.height),
      fit: layer.fit,
      zIndex: layer.zIndex,
      visible: layer.visible,
      opacity: roundNorm(layer.opacity),
    }))
    .sort((a, b) => a.layerId.localeCompare(b.layerId));
  return {
    version: doc.version,
    sceneId: doc.scene.id,
    durationMs: doc.scene.durationMs,
    background: doc.scene.background.color.toUpperCase(),
    layers,
  };
}

export function semanticDocumentsEqual(a: IntroShowDocument, b: IntroShowDocument): boolean {
  return JSON.stringify(toSemanticDocument(a)) === JSON.stringify(toSemanticDocument(b));
}

export function canonicalDocumentJson(doc: IntroShowDocument): string {
  return JSON.stringify(toSemanticDocument(doc));
}
