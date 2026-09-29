"use client";

import { useMemo } from "react";
import type {
  IntroDocumentV1,
  SceneV1,
  TextPayloadV1,
  ImagePayloadV1,
} from "@/lib/intro/contracts/document";
import { fitContentRegion, mapFrame } from "@/lib/intro/geometry/fit";

type Props = {
  document: IntroDocumentV1;
  sceneIndex?: number;
  viewportW?: number;
  viewportH?: number;
  /** mediaId → preview URL for IMAGE/LOGO */
  mediaUrls?: Record<string, string>;
};

/**
 * Canonical preview — same FIT + frame mapping as Android/iOS.
 */
export function IntroCanonicalPreview({
  document,
  sceneIndex = 0,
  viewportW = 270,
  viewportH = 480,
  mediaUrls = {},
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

  const bgColor =
    scene.background.type === "COLOR" ? scene.background.color : "#000000";

  return (
    <div
      data-intro13-preview="1"
      className="relative overflow-hidden"
      style={{
        width: viewportW,
        height: viewportH,
        background: bgColor,
      }}
    >
      {scene.background.type === "IMAGE" && mediaUrls[scene.background.mediaId] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          src={mediaUrls[scene.background.mediaId]}
          className="absolute inset-0 h-full w-full"
          style={{
            objectFit: scene.background.fit === "CONTAIN" ? "contain" : "cover",
          }}
        />
      ) : null}
      <div
        className="absolute"
        style={{
          left: region.OX,
          top: region.OY,
          width: region.RW,
          height: region.RH,
          background: scene.background.type === "COLOR" ? scene.background.color : "transparent",
        }}
      >
        {[...scene.elements]
          .filter((el) => el.visible)
          .sort((a, b) => a.zIndex - b.zIndex)
          .map((el) => {
            const rect = mapFrame(el.frame, region);
            const box = {
              left: rect.left - region.OX,
              top: rect.top - region.OY,
              width: rect.width,
              height: rect.height,
              opacity: el.opacity,
            };
            if (el.type === "TEXT") {
              const p = el.payload as TextPayloadV1;
              const fontPx = Math.max(8, p.fontSizeNorm * region.RH);
              return (
                <div
                  key={el.id}
                  className="absolute flex items-center overflow-hidden"
                  style={{
                    ...box,
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
                    lineHeight: 1.2,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {p.text}
                </div>
              );
            }
            if (el.type === "IMAGE" || el.type === "LOGO") {
              const p = el.payload as ImagePayloadV1;
              const url = mediaUrls[p.mediaId];
              if (!url) {
                return (
                  <div
                    key={el.id}
                    className="absolute flex items-center justify-center bg-black/40 text-[10px] text-white"
                    style={box}
                  >
                    미디어
                  </div>
                );
              }
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={el.id}
                  alt=""
                  src={url}
                  className="absolute"
                  style={{
                    ...box,
                    objectFit: p.fit === "CONTAIN" ? "contain" : "cover",
                  }}
                />
              );
            }
            if (el.type === "CTA") {
              const p = el.payload as import("@/lib/intro/contracts/document").CtaPayloadV1;
              return (
                <div
                  key={el.id}
                  className="absolute flex items-center justify-center text-center text-sm font-bold"
                  style={{
                    ...box,
                    background: p.backgroundColor,
                    color: p.textColor,
                  }}
                >
                  {p.label}
                </div>
              );
            }
            return null;
          })}
      </div>
    </div>
  );
}
