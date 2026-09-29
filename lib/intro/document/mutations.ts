/**
 * DIBAY INTRO — CUT A
 * Pure local authoring mutations over IntroDocumentV1.
 * During drag/resize: callers MUST only use these — never hit DB/API.
 */

import type {
  FrameV1,
  IntroDocumentV1,
  LayerMotionV1,
  LayerTypeV1,
  LayerV1,
  SceneBackgroundV1,
  SceneV1,
  TransitionV1,
} from "../contracts/document";
import { resolveLayerMotion } from "../contracts/motion";
import {
  createDefaultLayer,
  createEmptyScene,
  createSceneFromCandidate,
  normalizeSceneTransitions,
  newId,
} from "./factory";

export type AuthoringMutationKind =
  | "scene_add"
  | "scene_select_local"
  | "scene_reorder"
  | "scene_delete"
  | "scene_rename"
  | "scene_duration"
  | "scene_transition"
  | "scene_background"
  | "layer_add"
  | "layer_update"
  | "layer_delete"
  | "layer_z"
  | "layer_visibility"
  | "layer_frame"
  | "layer_media"
  | "layer_motion"
  | "layer_tablet_override"
  | "title";

/**
 * Instrumentation surface for drag/resize local-only proof.
 * Tests assert no network kinds are emitted during pointer move.
 */
export type LocalAuthoringEvent = {
  readonly kind: AuthoringMutationKind;
  readonly at: number;
  readonly touchesNetwork: false;
};

const listeners = new Set<(e: LocalAuthoringEvent) => void>();

export function subscribeLocalAuthoring(
  fn: (e: LocalAuthoringEvent) => void,
): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function emit(kind: AuthoringMutationKind) {
  const event: LocalAuthoringEvent = {
    kind,
    at: Date.now(),
    touchesNetwork: false,
  };
  for (const fn of listeners) fn(event);
}

function withScenes(
  doc: IntroDocumentV1,
  scenes: SceneV1[],
): IntroDocumentV1 {
  return {
    ...doc,
    scenes: normalizeSceneTransitions(scenes),
  };
}

function mapScene(
  doc: IntroDocumentV1,
  sceneId: string,
  map: (scene: SceneV1) => SceneV1,
): IntroDocumentV1 {
  const scenes = doc.scenes.map((s) => (s.sceneId === sceneId ? map(s) : s));
  return withScenes(doc, scenes);
}

export function setDocumentTitle(
  doc: IntroDocumentV1,
  title: string,
): IntroDocumentV1 {
  emit("title");
  return { ...doc, title: title.trim() || doc.title };
}

/**
 * @deprecated Prefer addSceneFromCandidate — immediate addScene is the rejected
 * silent black/FADE300/2500 path. Kept for automated fixtures only.
 */
export function addScene(
  doc: IntroDocumentV1,
  opts?: { name?: string; durationMs?: number },
): { document: IntroDocumentV1; sceneId: string } {
  emit("scene_add");
  const scene = createEmptyScene({
    name: opts?.name ?? `Scene ${doc.scenes.length + 1}`,
    durationMs: opts?.durationMs,
  });
  return {
    document: withScenes(doc, [...doc.scenes, scene]),
    sceneId: scene.sceneId,
  };
}

/** Operator-confirmed scene create — ZERO mutation until this is called. */
export function addSceneFromCandidate(
  doc: IntroDocumentV1,
  candidate: {
    name: string;
    durationMs: number;
    background: SceneBackgroundV1;
    transitionAfter: TransitionV1 | null;
  },
): { document: IntroDocumentV1; sceneId: string } {
  emit("scene_add");
  const scene = createSceneFromCandidate(candidate);
  return {
    document: withScenes(doc, [...doc.scenes, scene]),
    sceneId: scene.sceneId,
  };
}

export function reorderScenes(
  doc: IntroDocumentV1,
  orderedSceneIds: readonly string[],
): IntroDocumentV1 {
  emit("scene_reorder");
  const byId = new Map(doc.scenes.map((s) => [s.sceneId, s]));
  const next: SceneV1[] = [];
  for (const id of orderedSceneIds) {
    const s = byId.get(id);
    if (s) {
      next.push(s);
      byId.delete(id);
    }
  }
  for (const s of byId.values()) next.push(s);
  return withScenes(doc, next);
}

export function deleteScene(
  doc: IntroDocumentV1,
  sceneId: string,
): IntroDocumentV1 {
  emit("scene_delete");
  return withScenes(
    doc,
    doc.scenes.filter((s) => s.sceneId !== sceneId),
  );
}

export function renameScene(
  doc: IntroDocumentV1,
  sceneId: string,
  name: string,
): IntroDocumentV1 {
  emit("scene_rename");
  return mapScene(doc, sceneId, (s) => ({ ...s, name: name.trim() || s.name }));
}

