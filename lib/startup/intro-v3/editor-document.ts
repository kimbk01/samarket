import type {
  IntroV3AdvanceMode,
  IntroV3Background,
  IntroV3Document,
  IntroV3Layer,
  IntroV3Scene,
} from "@/lib/startup/intro-v3/document";
import { INTRO_V3_ADVANCE_MODES } from "@/lib/startup/intro-v3/document";
import { normalizeIntroV3Geometry, type IntroV3Fit, type IntroV3Geometry } from "@/lib/startup/intro-v3/geometry";
import type { IntroV3SceneTransition } from "@/lib/startup/intro-v3/motion";

function cloneDocument(document: IntroV3Document): IntroV3Document {
  return JSON.parse(JSON.stringify(document)) as IntroV3Document;
}

function findLayer(
  document: IntroV3Document,
  layerId: string
): { scene: IntroV3Scene; index: number; layer: IntroV3Layer } | null {
  for (const scene of document.scenes) {
    const index = scene.layers.findIndex((layer) => layer.id === layerId);
    if (index < 0) continue;
    return { scene, index, layer: scene.layers[index]! };
  }
  return null;
}

export function patchIntroV3LayerGeometry(
  document: IntroV3Document,
  layerId: string,
  geometry: IntroV3Geometry
): IntroV3Document | null {
  const next = cloneDocument(document);
  const found = findLayer(next, layerId);
  if (!found) return null;
  const normalized = normalizeIntroV3Geometry(geometry);
  if (!normalized) return null;
  found.scene.layers[found.index] = { ...found.layer, geometry: normalized };
  return next;
}

export function patchIntroV3LayerFit(
  document: IntroV3Document,
  layerId: string,
  fit: IntroV3Fit
): IntroV3Document | null {
  const next = cloneDocument(document);
  const found = findLayer(next, layerId);
  if (!found) return null;
  found.scene.layers[found.index] = {
    ...found.layer,
    geometry: { ...found.layer.geometry, fit },
  };
  return next;
}

export function patchIntroV3LayerVisible(
  document: IntroV3Document,
  layerId: string,
  visible: boolean
): IntroV3Document | null {
  const next = cloneDocument(document);
  const found = findLayer(next, layerId);
  if (!found) return null;
  found.scene.layers[found.index] = { ...found.layer, visible };
  return next;
}

export function deleteIntroV3Layer(document: IntroV3Document, layerId: string): IntroV3Document | null {
  const next = cloneDocument(document);
  const found = findLayer(next, layerId);
  if (!found) return null;
  found.scene.layers = found.scene.layers.filter((layer) => layer.id !== layerId);
  return next;
}

export function moveIntroV3LayerZ(
  document: IntroV3Document,
  layerId: string,
  direction: "up" | "down"
): IntroV3Document | null {
  const next = cloneDocument(document);
  const found = findLayer(next, layerId);
  if (!found) return null;
  const delta = direction === "up" ? 1 : -1;
  const targetZ = found.layer.z + delta;
  const swap = found.scene.layers.find((layer) => layer.z === targetZ);
  if (swap) {
    const swapIndex = found.scene.layers.findIndex((layer) => layer.id === swap.id);
    found.scene.layers[found.index] = { ...found.layer, z: swap.z };
    found.scene.layers[swapIndex] = { ...swap, z: found.layer.z };
    return next;
  }
  found.scene.layers[found.index] = { ...found.layer, z: Math.max(1, found.layer.z + delta) };
  return next;
}

export function patchIntroV3Scene(
  document: IntroV3Document,
  sceneId: string,
  patch: {
    background?: IntroV3Background;
    holdMs?: number;
    advance?: IntroV3AdvanceMode;
    transition?: IntroV3SceneTransition;
  }
): IntroV3Document | null {
  const next = cloneDocument(document);
  const scene = next.scenes.find((item) => item.id === sceneId);
  if (!scene) return null;
  if (patch.background) scene.background = patch.background;
  if (patch.holdMs != null && Number.isFinite(patch.holdMs)) {
    scene.holdMs = Math.max(0, Math.min(60_000, Math.round(patch.holdMs)));
  }
  if (patch.advance && (INTRO_V3_ADVANCE_MODES as readonly string[]).includes(patch.advance)) {
    scene.advance = patch.advance;
  }
  if (patch.transition) scene.transition = patch.transition;
  return next;
}
