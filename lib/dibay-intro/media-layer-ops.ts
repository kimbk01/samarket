import { createImageLayer, createLogoLayer } from "@/lib/dibay-intro/default-layers";
import type { DibayIntroLayer, NormalizedFrame } from "@/lib/dibay-intro/document";
import type { DibayIntroWorkingDocument } from "@/lib/dibay-intro/working-document";

export type MediaAttachIntent =
  | { kind: "create"; sceneId: string; type: "IMAGE" | "LOGO" }
  | { kind: "replace"; sceneId: string; layerId: string };

export type MediaAttachResult =
  | { ok: true; mediaId: string; ready: true }
  | { ok: false; reason: "cancel" | "failure" };

export function applyMediaAttach(
  working: DibayIntroWorkingDocument,
  intent: MediaAttachIntent,
  result: MediaAttachResult,
): { mutated: boolean; ghost: number } {
  if (!result.ok || !result.ready) return { mutated: false, ghost: 0 };
  if (intent.kind === "create") {
    const scene = working.selectScene(intent.sceneId);
    if (!scene) return { mutated: false, ghost: 0 };
    const z = scene.layers.reduce((max, layer) => Math.max(max, layer.z), 0) + 1;
    const layer = intent.type === "IMAGE" ? createImageLayer(result.mediaId, z) : createLogoLayer(result.mediaId, z);
    working.addLayer(intent.sceneId, layer);
    return { mutated: true, ghost: 0 };
  }
  const scene = working.selectScene(intent.sceneId);
  const layer = scene?.layers.find((item) => item.id === intent.layerId);
  if (!layer || (layer.type !== "IMAGE" && layer.type !== "LOGO")) {
    return { mutated: false, ghost: 0 };
  }
  const frame: NormalizedFrame = { ...layer.frame };
  const layerId = layer.id;
  const z = layer.z;
  working.updateLayer(intent.sceneId, intent.layerId, { mediaId: result.mediaId } as Partial<DibayIntroLayer>);
  const next = working.selectScene(intent.sceneId)?.layers.find((item) => item.id === layerId);
  if (!next || next.type !== layer.type || next.frame.x !== frame.x || next.z !== z) {
    return { mutated: false, ghost: 1 };
  }
  return { mutated: true, ghost: 0 };
}
