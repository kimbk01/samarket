import type { DibayIntroScene, SlideDirection } from "@/lib/dibay-intro/document";
import { renderLayer, type LayerDomContext } from "@/lib/dibay-intro/engine/layer-dom";

export function slideOffset(direction: SlideDirection, progress: number): { x: string; y: string } {
  const remaining = 1 - progress;
  if (direction === "left") return { x: `${remaining * 100}%`, y: "0" };
  if (direction === "right") return { x: `${-remaining * 100}%`, y: "0" };
  if (direction === "up") return { x: "0", y: `${remaining * 100}%` };
  return { x: "0", y: `${-remaining * 100}%` };
}

export function renderScene(scene: DibayIntroScene, ctx: LayerDomContext): HTMLElement {
  const root = document.createElement("div");
  root.dataset.sceneId = scene.id;
  root.style.position = "absolute";
  root.style.inset = "0";
  root.style.background = scene.background.color;
  root.style.overflow = "hidden";
  const layers = scene.layers.slice().sort((a, b) => a.z - b.z);
  for (const layer of layers) {
    root.appendChild(renderLayer(layer, ctx));
  }
  return root;
}
