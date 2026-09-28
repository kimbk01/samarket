import type { CtaLayer, DibayIntroLayer, ImageLayer, LogoLayer, TextLayer } from "@/lib/dibay-intro/document";
import { frameToCss, fittedMediaRect } from "@/lib/dibay-intro/engine/media-fit";

export type LayerDomContext = {
  mediaUrlById: Record<string, string>;
  mediaSizeById?: Record<string, { width: number; height: number }>;
  interactive: boolean;
  onCta?: (layer: CtaLayer) => void;
};

function applyFrame(el: HTMLElement, layer: DibayIntroLayer): void {
  const css = frameToCss(layer.frame);
  el.style.position = "absolute";
  el.style.left = css.left;
  el.style.top = css.top;
  el.style.width = css.width;
  el.style.height = css.height;
  el.style.opacity = String(layer.opacity);
  el.style.zIndex = String(layer.z);
  el.style.display = layer.visible ? "block" : "none";
  el.style.pointerEvents = "auto";
  el.dataset.layerId = layer.id;
  el.dataset.layerType = layer.type;
}

function renderBitmap(layer: ImageLayer | LogoLayer, ctx: LayerDomContext): HTMLElement {
  const wrap = document.createElement("div");
  applyFrame(wrap, layer);
  wrap.style.overflow = "hidden";
  const img = document.createElement("img");
  img.alt = "";
  img.draggable = false;
  const url = ctx.mediaUrlById[layer.mediaId] ?? "";
  img.src = url;
  img.style.position = "absolute";
  const size = ctx.mediaSizeById?.[layer.mediaId];
  if (size && size.width > 0 && size.height > 0) {
    const fitted = fittedMediaRect(size.width, size.height, { x: 0, y: 0, width: 1, height: 1 }, layer.fit);
    const css = frameToCss(fitted);
    img.style.left = css.left;
    img.style.top = css.top;
    img.style.width = css.width;
    img.style.height = css.height;
  } else {
    img.style.inset = "0";
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = layer.fit;
  }
  wrap.appendChild(img);
  return wrap;
}

function renderText(layer: TextLayer): HTMLElement {
  const el = document.createElement("div");
  applyFrame(el, layer);
  el.style.fontFamily = `"${layer.fontFamily}", sans-serif`;
  el.style.fontSize = `${layer.fontSizePx}px`;
  el.style.fontWeight = String(layer.fontWeight);
  el.style.color = layer.color;
  el.style.lineHeight = String(layer.lineHeight);
  el.style.textAlign = layer.align;
  el.style.whiteSpace = "pre-wrap";
  el.style.overflow = "hidden";
  el.textContent = layer.content;
  return el;
}

function renderCta(layer: CtaLayer, ctx: LayerDomContext): HTMLElement {
  const button = document.createElement("button");
  button.type = "button";
  applyFrame(button, layer);
  button.textContent = layer.label;
  button.style.border = "0";
  button.style.borderRadius = "8px";
  button.style.cursor = ctx.interactive ? "pointer" : "default";
  button.style.fontFamily = '"Pretendard Variable", sans-serif';
  button.style.fontWeight = "700";
  button.style.fontSize = "16px";
  if (layer.style === "primary") {
    button.style.background = "#FFFFFF";
    button.style.color = "#0B421A";
  } else {
    button.style.background = "transparent";
    button.style.color = "#FFFFFF";
    button.style.border = "1px solid #FFFFFF";
  }
  if (ctx.interactive && ctx.onCta) {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      ctx.onCta?.(layer);
    });
  }
  return button;
}

export function renderLayer(layer: DibayIntroLayer, ctx: LayerDomContext): HTMLElement {
  if (layer.type === "IMAGE" || layer.type === "LOGO") return renderBitmap(layer, ctx);
  if (layer.type === "TEXT") return renderText(layer);
  return renderCta(layer, ctx);
}
