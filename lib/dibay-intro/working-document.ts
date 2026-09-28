import {
  createDefaultDibayIntroDocument,
  parseDibayIntroDocument,
  SCENE_DURATION_MS_DEFAULT,
  SCENE_DURATION_MS_MAX,
  SCENE_DURATION_MS_MIN,
  type DibayIntroDocument,
  type DibayIntroLayer,
  type DibayIntroScene,
  type NormalizedFrame,
  type SceneTransition,
} from "@/lib/dibay-intro/document";
import { clampFrame } from "@/lib/dibay-intro/geometry";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function newId(): string {
  return crypto.randomUUID();
}

function reindex(scenes: DibayIntroScene[]): DibayIntroScene[] {
  return scenes.map((scene, order) => ({ ...scene, order }));
}

/**
 * ONE canonical working document. All Studio operations mutate this instance.
 * React snapshots are never persistence authority.
 */
export class DibayIntroWorkingDocument {
  private document: DibayIntroDocument;
  private pointerActive = false;

  constructor(initial?: DibayIntroDocument) {
    const parsed = parseDibayIntroDocument(initial ?? createDefaultDibayIntroDocument());
    if (!parsed.ok) throw new Error(parsed.issues.map((i) => i.message).join("; "));
    this.document = clone(parsed.document);
  }

  snapshot(): DibayIntroDocument {
    return clone(this.document);
  }

  replace(next: DibayIntroDocument): void {
    const parsed = parseDibayIntroDocument(next);
    if (!parsed.ok) throw new Error(parsed.issues.map((i) => i.message).join("; "));
    this.document = clone(parsed.document);
  }

  scenes(): DibayIntroScene[] {
    return clone(this.document.scenes);
  }

  addScene(afterId?: string): string {
    const scene: DibayIntroScene = {
      id: newId(),
      name: "",
      order: this.document.scenes.length,
      durationMs: SCENE_DURATION_MS_DEFAULT,
      background: { type: "solid", color: this.document.settings.defaultBackgroundColor },
      transition: { kind: "CUT" },
      layers: [],
    };
    if (!afterId) {
      this.document.scenes.push(scene);
    } else {
      const idx = this.document.scenes.findIndex((s) => s.id === afterId);
      this.document.scenes.splice(idx >= 0 ? idx + 1 : this.document.scenes.length, 0, scene);
    }
    this.document.scenes = reindex(this.document.scenes);
    return scene.id;
  }

  selectScene(id: string): DibayIntroScene | null {
    return this.document.scenes.find((s) => s.id === id) ?? null;
  }

  duplicateScene(id: string): string | null {
    const idx = this.document.scenes.findIndex((s) => s.id === id);
    if (idx < 0) return null;
    const source = this.document.scenes[idx];
    const copy: DibayIntroScene = {
      ...clone(source),
      id: newId(),
      layers: source.layers.map((layer) => ({ ...clone(layer), id: newId() })),
    };
    this.document.scenes.splice(idx + 1, 0, copy);
    this.document.scenes = reindex(this.document.scenes);
    return copy.id;
  }

  deleteScene(id: string): { ok: true } | { ok: false; reason: "last_scene" | "missing" } {
    if (this.document.scenes.length <= 1) return { ok: false, reason: "last_scene" };
    const next = this.document.scenes.filter((s) => s.id !== id);
    if (next.length === this.document.scenes.length) return { ok: false, reason: "missing" };
    this.document.scenes = reindex(next);
    return { ok: true };
  }

  reorderScenes(orderedIds: string[]): boolean {
    if (orderedIds.length !== this.document.scenes.length) return false;
    const map = new Map(this.document.scenes.map((s) => [s.id, s]));
    const next: DibayIntroScene[] = [];
    for (const id of orderedIds) {
      const scene = map.get(id);
      if (!scene) return false;
      next.push(scene);
    }
    this.document.scenes = reindex(next);
    return true;
  }

  setSceneName(id: string, name: string): boolean {
    const scene = this.document.scenes.find((s) => s.id === id);
    if (!scene) return false;
    scene.name = name.slice(0, 80);
    return true;
  }

  setSceneDuration(id: string, durationMs: number): boolean {
    const scene = this.document.scenes.find((s) => s.id === id);
    if (!scene) return false;
    scene.durationMs = Math.min(
      SCENE_DURATION_MS_MAX,
      Math.max(SCENE_DURATION_MS_MIN, Math.round(durationMs)),
    );
    return true;
  }

  setSceneTransition(id: string, transition: SceneTransition): boolean {
    const scene = this.document.scenes.find((s) => s.id === id);
    if (!scene) return false;
    scene.transition = clone(transition);
    return true;
  }

  setSceneBackgroundColor(id: string, color: string): boolean {
    const scene = this.document.scenes.find((s) => s.id === id);
    if (!scene) return false;
    scene.background = { type: "solid", color };
    return true;
  }

  addLayer(sceneId: string, layer: DibayIntroLayer): boolean {
    const scene = this.document.scenes.find((s) => s.id === sceneId);
    if (!scene) return false;
    scene.layers.push(clone(layer));
    return true;
  }

  updateLayer(sceneId: string, layerId: string, patch: Partial<DibayIntroLayer>): boolean {
    const scene = this.document.scenes.find((s) => s.id === sceneId);
    if (!scene) return false;
    const idx = scene.layers.findIndex((l) => l.id === layerId);
    if (idx < 0) return false;
    scene.layers[idx] = { ...scene.layers[idx], ...patch, id: layerId, type: scene.layers[idx].type } as DibayIntroLayer;
    return true;
  }

  setLayerFrame(sceneId: string, layerId: string, frame: NormalizedFrame): boolean {
    return this.updateLayer(sceneId, layerId, { frame: clampFrame(frame) });
  }

  beginPointer(): void {
    this.pointerActive = true;
  }

  commitPointer(): void {
    this.pointerActive = false;
  }

  isPointerActive(): boolean {
    return this.pointerActive;
  }

  moveLayerZ(sceneId: string, layerId: string, direction: "forward" | "backward"): boolean {
    const scene = this.document.scenes.find((s) => s.id === sceneId);
    if (!scene) return false;
    const layer = scene.layers.find((l) => l.id === layerId);
    if (!layer) return false;
    const zs = scene.layers.map((l) => l.z);
    const max = Math.max(...zs, 0);
    const min = Math.min(...zs, 0);
    layer.z = direction === "forward" ? max + 1 : min - 1;
    return true;
  }

  deleteLayer(sceneId: string, layerId: string): boolean {
    const scene = this.document.scenes.find((s) => s.id === sceneId);
    if (!scene) return false;
    const next = scene.layers.filter((l) => l.id !== layerId);
    if (next.length === scene.layers.length) return false;
    scene.layers = next;
    return true;
  }
}
