import { parseIntroV3Document, type IntroV3Document, type IntroV3Layer } from "@/lib/startup/intro-v3/document";
import {
  initialIntroV3ImageGeometry,
  normalizeIntroV3Geometry,
  type IntroV3Fit,
  type IntroV3Geometry,
} from "@/lib/startup/intro-v3/geometry";
import { defaultIntroV3LayerMotion } from "@/lib/startup/intro-v3/motion";
import {
  applyIntroV3LibraryOutcome,
  formatMediaRefToken,
  mediaRefFromLayer,
  type IntroV3LibraryOutcome,
} from "@/lib/startup/intro-v3/media-library";
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

export function deleteImageLayerFromDocument(
  document: IntroV3Document,
  layerId: string
):
  | { ok: true; document: IntroV3Document; deletedLayerId: string; detachedAsset: false }
  | { ok: false; reason: "layer_missing" } {
  const next = cloneDocument(document);
  for (const scene of next.scenes) {
    const index = scene.layers.findIndex((layer) => layer.id === layerId);
    if (index < 0) continue;
    scene.layers = scene.layers.filter((layer) => layer.id !== layerId);
    return { ok: true, document: next, deletedLayerId: layerId, detachedAsset: false };
  }
  return { ok: false, reason: "layer_missing" };
}

function patchImageLayer(
  document: IntroV3Document,
  layerId: string,
  patch: (layer: IntroV3Layer) => IntroV3Layer | null
): { ok: true; document: IntroV3Document; layer: IntroV3Layer } | { ok: false; reason: "layer_missing" | "not_image" } {
  const next = cloneDocument(document);
  for (const scene of next.scenes) {
    const index = scene.layers.findIndex((layer) => layer.id === layerId);
    if (index < 0) continue;
    const current = scene.layers[index]!;
    if (current.type !== "IMAGE") return { ok: false, reason: "not_image" };
    const patched = patch(current);
    if (!patched) return { ok: false, reason: "not_image" };
    scene.layers[index] = patched;
    return { ok: true, document: next, layer: patched };
  }
  return { ok: false, reason: "layer_missing" };
}

export function setImageLayerGeometry(
  document: IntroV3Document,
  layerId: string,
  geometry: IntroV3Geometry
): ReturnType<typeof patchImageLayer> {
  const normalized = normalizeIntroV3Geometry(geometry);
  if (!normalized) return { ok: false, reason: "not_image" };
  return patchImageLayer(document, layerId, (layer) => ({ ...layer, geometry: normalized }));
}

export function setImageLayerFit(
  document: IntroV3Document,
  layerId: string,
  fit: IntroV3Fit
): ReturnType<typeof patchImageLayer> {
  return patchImageLayer(document, layerId, (layer) => ({
    ...layer,
    geometry: { ...layer.geometry, fit },
  }));
}

export function setImageLayerVisible(
  document: IntroV3Document,
  layerId: string,
  visible: boolean
): ReturnType<typeof patchImageLayer> {
  return patchImageLayer(document, layerId, (layer) => ({ ...layer, visible }));
}

export function setImageLayerZ(
  document: IntroV3Document,
  layerId: string,
  z: number
): ReturnType<typeof patchImageLayer> {
  return patchImageLayer(document, layerId, (layer) => ({ ...layer, z: Math.max(1, Math.round(z)) }));
}

export function serializeIntroV3WorkingDraft(document: IntroV3Document): IntroV3Document {
  return cloneDocument(document);
}

export function hydrateIntroV3SavedDocument(raw: unknown): IntroV3Document | null {
  return parseIntroV3Document(raw);
}

export function introV3WorkingFingerprint(input: { name: string; document: IntroV3Document }): string {
  return JSON.stringify({ name: input.name, document: input.document });
}

export function introV3IsDirty(saved: string, working: string): boolean {
  return saved !== working;
}

export type IntroV3PointerWriteProbe = {
  dbWrite: number;
  apiWrite: number;
  upload: number;
  process: number;
};

export function createIdlePointerWriteProbe(): IntroV3PointerWriteProbe {
  return { dbWrite: 0, apiWrite: 0, upload: 0, process: 0 };
}

export function applyLocalImageGeometry(
  document: IntroV3Document,
  layerId: string,
  geometry: IntroV3Geometry,
  _probe?: IntroV3PointerWriteProbe
): ReturnType<typeof setImageLayerGeometry> {
  return setImageLayerGeometry(document, layerId, geometry);
}

function findLayer(document: IntroV3Document, layerId: string | null | undefined): IntroV3Layer | null {
  if (!layerId) return null;
  for (const scene of document.scenes) {
    const layer = scene.layers.find((item) => item.id === layerId);
    if (layer) return layer;
  }
  return null;
}

export type IntroV3ImageCommitResult = {
  document: IntroV3Document;
  sceneMutated: boolean;
  layersCreated: 0 | 1;
  selectedLayerId: string | null;
  previousMediaRef: IntroV3MediaRef | null;
  nextMediaRef: IntroV3MediaRef | null;
  detachedOldAsset: false;
};

export function commitIntroV3ImageLibraryOutcome(input: {
  document: IntroV3Document;
  sceneId: string;
  outcome: IntroV3LibraryOutcome;
  replaceLayerId?: string | null;
}): IntroV3ImageCommitResult {
  const applied = applyIntroV3LibraryOutcome(input.outcome, {
    replaceLayer: findLayer(input.document, input.replaceLayerId),
  });
  if (!applied.selected) {
    return {
      document: input.document,
      sceneMutated: false,
      layersCreated: 0,
      selectedLayerId: input.replaceLayerId ?? null,
      previousMediaRef: applied.previousMediaRef,
      nextMediaRef: null,
      detachedOldAsset: false,
    };
  }
  if (applied.selected.intent === "REPLACE_MEDIA" && input.replaceLayerId) {
    const replaced = replaceImageLayerMedia(input.document, input.replaceLayerId, applied.selected);
    if (!replaced.ok) {
      return {
        document: input.document,
        sceneMutated: false,
        layersCreated: 0,
        selectedLayerId: input.replaceLayerId,
        previousMediaRef: applied.previousMediaRef,
        nextMediaRef: null,
        detachedOldAsset: false,
      };
    }
    return {
      document: replaced.document,
      sceneMutated: true,
      layersCreated: 0,
      selectedLayerId: replaced.layer.id,
      previousMediaRef: replaced.previousMediaRef,
      nextMediaRef: applied.nextMediaRef,
      detachedOldAsset: false,
    };
  }
  const added = addImageLayerToDocument(input.document, input.sceneId, applied.selected);
  if (!added.ok) {
    return {
      document: input.document,
      sceneMutated: false,
      layersCreated: 0,
      selectedLayerId: null,
      previousMediaRef: null,
      nextMediaRef: null,
      detachedOldAsset: false,
    };
  }
  return {
    document: added.document,
    sceneMutated: true,
    layersCreated: 1,
    selectedLayerId: added.layer.id,
    previousMediaRef: null,
    nextMediaRef: applied.nextMediaRef,
    detachedOldAsset: false,
  };
}
