"use client";

import { useMemo } from "react";
import type { IntroDocumentV1, SceneV1, TextPayloadV1 } from "@/lib/intro/contracts/document";
import { fitContentRegion, mapFrame } from "@/lib/intro/geometry/fit";

type Props = {
  document: IntroDocumentV1;
  sceneIndex?: number;
  /** Preview viewport CSS pixels */
  viewportW?: number;
  viewportH?: number;
};

/**
 * Canonical preview — same FIT + frame mapping as Android/iOS.
 * Not a fake renderer.
 */
export function IntroCanonicalPreview({
  document,
  sceneIndex = 0,
  viewportW = 270,
  viewportH = 480,
}: Props) {
  const scene: SceneV1 | undefined = document.scenes[sceneIndex];
  const region = useMemo(
    () =>
      fitContentRegion(
        viewportW,
        viewportH,
        document.compositionAspect.w,
        document.compositionAspect.h,
      ),
    [viewportW, viewportH, document.compositionAspect.w, document.compositionAspect.h],
  );

  if (!scene) {
    return (
      <div
        className="flex items-center justify-center bg-black text-sm text-white"
        style={{ width: viewportW, height: viewportH }}
      >
        장면 없음
      </div>
    );
  }

  const bg =
    scene.background.type === "COLOR" ? scene.background.color : "#000000";

  return (
    <div
      data-intro13-preview="1"
      className="relative overflow-hidden"
      style={{ width: viewportW, height: viewportH, background: bg }}
    >
      {/* Letterbox outside composition stays black — matches native underlay */}
      <div
        className="absolute"
        style={{
          left: region.OX,
          top: region.OY,
          width: region.RW,
          height: region.RH,
          background: bg,
        }}
      >
        {[...scene.elements]
          .filter((el) => el.visible)
          .sort((a, b) => a.zIndex - b.zIndex)
          .map((el) => {
            const rect = mapFrame(el.frame, region);
            if (el.type === "TEXT") {
              const p = el.payload as TextPayloadV1;
              const fontPx = Math.max(8, p.fontSizeNorm * region.RH);
              return (
                <div
                  key={el.id}
                  className="absolute flex items-center overflow-hidden"
                  style={{
                    left: rect.left - region.OX,
                    top: rect.top - region.OY,
                    width: rect.width,
                    height: rect.height,
                    color: p.color,
                    fontSize: fontPx,
                    fontWeight:
                      p.weight === "bold" ? 700 : p.weight === "medium" ? 500 : 400,
                    justifyContent:
                      p.align === "left"
                        ? "flex-start"
                        : p.align === "right"
                          ? "flex-end"
                          : "center",
                    textAlign: p.align,
                    opacity: el.opacity,
                    lineHeight: 1.2,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {p.text}
                </div>
              );
            }
            return null;
          })}
      </div>
    </div>
  );
}
