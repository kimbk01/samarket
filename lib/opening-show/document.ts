import { DIBAY_OPENING_GREEN } from "@/lib/opening-show/brand";
import { normalizeFrame, type NormalizedRect } from "@/lib/opening-show/geometry";

export const OPENING_DOCUMENT_VERSION = 1;

export type OpeningImageFit = "contain" | "cover";

export type OpeningImageLayer = {
  id: string;
  type: "image";
  mediaId: string;
  frame: NormalizedRect;
  fit: OpeningImageFit;
  zIndex: number;
  visible: boolean;
};

export type OpeningScene = {
  id: string;
  background: { color: string };
  layers: OpeningImageLayer[];
};

export type OpeningDocument = {
  version: number;
  scenes: OpeningScene[];
};

function newId(): string {
  return globalThis.crypto.randomUUID();
}

export function createEmptyOpeningDocument(): OpeningDocument {
  return {
    version: OPENING_DOCUMENT_VERSION,
    scenes: [
      {
        id: newId(),
        background: { color: DIBAY_OPENING_GREEN },
        layers: [],
      },
    ],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseFrame(raw: unknown): NormalizedRect | null {
  if (!isRecord(raw)) return null;
  const x = Number(raw.x);
  const y = Number(raw.y);
  const w = Number(raw.w);
  const h = Number(raw.h);
  if (![x, y, w, h].every((n) => Number.isFinite(n))) return null;
  return normalizeFrame({ x, y, w, h });
}

function parseLayer(raw: unknown): OpeningImageLayer | null {
  if (!isRecord(raw)) return null;
  if (raw.type !== "image") return null;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const mediaId = typeof raw.mediaId === "string" ? raw.mediaId.trim() : "";
  if (!id || !mediaId) return null;
  const frame = parseFrame(raw.frame);
  if (!frame) return null;
  const fit = raw.fit === "cover" ? "cover" : raw.fit === "contain" ? "contain" : null;
  if (!fit) return null;
  const zIndex = Number(raw.zIndex);
  if (!Number.isFinite(zIndex)) return null;
  if (typeof raw.visible !== "boolean") return null;
  return { id, type: "image", mediaId, frame, fit, zIndex, visible: raw.visible };
}

function parseScene(raw: unknown): OpeningScene | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id) return null;
  const background = isRecord(raw.background) ? raw.background : null;
  const color =
    typeof background?.color === "string" && /^#[0-9A-Fa-f]{6}$/.test(background.color)
      ? background.color
      : DIBAY_OPENING_GREEN;
  if (!Array.isArray(raw.layers)) return null;
  const layers: OpeningImageLayer[] = [];
  for (const item of raw.layers) {
    const layer = parseLayer(item);
    if (!layer) return null;
    layers.push(layer);
  }
  return { id, background: { color }, layers };
}

export function parseOpeningDocument(raw: unknown): OpeningDocument | null {
  if (!isRecord(raw)) return null;
  if (raw.version !== OPENING_DOCUMENT_VERSION) return null;
  if (!Array.isArray(raw.scenes) || raw.scenes.length !== 1) return null;
  const scene = parseScene(raw.scenes[0]);
  if (!scene) return null;
  const ids = new Set(scene.layers.map((layer) => layer.id));
  if (ids.size !== scene.layers.length) return null;
  return { version: OPENING_DOCUMENT_VERSION, scenes: [scene] };
}

export function openingPrimaryScene(doc: OpeningDocument): OpeningScene {
  const scene = doc.scenes[0];
  if (!scene) {
    return createEmptyOpeningDocument().scenes[0]!;
  }
  return scene;
}