export function setSceneDuration(
  doc: IntroDocumentV1,
  sceneId: string,
  durationMs: number,
): IntroDocumentV1 {
  emit("scene_duration");
  const clamped = Math.max(100, Math.min(60_000, Math.round(durationMs)));
  return mapScene(doc, sceneId, (s) => ({ ...s, durationMs: clamped }));
}

export function setSceneTransition(
  doc: IntroDocumentV1,
  sceneId: string,
  transitionAfter: TransitionV1 | null,
): IntroDocumentV1 {
  emit("scene_transition");
  return mapScene(doc, sceneId, (s) => ({ ...s, transitionAfter }));
}

export function setSceneBackground(
  doc: IntroDocumentV1,
  sceneId: string,
  background: SceneBackgroundV1,
): IntroDocumentV1 {
  emit("scene_background");
  return mapScene(doc, sceneId, (s) => ({ ...s, background }));
}

export function addLayer(
  doc: IntroDocumentV1,
  sceneId: string,
  type: LayerTypeV1,
  opts?: { mediaRefId?: string | null },
): { document: IntroDocumentV1; layerId: string } {
  emit("layer_add");
  let layerId = "";
  const document = mapScene(doc, sceneId, (s) => {
    const layer = createDefaultLayer(type, s.layers, opts);
    layerId = layer.layerId;
    return { ...s, layers: [...s.layers, layer] };
  });
  return { document, layerId };
}

export function updateLayer(
  doc: IntroDocumentV1,
  sceneId: string,
  layerId: string,
  /** Must not change layerId/type — identity is fixed after create. */
  patch: Omit<Partial<LayerV1>, "layerId" | "type">,
): IntroDocumentV1 {
  emit("layer_update");
  return mapScene(doc, sceneId, (s) => ({
    ...s,
    layers: s.layers.map((l) =>
      l.layerId === layerId ? ({ ...l, ...patch } as LayerV1) : l,
    ),
  }));
}

export function deleteLayer(
  doc: IntroDocumentV1,
  sceneId: string,
  layerId: string,
): IntroDocumentV1 {
  emit("layer_delete");
  return mapScene(doc, sceneId, (s) => ({
    ...s,
    layers: s.layers.filter((l) => l.layerId !== layerId),
  }));
}

export function setLayerVisibility(
  doc: IntroDocumentV1,
  sceneId: string,
  layerId: string,
  visible: boolean,
): IntroDocumentV1 {
  emit("layer_visibility");
  return updateLayer(doc, sceneId, layerId, { visible });
}

export function setLayerMotion(
  doc: IntroDocumentV1,
  sceneId: string,
  layerId: string,
  motion: LayerMotionV1,
): IntroDocumentV1 {
  emit("layer_motion");
  return updateLayer(doc, sceneId, layerId, {
    motion: resolveLayerMotion(motion),
  });
}

/**
 * LOCAL-ONLY geometry write — used by drag/resize pointer move.
 * MUST NOT trigger Save / Media / DB.
 */
export function setLayerFrame(
  doc: IntroDocumentV1,
  sceneId: string,
  layerId: string,
  frame: FrameV1,
  opts?: { tabletLandscape?: boolean },
): IntroDocumentV1 {
  emit("layer_frame");
  return mapScene(doc, sceneId, (s) => ({
    ...s,
    layers: s.layers.map((l) => {
      if (l.layerId !== layerId) return l;
      if (opts?.tabletLandscape) {
        return {
          ...l,
          layoutOverrides: {
            ...l.layoutOverrides,
            TABLET_LANDSCAPE: { frame },
          },
        };
      }
      return { ...l, frame };
    }),
  }));
}

export function clearTabletOverride(
  doc: IntroDocumentV1,
  sceneId: string,
  layerId: string,
): IntroDocumentV1 {
  emit("layer_tablet_override");
  return mapScene(doc, sceneId, (s) => ({
    ...s,
    layers: s.layers.map((l) => {
      if (l.layerId !== layerId) return l;
      if (!l.layoutOverrides?.TABLET_LANDSCAPE) return l;
      const { TABLET_LANDSCAPE: _drop, ...rest } = l.layoutOverrides;
      const nextOverrides =
        Object.keys(rest).length > 0 ? rest : undefined;
      return { ...l, layoutOverrides: nextOverrides };
    }),
  }));
}

/**
 * Replace media atomicity:
 * same layerId/geometry/z/visibility; only mediaRefId changes on success.
 */
export function setLayerMediaRef(
  doc: IntroDocumentV1,
  sceneId: string,
  layerId: string,
  mediaRefId: string,
): IntroDocumentV1 {
  emit("layer_media");
  return mapScene(doc, sceneId, (s) => ({
    ...s,
    layers: s.layers.map((l) => {
      if (l.layerId !== layerId) return l;
      if (l.type !== "IMAGE" && l.type !== "LOGO") return l;
      return { ...l, mediaRefId };
    }),
  }));
}

