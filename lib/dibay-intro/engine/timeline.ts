import type { DibayIntroDocument, DibayIntroScene } from "@/lib/dibay-intro/document";

export type TimelineFrame = {
  sceneIndex: number;
  previousIndex: number | null;
  sceneLocalMs: number;
  transitionProgress: number;
  done: boolean;
  totalMs: number;
};

export function sceneTransitionMs(scene: DibayIntroScene): number {
  if (scene.transition.kind === "CUT") return 0;
  return scene.transition.durationMs;
}

export function documentDurationMs(document: DibayIntroDocument): number {
  return document.scenes.reduce((sum, scene) => sum + scene.durationMs, 0);
}

export function resolveTimeline(document: DibayIntroDocument, elapsedMs: number): TimelineFrame {
  const totalMs = documentDurationMs(document);
  if (document.scenes.length === 0) {
    return { sceneIndex: 0, previousIndex: null, sceneLocalMs: 0, transitionProgress: 1, done: true, totalMs: 0 };
  }
  if (elapsedMs >= totalMs) {
    const last = document.scenes.length - 1;
    return {
      sceneIndex: last,
      previousIndex: last > 0 ? last - 1 : null,
      sceneLocalMs: document.scenes[last].durationMs,
      transitionProgress: 1,
      done: true,
      totalMs,
    };
  }
  let cursor = 0;
  for (let i = 0; i < document.scenes.length; i += 1) {
    const scene = document.scenes[i];
    const next = cursor + scene.durationMs;
    if (elapsedMs < next) {
      const sceneLocalMs = elapsedMs - cursor;
      const tMs = sceneTransitionMs(scene);
      const transitionProgress = tMs <= 0 ? 1 : Math.min(1, Math.max(0, sceneLocalMs / tMs));
      return {
        sceneIndex: i,
        previousIndex: i > 0 ? i - 1 : null,
        sceneLocalMs,
        transitionProgress,
        done: false,
        totalMs,
      };
    }
    cursor = next;
  }
  const last = document.scenes.length - 1;
  return {
    sceneIndex: last,
    previousIndex: last > 0 ? last - 1 : null,
    sceneLocalMs: document.scenes[last].durationMs,
    transitionProgress: 1,
    done: true,
    totalMs,
  };
}
