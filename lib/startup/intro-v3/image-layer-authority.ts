import type { IntroV3Document, IntroV3Layer } from "@/lib/startup/intro-v3/document";
import { initialIntroV3ImageGeometry } from "@/lib/startup/intro-v3/geometry";
import { defaultIntroV3LayerMotion } from "@/lib/startup/intro-v3/motion";
import { formatMediaRefToken, mediaRefFromLayer } from "@/lib/startup/intro-v3/media-library";
import type { IntroV3LibrarySelection, IntroV3MediaRef } from "@/lib/startup/intro-v3/media-types";

function cloneDocument(document: IntroV3Document): IntroV3Document {
  return JSON.parse(JSON.stringify(document)) as IntroV3Document;
}

function nextZ(layers: IntroV3Layer[]): number {
  if (layers.length === 0) return 1;
  return Math.max(...layers.map((layer) => layer.z)) + 1;
}

export function createIntroV3ImageLayerFromSelection(input: {
  id?: string;
  z?: number;
  selection: IntroV3LibrarySelection;
}): IntroV3Layer | null {
  const { selection } = input;
  if (selection.source.status !== "ready" || selection.derivative.status !== "ready") return null;
  if (!selection.derivative.publicUrl && !selection.derivative.storagePath) return null;
  return {
    id: input.id ?? crypto.randomUUID(),
    type: "IMAGE",
    visible: true,
    z: input.z ?? 1,
    geometry: initialIntroV3ImageGeometry({
      mediaWidth: selection.derivative.width,
      mediaHeight: selection.derivative.height,
    }),
    motion: defaultIntroV3LayerMotion(),
    payload: { mediaRef: formatMediaRefToken(selection.mediaRef), alt: selection.source.filename },
  };
}

export function addImageLayerToDocument(
  document: IntroV3Document,
  sceneId: string,
  selection: IntroV3LibrarySelection,
  ids?: { layerId?: string }
):
  | { ok: true; document: IntroV3Document; layer: IntroV3Layer; layersCreated: 1 }
  | { ok: false; reason: "scene_missing" | "media_not_ready" } {
  const next = cloneDocument(document);
  const scene = next.scenes.find((item) => item.id === sceneId);
  if (!scene) return { ok: false, reason: "scene_missing" };
  const layer = createIntroV3ImageLayerFromSelection({
    id: ids?.layerId,
    z: nextZ(scene.layers),
    selection,
  });
  if (!layer) return { ok: false, reason: "media_not_ready" };
  scene.layers = [...scene.layers, layer];
  return { ok: true, document: next, layer, layersCreated: 1 };
}

export function replaceImageLayerMedia(
  document: IntroV3Document,
  layerId: string,
  selection: IntroV3LibrarySelection
):
  | {
      ok: true;
      document: IntroV3Document;
      layer: IntroV3Layer;
      previousMediaRef: IntroV3MediaRef | null;
      detachedOldAsset: false;
    }
  | { ok: false; reason: "layer_missing" | "not_image" | "media_not_ready" } {
  if (selection.source.status !== "ready" || selection.derivative.status !== "ready") {
    return { ok: false, reason: "media_not_ready" };
  }
  const next = cloneDocument(document);
  for (const scene of next.scenes) {
    const index = scene.layers.findIndex((layer) => layer.id === layerId);
    if (index < 0) continue;
    const current = scene.layers[index]!;
    if (current.type !== "IMAGE") return { ok: false, reason: "not_image" };
    const previousMediaRef = mediaRefFromLayer(current);
    const replaced: IntroV3Layer = {
      ...current,
      id: current.id,
      type: "IMAGE",
      visible: current.visible,
      z: current.z,
      geometry: { ...current.geometry },
      motion: JSON.parse(JSON.stringify(current.motion)),
      payload: { ...current.payload, mediaRef: formatMediaRefToken(selection.mediaRef) },
    };
    scene.layers[index] = replaced;
    return { ok: true, document: next, layer: replaced, previousMediaRef, detachedOldAsset: false };
  }
  return { ok: false, reason: "layer_missing" };
}

export function imageLayerIds(document: IntroV3Document, sceneId: string): string[] {
  const scene = document.scenes.find((item) => item.id === sceneId);
  if (!scene) return [];
  return scene.layers.filter((layer) => layer.type === "IMAGE").map((layer) => layer.id);
}
