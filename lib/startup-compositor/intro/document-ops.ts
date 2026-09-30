/**
 * REBUILD 14 P4 — Scene document operations (semantic only; no Admin UI).
 * CRUD shapes for later Admin; runtime consumes ordered scenes.
 */

import {
  cryptoRandomId,
  DEFAULT_TRANSITION_CUT,
  type IntroDocumentV1,
  type SceneV1,
} from "@/lib/intro/contracts/document";

export type SceneOpsResult =
  | { readonly ok: true; readonly value: IntroDocumentV1 }
  | { readonly ok: false; readonly reason: string };

function cloneDoc(doc: IntroDocumentV1): IntroDocumentV1 {
  return {
    ...doc,
    scenes: doc.scenes.map((s) => ({
      ...s,
      elements: s.elements.map((e) => ({ ...e, motion: { ...e.motion }, payload: { ...e.payload }, frame: { ...e.frame } })),
      background: { ...s.background },
      transition: { ...s.transition },
    })),
  };
}

export function createScene(
  doc: IntroDocumentV1,
  partial?: Partial<Pick<SceneV1, "name" | "durationMs">>,
): SceneOpsResult {
  const next = cloneDoc(doc);
  const scene: SceneV1 = {
    id: cryptoRandomId(),
    name: partial?.name?.trim() || `장면 ${next.scenes.length + 1}`,
    durationMs: partial?.durationMs ?? 2500,
    background: { type: "COLOR", color: "#0B1B3A" },
    transition: DEFAULT_TRANSITION_CUT,
    elements: [],
  };
  return { ok: true, value: { ...next, scenes: [...next.scenes, scene] } };
}

export function renameScene(
  doc: IntroDocumentV1,
  sceneId: string,
  name: string,
): SceneOpsResult {
  const trimmed = String(name || "").trim();
  if (!trimmed) return { ok: false, reason: "scene_name_empty" };
  const idx = doc.scenes.findIndex((s) => s.id === sceneId);
  if (idx < 0) return { ok: false, reason: "scene_not_found" };
  const next = cloneDoc(doc);
  const scenes = [...next.scenes];
  scenes[idx] = { ...scenes[idx]!, name: trimmed };
  return { ok: true, value: { ...next, scenes } };
}

export function duplicateScene(
  doc: IntroDocumentV1,
  sceneId: string,
): SceneOpsResult {
  const idx = doc.scenes.findIndex((s) => s.id === sceneId);
  if (idx < 0) return { ok: false, reason: "scene_not_found" };
  const src = doc.scenes[idx]!;
  const copy: SceneV1 = {
    ...src,
    id: cryptoRandomId(),
    name: `${src.name || "장면"} 복사`,
    elements: src.elements.map((e) => ({
      ...e,
      id: cryptoRandomId(),
      motion: { ...e.motion },
      payload: { ...e.payload },
      frame: { ...e.frame },
    })),
    background: { ...src.background },
    transition: { ...src.transition },
  };
  const next = cloneDoc(doc);
  const scenes = [...next.scenes];
  scenes.splice(idx + 1, 0, copy);
  return { ok: true, value: { ...next, scenes } };
}

export function reorderScenes(
  doc: IntroDocumentV1,
  orderedSceneIds: readonly string[],
): SceneOpsResult {
  if (orderedSceneIds.length !== doc.scenes.length) {
    return { ok: false, reason: "scene_reorder_length_mismatch" };
  }
  const map = new Map(doc.scenes.map((s) => [s.id, s]));
  const scenes: SceneV1[] = [];
  const seen = new Set<string>();
  for (const id of orderedSceneIds) {
    if (seen.has(id)) return { ok: false, reason: "scene_reorder_duplicate_id" };
    const s = map.get(id);
    if (!s) return { ok: false, reason: "scene_reorder_unknown_id" };
    seen.add(id);
    scenes.push(s);
  }
  return { ok: true, value: { ...cloneDoc(doc), scenes } };
}

export function deleteScene(
  doc: IntroDocumentV1,
  sceneId: string,
): SceneOpsResult {
  if (doc.scenes.length <= 1) {
    return { ok: false, reason: "scene_delete_would_empty" };
  }
  if (!doc.scenes.some((s) => s.id === sceneId)) {
    return { ok: false, reason: "scene_not_found" };
  }
  return {
    ok: true,
    value: {
      ...cloneDoc(doc),
      scenes: doc.scenes.filter((s) => s.id !== sceneId),
    },
  };
}

/** Fail-closed: duplicate scene ids invalid for runtime. */
export function assertUniqueSceneIds(doc: IntroDocumentV1): boolean {
  const ids = doc.scenes.map((s) => s.id);
  return new Set(ids).size === ids.length;
}
