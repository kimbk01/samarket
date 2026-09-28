"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import type { IntroV3Background, IntroV3Layer } from "@/lib/startup/intro-v3/document";
import { transformIntroV3GeometryToRect } from "@/lib/startup/intro-v3/geometry";
import { isIntroV3PersistableRef } from "@/lib/startup/intro-v3/persistable";
import { parseMediaRefToken } from "@/lib/startup/intro-v3/media-library";

export type IntroV3LayerPreview = {
  url: string;
  width: number;
  height: number;
};

export function IntroV3SceneSurface({
  background,
  layers,
  previewByDerivativeId,
  selectedLayerId,
  onSelectLayer,
}: {
  background: IntroV3Background;
  layers: IntroV3Layer[];
  previewByDerivativeId: Record<string, IntroV3LayerPreview>;
  selectedLayerId: string | null;
  onSelectLayer: (layerId: string) => void;
}) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ width: 360, height: 640 });

  useLayoutEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setViewport({ width: Math.max(1, rect.width), height: Math.max(1, rect.height) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const color = background.type === "COLOR" ? background.color : "#0B5F3A";
  const gradient =
    background.type === "GRADIENT"
      ? `linear-gradient(${background.angleDeg}deg, ${background.colorA}, ${background.colorB})`
      : null;

  const visible = [...layers]
    .filter((layer) => layer.visible !== false)
    .sort((a, b) => a.z - b.z);

  return (
    <div className="flex justify-center">
      <div
        ref={surfaceRef}
        data-intro-v3-scene-surface="1"
        className="relative overflow-hidden rounded-ui-rect border border-sam-border"
        style={{
          width: "min(100%, 360px)",
          aspectRatio: "9 / 16",
          background: gradient ?? color,
        }}
      >
        {visible.map((layer) => {
          if (layer.type !== "IMAGE") return null;
          const ref = parseMediaRefToken(layer.payload.mediaRef);
          const preview = ref ? previewByDerivativeId[ref.derivativeId] : null;
          if (!preview || !isIntroV3PersistableRef(preview.url)) return null;
          const box = transformIntroV3GeometryToRect({
            geometry: layer.geometry,
            viewport,
            mediaWidth: preview.width,
            mediaHeight: preview.height,
          });
          const selected = selectedLayerId === layer.id;
          return (
            <button
              key={layer.id}
              type="button"
              data-intro-v3-image-layer={layer.id}
              className={`absolute overflow-hidden p-0 ${selected ? "ring-2 ring-white" : ""}`}
              style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
              onClick={() => onSelectLayer(layer.id)}
            >
              <SamarketThumbnail
                src={preview.url}
                alt={layer.payload.alt ?? ""}
                fill
                className="h-full w-full"
                imageClassName="h-full w-full object-contain"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
