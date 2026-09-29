"use client";

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type {
  ElementV1,
  FrameV1,
  ImagePayloadV1,
  IntroDocumentV1,
  SceneV1,
  TextPayloadV1,
  CtaPayloadV1,
} from "@/lib/intro/contracts/document";

type Props = {
  document: IntroDocumentV1;
  scene: SceneV1;
  selectedElementId: string | null;
  mediaUrls: Record<string, string>;
  onSelectElement: (id: string | null) => void;
  onUpdateFrame: (elementId: string, frame: FrameV1) => void;
};

type ResizeCorner = "se" | "sw" | "ne" | "nw";

type DragMode =
  | { kind: "move"; elId: string; startX: number; startY: number; orig: FrameV1 }
  | {
      kind: "resize";
      elId: string;
      corner: ResizeCorner;
      startX: number;
      startY: number;
      orig: FrameV1;
    };

function clampFrame(f: FrameV1): FrameV1 {
  const w = Math.min(0.98, Math.max(0.04, f.w));
  const h = Math.min(0.98, Math.max(0.04, f.h));
  const x = Math.min(1 - w, Math.max(0, f.x));
  const y = Math.min(1 - h, Math.max(0, f.y));
  return { x, y, w, h };
}

/**
 * Editing canvas (not playback preview). 9:16 composition with drag/resize.
 * Geometry matches App canonical document — no preview-only hacks.
 */
export function IntroCanvas({
  document,
  scene,
  selectedElementId,
  mediaUrls,
  onSelectElement,
  onUpdateFrame,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragMode | null>(null);

  const bgColor =
    scene.background.type === "COLOR" ? scene.background.color : "#000000";

  const clientToNorm = useCallback((clientX: number, clientY: number) => {
    const el = stageRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return {
      x: (clientX - r.left) / r.width,
      y: (clientY - r.top) / r.height,
    };
  }, []);

  function onPointerDownElement(
    e: ReactPointerEvent,
    el: ElementV1,
    mode: "move" | "resize",
    corner?: ResizeCorner,
  ) {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    onSelectElement(el.id);
    const p = clientToNorm(e.clientX, e.clientY);
    if (mode === "move") {
      setDrag({
        kind: "move",
        elId: el.id,
        startX: p.x,
        startY: p.y,
        orig: el.frame,
      });
    } else {
      setDrag({
        kind: "resize",
        elId: el.id,
        corner: corner ?? "se",
        startX: p.x,
        startY: p.y,
        orig: el.frame,
      });
    }
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (!drag) return;
    const p = clientToNorm(e.clientX, e.clientY);
    const dx = p.x - drag.startX;
    const dy = p.y - drag.startY;
    if (drag.kind === "move") {
      onUpdateFrame(
        drag.elId,
        clampFrame({
          ...drag.orig,
          x: drag.orig.x + dx,
          y: drag.orig.y + dy,
        }),
      );
      return;
    }
    const o = drag.orig;
    let x = o.x;
    let y = o.y;
    let w = o.w;
    let h = o.h;
    if (drag.corner.includes("e")) w = o.w + dx;
    if (drag.corner.includes("s")) h = o.h + dy;
    if (drag.corner.includes("w")) {
      x = o.x + dx;
      w = o.w - dx;
    }
    if (drag.corner.includes("n")) {
      y = o.y + dy;
      h = o.h - dy;
    }
    onUpdateFrame(drag.elId, clampFrame({ x, y, w, h }));
  }

  function onPointerUp() {
    setDrag(null);
  }

  return (
    <div
      className="flex flex-col items-center"
      data-intro13-canvas="1"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <div className="mb-2 text-xs text-sam-muted">
        편집 Canvas · {document.compositionAspect.w}:{document.compositionAspect.h}
      </div>
      <div
        ref={stageRef}
        className="relative aspect-[9/16] w-full max-w-[360px] touch-none overflow-hidden rounded-ui-rect border border-sam-border shadow-inner"
        style={{ backgroundColor: bgColor, containerType: "size" }}
        onPointerDown={() => onSelectElement(null)}
      >
        {scene.background.type === "IMAGE" && mediaUrls[scene.background.mediaId] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            src={mediaUrls[scene.background.mediaId]}
            className="pointer-events-none absolute inset-0 h-full w-full"
            style={{
              objectFit: scene.background.fit === "CONTAIN" ? "contain" : "cover",
            }}
          />
        ) : null}
        {[...scene.elements]
          .filter((el) => el.visible)
          .sort((a, b) => a.zIndex - b.zIndex)
          .map((el) => {
            const selected = el.id === selectedElementId;
            return (
              <div
                key={el.id}
                className={`absolute box-border ${
                  selected
                    ? "z-50 outline outline-2 outline-sky-400"
                    : "hover:outline hover:outline-1 hover:outline-white/50"
                }`}
                style={{
                  left: `${el.frame.x * 100}%`,
                  top: `${el.frame.y * 100}%`,
                  width: `${el.frame.w * 100}%`,
                  height: `${el.frame.h * 100}%`,
                  opacity: el.opacity,
                  cursor: drag?.elId === el.id ? "grabbing" : "grab",
                }}
                onPointerDown={(e) => onPointerDownElement(e, el, "move")}
              >
                <ElementVisual el={el} mediaUrls={mediaUrls} />
                {selected ? (
                  <>
                    {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                      <button
                        key={corner}
                        type="button"
                        aria-label={`resize-${corner}`}
                        className="absolute h-3 w-3 rounded-sm border border-sky-600 bg-white"
                        style={{
                          left: corner.includes("w") ? -6 : undefined,
                          right: corner.includes("e") ? -6 : undefined,
                          top: corner.includes("n") ? -6 : undefined,
                          bottom: corner.includes("s") ? -6 : undefined,
                          cursor:
                            corner === "nw" || corner === "se"
                              ? "nwse-resize"
                              : "nesw-resize",
                        }}
                        onPointerDown={(e) =>
                          onPointerDownElement(e, el, "resize", corner)
                        }
                      />
                    ))}
                  </>
                ) : null}
              </div>
            );
          })}
      </div>
    </div>
  );
}