export function moveLayerZ(
  doc: IntroDocumentV1,
  sceneId: string,
  layerId: string,
  direction: "forward" | "backward",
): IntroDocumentV1 {
  emit("layer_z");
  return mapScene(doc, sceneId, (s) => {
    const sorted = [...s.layers].sort((a, b) => a.zIndex - b.zIndex);
    const idx = sorted.findIndex((l) => l.layerId === layerId);
    if (idx < 0) return s;
    const swapWith = direction === "forward" ? idx + 1 : idx - 1;
    if (swapWith < 0 || swapWith >= sorted.length) return s;
    const a = sorted[idx]!;
    const b = sorted[swapWith]!;
    const zA = a.zIndex;
    const zB = b.zIndex;
    return {
      ...s,
      layers: s.layers.map((l) => {
        if (l.layerId === a.layerId) return { ...l, zIndex: zB };
        if (l.layerId === b.layerId) return { ...l, zIndex: zA };
        return l;
      }),
    };
  });
}

export function duplicateScene(
  doc: IntroDocumentV1,
  sceneId: string,
): { document: IntroDocumentV1; sceneId: string } {
  emit("scene_add");
  const source = doc.scenes.find((s) => s.sceneId === sceneId);
  if (!source) return { document: doc, sceneId: "" };
  const cloned: SceneV1 = {
    ...source,
    sceneId: newId(),
    name: `${source.name} copy`,
    layers: source.layers.map((l) => ({
      ...l,
      layerId: newId(),
    })),
  };
  const idx = doc.scenes.findIndex((s) => s.sceneId === sceneId);
  const scenes = [...doc.scenes];
  scenes.splice(idx + 1, 0, cloned);
  return { document: withScenes(doc, scenes), sceneId: cloned.sceneId };
}

export function clampNormalizedFrame(frame: FrameV1): FrameV1 {
  const w = Math.max(0.01, Math.min(1, frame.w));
  const h = Math.max(0.01, Math.min(1, frame.h));
  const x = Math.max(0, Math.min(1 - w, frame.x));
  const y = Math.max(0, Math.min(1 - h, frame.y));
  return { x, y, w, h };
}

/**
 * Set Scene full-bleed background IMAGE via canonical VIEWPORT IMAGE layer.
 * Does NOT reopen SceneBackground schema. Media authority unchanged.
 */
export function setSceneBackgroundImage(
  doc: IntroDocumentV1,
  sceneId: string,
  mediaRefId: string,
): { document: IntroDocumentV1; layerId: string } {
  emit("layer_media");
  let layerId = "";
  const document = mapScene(doc, sceneId, (s) => {
    const existing = s.layers.find(
      (l) =>
        l.type === "IMAGE" &&
        l.surface === "VIEWPORT" &&
        l.frame.x <= 0.02 &&
        l.frame.y <= 0.02 &&
        l.frame.w >= 0.96 &&
        l.frame.h >= 0.96,
    );
    if (existing && existing.type === "IMAGE") {
      layerId = existing.layerId;
      return {
        ...s,
        layers: s.layers.map((l) =>
          l.layerId === existing.layerId
            ? {
                ...l,
                mediaRefId,
                visible: true,
                opacity: 1,
                fit: "COVER" as const,
                surface: "VIEWPORT" as const,
                frame: { x: 0, y: 0, w: 1, h: 1 },
              }
            : l,
        ),
      };
    }
    const minZ =
      s.layers.length === 0
        ? 0
        : Math.min(...s.layers.map((l) => l.zIndex)) - 1;
    const layer = createDefaultLayer("IMAGE", s.layers, { mediaRefId });
    if (layer.type !== "IMAGE") return s;
    layerId = layer.layerId;
    const bgLayer: typeof layer = {
      ...layer,
      frame: { x: 0, y: 0, w: 1, h: 1 },
      fit: "COVER",
      surface: "VIEWPORT",
      zIndex: minZ,
      visible: true,
      opacity: 1,
    };
    return { ...s, layers: [bgLayer, ...s.layers] };
  });
  return { document, layerId };
}

/** Remove Scene background IMAGE layer only — keeps SOLID background color. */
export function clearSceneBackgroundImage(
  doc: IntroDocumentV1,
  sceneId: string,
): IntroDocumentV1 {
  emit("layer_delete");
  return mapScene(doc, sceneId, (s) => ({
    ...s,
    layers: s.layers.filter(
      (l) =>
        !(
          l.type === "IMAGE" &&
          l.surface === "VIEWPORT" &&
          l.frame.x <= 0.02 &&
          l.frame.y <= 0.02 &&
          l.frame.w >= 0.96 &&
          l.frame.h >= 0.96
        ),
    ),
  }));
}
