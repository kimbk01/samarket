"use client";

import { OpeningCreativeImage } from "@/components/admin/opening-show/OpeningCreativeImage";
import { openingPrimaryScene, type OpeningDocument } from "@/lib/opening-show/document";
import { frameStyle } from "@/lib/opening-show/geometry";
import type { OpeningReadyMedia } from "@/lib/opening-show/types";

export function OpeningSceneSurface({
  document,
  mediaById,
  mode,
}: {
  document: OpeningDocument;
  mediaById: Map<string, OpeningReadyMedia>;
  mode: "preview";
}) {
  const scene = openingPrimaryScene(document);
  const layers = [...scene.layers].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div
      data-opening-stage="preview"
      className="relative h-full w-full overflow-hidden"
      style={{ backgroundColor: scene.background.color }}
    >
      {layers.map((layer) => {
        if (!layer.visible) return null;
        const media = mediaById.get(layer.mediaId);
        if (!media?.displayUrl) return null;
        return (
          <div key={layer.id} className="absolute" style={frameStyle(layer.frame)}>
            <OpeningCreativeImage src={media.displayUrl} alt={media.fileName} fit={layer.fit} />
          </div>
        );
      })}
    </div>
  );
}
