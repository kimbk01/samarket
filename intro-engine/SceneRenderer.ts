import type { IntroShowDocument } from "./document";
import { renderLayerElement, type IntroShowMediaRecord, type LayerRenderMode } from "./LayerRenderer";

export type SceneRendererHandle = {
  root: HTMLDivElement;
  update: (next: {
    document: IntroShowDocument;
    media: Record<string, IntroShowMediaRecord>;
    selectedLayerId?: string | null;
  }) => void;
  destroy: () => void;
};

export function mountSceneRenderer(
  host: HTMLElement,
  input: {
    document: IntroShowDocument;
    media: Record<string, IntroShowMediaRecord>;
    mode: LayerRenderMode;
    selectedLayerId?: string | null;
  },
): SceneRendererHandle {
  const root = document.createElement("div");
  root.dataset.introEngine = "scene";
  root.dataset.introMode = input.mode;
  root.style.position = "absolute";
  root.style.inset = "0";
  root.style.width = "100%";
  root.style.height = "100%";
  root.style.overflow = "hidden";
  host.appendChild(root);

  const paint = (doc: IntroShowDocument, media: Record<string, IntroShowMediaRecord>) => {
    const width = root.clientWidth || host.clientWidth;
    const height = root.clientHeight || host.clientHeight;
    root.style.background = doc.scene.background.color;
    root.replaceChildren();
    const layers = [...doc.scene.layers].sort((a, b) => a.zIndex - b.zIndex);
    for (const layer of layers) {
      root.appendChild(renderLayerElement(layer, media[layer.mediaId], { width, height }));
    }
  };

  paint(input.document, input.media);

  return {
    root,
    update(next) {
      paint(next.document, next.media);
    },
    destroy() {
      root.remove();
    },
  };
}
