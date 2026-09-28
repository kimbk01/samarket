import {
  openingPrimaryScene,
  type OpeningDocument,
  type OpeningImageFit,
  type OpeningImageLayer,
} from "@/lib/opening-show/document";
import { normalizeFrame, type NormalizedRect } from "@/lib/opening-show/geometry";

function newId(): string {
  return globalThis.crypto.randomUUID();
}

function withPrimaryScene(
  doc: OpeningDocument,
  update: (layers: OpeningImageLayer[]) => OpeningImageLayer[]
): OpeningDocument {
  const scene = openingPrimaryScene(doc);
  return {
    version: doc.version,
    scenes: [
      {
        ...scene,
        layers: update(scene.layers.map((layer) => ({ ...layer, frame: normalizeFrame(layer.frame) }))),
      },
    ],
  };
}

export function addImageLayer(
  doc: OpeningDocument,
  input: { id?: string; mediaId: string; frame: NormalizedRect; fit?: OpeningImageFit }
): OpeningDocument {
  const mediaId = input.mediaId.trim();
  if (!mediaId) return doc;
  return withPrimaryScene(doc, (layers) => {
    const zIndex = layers.reduce((max, layer) => Math.max(max, layer.zIndex), 0) + 1;
    const next: OpeningImageLayer = {
      id: input.id?.trim() || newId(),
      type: "image",
      mediaId,
      frame: normalizeFrame(input.frame),
      fit: input.fit ?? "contain",
      zIndex,
      visible: true,
    };
    return [...layers, next];
  });
}

export function replaceLayerMedia(
  doc: OpeningDocument,
  layerId: string,
  mediaId: string
): OpeningDocument {
  const nextMedia = mediaId.trim();
  if (!nextMedia) return doc;
  return withPrimaryScene(doc, (layers) =>
    layers.map((layer) => (layer.id === layerId ? { ...layer, mediaId: nextMedia } : layer))
  );
}

export function removeLayer(doc: OpeningDocument, layerId: string): OpeningDocument {
  return withPrimaryScene(doc, (layers) => layers.filter((layer) => layer.id !== layerId));
}

export function setLayerFrame(
  doc: OpeningDocument,
  layerId: string,
  frame: NormalizedRect
): OpeningDocument {
  return withPrimaryScene(doc, (layers) =>
    layers.map((layer) => (layer.id === layerId ? { ...layer, frame: normalizeFrame(frame) } : layer))
  );
}

export function setLayerFit(
  doc: OpeningDocument,
  layerId: string,
  fit: OpeningImageFit
): OpeningDocument {
  return withPrimaryScene(doc, (layers) =>
    layers.map((layer) => (layer.id === layerId ? { ...layer, fit } : layer))
  );
}

export function setLayerVisible(
  doc: OpeningDocument,
  layerId: string,
  visible: boolean
): OpeningDocument {
  return withPrimaryScene(doc, (layers) =>
    layers.map((layer) => (layer.id === layerId ? { ...layer, visible } : layer))
  );
}

export function moveLayerZ(
  doc: OpeningDocument,
  layerId: string,
  direction: "forward" | "backward"
): OpeningDocument {
  return withPrimaryScene(doc, (layers) => {
    const sorted = [...layers].sort((a, b) => a.zIndex - b.zIndex);
    const index = sorted.findIndex((layer) => layer.id === layerId);
    if (index < 0) return layers;
    const swapWith = direction === "forward" ? index + 1 : index - 1;
    if (swapWith < 0 || swapWith >= sorted.length) return layers;
    const current = sorted[index]!;
    const other = sorted[swapWith]!;
    const currentZ = current.zIndex;
    sorted[index] = { ...current, zIndex: other.zIndex };
    sorted[swapWith] = { ...other, zIndex: currentZ };
    const byId = new Map(sorted.map((layer) => [layer.id, layer]));
    return layers.map((layer) => byId.get(layer.id) ?? layer);
  });
}

export function findLayer(doc: OpeningDocument, layerId: string | null): OpeningImageLayer | null {
  if (!layerId) return null;
  return openingPrimaryScene(doc).layers.find((layer) => layer.id === layerId) ?? null;
}
