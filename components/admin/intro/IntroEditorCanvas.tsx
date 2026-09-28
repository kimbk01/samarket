"use client";

import { useRef } from "react";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import type { IntroEditorLayerPreview } from "@/components/admin/intro/intro-editor-canvas-types";
import type { IntroV3Background, IntroV3Layer } from "@/lib/startup/intro-v3/document";
import {
  dragIntroV3Geometry,
  editorFrameRect,
  pointerDeltaToNormalizedPct,
  pointerPositionToNormalizedPct,
  resizeIntroV3Geometry,
  type IntroEditorResizeHandle,
} from "@/lib/startup/intro-v3/editor-pointer-geometry";
import type { IntroV3Geometry } from "@/lib/startup/intro-v3/geometry";
import { parseMediaRefToken } from "@/lib/startup/intro-v3/media-library";
import { isIntroV3PersistableRef } from "@/lib/startup/intro-v3/persistable";

export type { IntroEditorLayerPreview };

const HANDLES: IntroEditorResizeHandle[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

function handleStyle(handle: IntroEditorResizeHandle): { left: string; top: string; cursor: string } {
  const left = handle.includes("w") ? "0%" : handle.includes("e") ? "100%" : "50%";
  const top = handle.includes("n") ? "0%" : handle.includes("s") ? "100%" : "50%";
  const cursor =
    handle === "n" || handle === "s"
      ? "ns-resize"
      : handle === "e" || handle === "w"
        ? "ew-resize"
        : handle === "ne" || handle === "sw"
          ? "nesw-resize"
          : "nwse-resize";
  return { left, top, cursor };
}

export function IntroEditorCanvas({
  background,
  layers,
  previewByDerivativeId,
  selectedLayerId,
  renderedW,
  renderedH,
  aspectLocked,
  onSelectLayer,
  onPatchGeometry,
}: {
  background: IntroV3Background;
  layers: IntroV3Layer[];
  previewByDerivativeId: Record<string, IntroEditorLayerPreview>;
  selectedLayerId: string | null;
  renderedW: number;
  renderedH: number;
  aspectLocked: boolean;
  onSelectLayer: (layerId: string | null) => void;
  onPatchGeometry: (layerId: string, geometry: IntroV3Geometry) => void;
}) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<{
    kind: "drag" | "resize";
    layerId: string;
    start: IntroV3Geometry;
    pointerStartX: number;
    pointerStartY: number;
    handle?: IntroEditorResizeHandle;
    mediaAspect: number | null;
    raf: number;
    next: IntroV3Geometry | null;
  } | null>(null);

  const color = background.type === "COLOR" ? background.color : "#0B5F3A";
  const gradient =
    background.type === "GRADIENT"
      ? `linear-gradient(${background.angleDeg}deg, ${background.colorA}, ${background.colorB})`
      : null;

  const visible = [...layers]
    .filter((layer) => layer.visible !== false)
    .sort((a, b) => a.z - b.z);

  function flushGeometry() {
    const session = sessionRef.current;
    if (!session?.next) return;
    onPatchGeometry(session.layerId, session.next);
    session.next = null;
    session.raf = 0;
  }

  function queueGeometry(geometry: IntroV3Geometry) {
    const session = sessionRef.current;
    if (!session) return;
    session.next = geometry;
    if (session.raf) return;
    session.raf = requestAnimationFrame(flushGeometry);
  }

  function canvasPoint(event: React.PointerEvent) {
    const el = surfaceRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function onSurfacePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    onSelectLayer(null);
  }

  function beginDrag(event: React.PointerEvent, layer: IntroV3Layer, mediaAspect: number | null) {
    event.stopPropagation();
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const point = canvasPoint(event);
    sessionRef.current = {
      kind: "drag",
      layerId: layer.id,
      start: layer.geometry,
      pointerStartX: point.x,
      pointerStartY: point.y,
      mediaAspect,
      raf: 0,
      next: null,
    };
    onSelectLayer(layer.id);
  }

  function beginResize(
    event: React.PointerEvent,
    layer: IntroV3Layer,
    handle: IntroEditorResizeHandle,
    mediaAspect: number | null
  ) {
    event.stopPropagation();
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const point = canvasPoint(event);
    sessionRef.current = {
      kind: "resize",
      layerId: layer.id,
      start: layer.geometry,
      pointerStartX: point.x,
      pointerStartY: point.y,
      handle,
      mediaAspect,
      raf: 0,
      next: null,
    };
    onSelectLayer(layer.id);
  }

  function onPointerMove(event: React.PointerEvent) {
    const session = sessionRef.current;
    if (!session) return;
    const point = canvasPoint(event);
    if (session.kind === "drag") {
      const delta = pointerDeltaToNormalizedPct({
        pointerDeltaX: point.x - session.pointerStartX,
        pointerDeltaY: point.y - session.pointerStartY,
        renderedCanvasWidth: renderedW,
        renderedCanvasHeight: renderedH,
      });
      queueGeometry(
        dragIntroV3Geometry({
          start: session.start,
          deltaXPct: delta.deltaXPct,
          deltaYPct: delta.deltaYPct,
        })
      );
      return;
    }
    if (!session.handle) return;
    const pos = pointerPositionToNormalizedPct({
      pointerX: point.x,
      pointerY: point.y,
      renderedCanvasWidth: renderedW,
      renderedCanvasHeight: renderedH,
    });
    queueGeometry(
      resizeIntroV3Geometry({
        start: session.start,
        handle: session.handle,
        pointerXPct: pos.xPct,
        pointerYPct: pos.yPct,
        aspectLocked,
        mediaAspect: session.mediaAspect,
      })
    );
  }

  function onPointerUp() {
    const session = sessionRef.current;
    if (!session) return;
    if (session.raf) cancelAnimationFrame(session.raf);
    flushGeometry();
    sessionRef.current = null;
  }

  return (
    <div
      ref={surfaceRef}
      data-intro-canvas="1"
      className="relative overflow-hidden"
      style={{
        width: renderedW,
        height: renderedH,
        background: gradient ?? color,
      }}
      onPointerDown={onSurfacePointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {visible.map((layer) => {
        if (layer.type !== "IMAGE") return null;
        const ref = parseMediaRefToken(layer.payload.mediaRef);
        const preview = ref ? previewByDerivativeId[ref.derivativeId] : null;
        if (!preview || !isIntroV3PersistableRef(preview.url)) return null;
        const box = editorFrameRect({ geometry: layer.geometry, renderedW, renderedH });
        const selected = selectedLayerId === layer.id;
        const mediaAspect = preview.width > 0 && preview.height > 0 ? preview.width / preview.height : null;
        const objectFit = layer.geometry.fit === "COVER" ? "object-cover" : "object-contain";
        return (
          <div
            key={layer.id}
            data-intro-image-layer={layer.id}
            className="absolute overflow-visible"
            style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
          >
            <button
              type="button"
              className="absolute inset-0 overflow-hidden p-0"
              onPointerDown={(event) => beginDrag(event, layer, mediaAspect)}
            >
              <SamarketThumbnail
                src={preview.url}
                alt={layer.payload.alt ?? ""}
                fill
                className="h-full w-full"
                imageClassName={`h-full w-full ${objectFit}`}
              />
            </button>
            {selected ? (
              <div
                data-intro-select-outline="1"
                className="pointer-events-none absolute inset-0 ring-2 ring-white ring-offset-1 ring-offset-black/40"
              >
                {HANDLES.map((handle) => {
                  const pos = handleStyle(handle);
                  return (
                    <button
                      key={handle}
                      type="button"
                      data-intro-resize-handle={handle}
                      className="pointer-events-auto absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-[1px] border border-white bg-sky-400 p-0"
                      style={{ left: pos.left, top: pos.top, cursor: pos.cursor }}
                      aria-label={handle}
                      onPointerDown={(event) => beginResize(event, layer, handle, mediaAspect)}
                    />
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
