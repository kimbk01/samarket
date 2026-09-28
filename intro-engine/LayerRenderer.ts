import type { IntroShowLayer } from "./document";
import { projectFrame } from "./geometry";
import { computeFittedRect } from "./media-fit";

export type IntroShowMediaRecord = {
  mediaId: string;
  url: string;
  width: number;
  height: number;
};

export type LayerRenderMode = "authoring" | "preview" | "runtime";

export function renderLayerElement(
  layer: IntroShowLayer,
  media: IntroShowMediaRecord | undefined,
  hostSize: { width: number; height: number },
): HTMLDivElement {
  const outer = document.createElement("div");
  const projected = projectFrame(layer.frame);
  outer.dataset.introLayerId = layer.id;
  outer.dataset.introLayerType = layer.type;
  outer.style.position = "absolute";
  outer.style.left = projected.left;
  outer.style.top = projected.top;
  outer.style.width = projected.width;
  outer.style.height = projected.height;
  outer.style.zIndex = String(layer.zIndex);
  outer.style.opacity = String(layer.opacity);
  outer.style.visibility = layer.visible ? "visible" : "hidden";
  outer.style.overflow = "hidden";
  outer.style.pointerEvents = "none";

  if (!media) return outer;

  const box = {
    width: layer.frame.width * hostSize.width,
    height: layer.frame.height * hostSize.height,
  };
  const fitted = computeFittedRect(box, { width: media.width, height: media.height }, layer.fit);
  const img = document.createElement("img");
  img.alt = "";
  img.draggable = false;
  img.src = media.url;
  img.style.position = "absolute";
  img.style.left = `${fitted.x}px`;
  img.style.top = `${fitted.y}px`;
  img.style.width = `${fitted.width}px`;
  img.style.height = `${fitted.height}px`;
  img.style.maxWidth = "none";
  img.style.display = "block";
  outer.appendChild(img);
  return outer;
}
