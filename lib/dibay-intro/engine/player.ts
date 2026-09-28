import type { CtaLayer, DibayIntroDocument } from "@/lib/dibay-intro/document";
import { renderScene, slideOffset } from "@/lib/dibay-intro/engine/scene-dom";
import { resolveTimeline } from "@/lib/dibay-intro/engine/timeline";
import type { LayerDomContext } from "@/lib/dibay-intro/engine/layer-dom";

export type IntroPlayerMode = "stage" | "preview" | "runtime";

export type IntroPlayerOptions = {
  document: DibayIntroDocument;
  mediaUrlById: Record<string, string>;
  mediaSizeById?: Record<string, { width: number; height: number }>;
  mode: IntroPlayerMode;
  stageSceneId?: string;
  interactive?: boolean;
  onFirstFrame?: () => void;
  onComplete?: () => void;
  onCta?: (layer: CtaLayer) => void;
};

export type IntroPlayerHandle = {
  destroy(): void;
  pause(): void;
  play(): void;
  seek(ms: number): void;
  refresh(next: Partial<IntroPlayerOptions>): void;
  getElapsedMs(): number;
};

function applyTransition(
  current: HTMLElement,
  previous: HTMLElement | null,
  scene: DibayIntroDocument["scenes"][number],
  progress: number,
): void {
  current.style.opacity = "1";
  current.style.transform = "translate(0,0)";
  if (!previous || progress >= 1 || scene.transition.kind === "CUT") {
    if (previous) previous.style.display = "none";
    return;
  }
  previous.style.display = "block";
  if (scene.transition.kind === "FADE") {
    current.style.opacity = String(progress);
    previous.style.opacity = String(1 - progress);
    return;
  }
  const offset = slideOffset(scene.transition.direction, progress);
  current.style.transform = `translate(${offset.x}, ${offset.y})`;
}

export function attachIntroPlayer(host: HTMLElement, options: IntroPlayerOptions): IntroPlayerHandle {
  let opts = options;
  let elapsed = 0;
  let playing = opts.mode !== "stage";
  let raf = 0;
  let lastTs = 0;
  let firstFrame = false;
  let completed = false;
  const layer: HTMLElement = document.createElement("div");
  layer.style.position = "relative";
  layer.style.width = "100%";
  layer.style.height = "100%";
  layer.style.overflow = "hidden";
  host.appendChild(layer);

  const ctx = (): LayerDomContext => ({
    mediaUrlById: opts.mediaUrlById,
    mediaSizeById: opts.mediaSizeById,
    interactive: Boolean(opts.interactive),
    onCta: opts.onCta,
  });

  function paint(): void {
    layer.replaceChildren();
    const doc = opts.document;
    if (!doc.scenes.length) return;
    if (opts.mode === "stage") {
      const scene = doc.scenes.find((s) => s.id === opts.stageSceneId) ?? doc.scenes[0];
      layer.appendChild(renderScene(scene, ctx()));
      if (!firstFrame) {
        firstFrame = true;
        opts.onFirstFrame?.();
      }
      return;
    }
    const frame = resolveTimeline(doc, elapsed);
    const currentScene = doc.scenes[frame.sceneIndex];
    const previousScene = frame.previousIndex != null ? doc.scenes[frame.previousIndex] : null;
    const previousEl = previousScene ? renderScene(previousScene, ctx()) : null;
    const currentEl = renderScene(currentScene, ctx());
    if (previousEl) layer.appendChild(previousEl);
    layer.appendChild(currentEl);
    applyTransition(currentEl, previousEl, currentScene, frame.transitionProgress);
    if (!firstFrame) {
      firstFrame = true;
      opts.onFirstFrame?.();
    }
    if (frame.done && !completed) {
      completed = true;
      playing = false;
      opts.onComplete?.();
    }
  }

  function tick(ts: number): void {
    if (!playing) return;
    if (!lastTs) lastTs = ts;
    elapsed += ts - lastTs;
    lastTs = ts;
    paint();
    if (playing) raf = window.requestAnimationFrame(tick);
  }

  paint();
  if (playing) raf = window.requestAnimationFrame(tick);

  return {
    destroy() {
      playing = false;
      window.cancelAnimationFrame(raf);
      layer.remove();
    },
    pause() {
      playing = false;
      window.cancelAnimationFrame(raf);
      lastTs = 0;
    },
    play() {
      if (playing) return;
      playing = true;
      completed = false;
      lastTs = 0;
      raf = window.requestAnimationFrame(tick);
    },
    seek(ms: number) {
      elapsed = Math.max(0, ms);
      completed = false;
      paint();
    },
    refresh(next: Partial<IntroPlayerOptions>) {
      opts = { ...opts, ...next };
      paint();
    },
    getElapsedMs() {
      return elapsed;
    },
  };
}