function ElementVisual({
  el,
  mediaUrls,
}: {
  el: ElementV1;
  mediaUrls: Record<string, string>;
}) {
  if (el.type === "TEXT") {
    const p = el.payload as TextPayloadV1;
    // fontSizeNorm is fraction of composition width (canonical).
    return (
      <div
        className="flex h-full w-full items-center overflow-hidden px-1"
        style={{
          color: p.color,
          justifyContent:
            p.align === "left"
              ? "flex-start"
              : p.align === "right"
                ? "flex-end"
                : "center",
          fontWeight: p.weight === "bold" ? 700 : p.weight === "medium" ? 500 : 400,
          fontSize: `${Math.max(2, p.fontSizeNorm * 100)}cqh`,
          lineHeight: 1.15,
          textAlign: p.align,
        }}
      >
        <span className="w-full break-words" style={{ textAlign: p.align }}>
          {p.text}
        </span>
      </div>
    );
  }
  if (el.type === "CTA") {
    const p = el.payload as CtaPayloadV1;
    return (
      <div
        className="flex h-full w-full items-center justify-center rounded-ui-rect px-2 text-center text-sm font-semibold"
        style={{ backgroundColor: p.backgroundColor, color: p.textColor }}
      >
        {p.label}
      </div>
    );
  }
  const p = el.payload as ImagePayloadV1;
  const url = mediaUrls[p.mediaId];
  if (!url) {
    return (
      <div className="flex h-full w-full items-center justify-center border border-dashed border-white/40 bg-black/40 text-[10px] text-white">
        {el.type === "LOGO" ? "로고 없음" : "이미지 없음"}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      src={url}
      className="h-full w-full"
      draggable={false}
      style={{
        objectFit:
          p.fit === "CONTAIN" ? "contain" : p.fit === "COVER" ? "cover" : "fill",
      }}
    />
  );
}
