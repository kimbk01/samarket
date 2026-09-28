"use client";

import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { OpeningCreativeImage } from "@/components/admin/opening-show/OpeningCreativeImage";
import { openingPrimaryScene, type OpeningDocument } from "@/lib/opening-show/document";
import {
  frameStyle,
  resizeFrameKeepAspect,
  translateFrame,
  type NormalizedRect,
  type ResizeHandle,
} from "@/lib/opening-show/geometry";
import { setLayerFrame } from "@/lib/opening-show/layer-ops";
import type { OpeningReadyMedia } from "@/lib/opening-show/types";

const HANDLES: ResizeHandle[] = ["nw", "ne", "sw", "se"];

const HANDLE_CLASS: Record<ResizeHandle, string> = {
  nw: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize",
  ne: "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize",
  sw: "bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize",
  se: "bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize",
};

type DragState =
  | { kind: "move"; layerId: string; startX: number; startY: number; frame: NormalizedRect }
  | {
      kind: "resize";
      layerId: string;
      handle: ResizeHandle;
      startX: number;
      startY: number;
      frame: NormalizedRect;
    };

export function OpeningLiveStage({
  document,
  mediaById,
  selectedLayerId,
  onSelect,
  onDocumentChange,
}: {
  document: OpeningDocument;
  mediaById: Map<string, OpeningReadyMedia>;
  selectedLayerId: string | null;
  onSelect: (layerId: string | null) => void;
  onDocumentChange: (next: OpeningDocument) => void;
}) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const docRef = useRef(document);
  docRef.current = document;

  const scene = openingPrimaryScene(document);
  const layers = [...scene.layers].sort((a, b) => a.zIndex - b.zIndex);

  const applyPointer = useCallback(
    (clientX: number, clientY: number) => {
      const drag = dragRef.current;
      const el = surfaceRef.current;
      if (!drag || !el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const dx = (clientX - drag.startX) / rect.width;
      const dy = (clientY - drag.startY) / rect.height;
      const nextFrame =
        drag.kind === "move"
          ? translateFrame(drag.frame, dx, dy)
          : resizeFrameKeepAspect(drag.frame, drag.handle, dx, dy);
      drag.frame = nextFrame;
      drag.startX = clientX;
      drag.startY = clientY;
      onDocumentChange(setLayerFrame(docRef.current, drag.layerId, nextFrame));
    },
    [onDocumentChange]
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      event.preventDefault();
      applyPointer(event.clientX, event.clientY);
    },
    [applyPointer]
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  const startMove = (event: ReactPointerEvent<HTMLDivElement>, layerId: string) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect(layerId);
    const layer = openingPrimaryScene(docRef.current).layers.find((item) => item.id === layerId);
    if (!layer) return;
    dragRef.current = {
      kind: "move",
      layerId,
      startX: event.clientX,
      startY: event.clientY,
      frame: layer.frame,
    };
  };

  const startResize = (
    event: ReactPointerEvent<HTMLButtonElement>,
    layerId: string,
    handle: ResizeHandle
  ) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect(layerId);
    const layer = openingPrimaryScene(docRef.current).layers.find((item) => item.id === layerId);
    if (!layer) return;
    dragRef.current = {
      kind: "resize",
      layerId,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      frame: layer.frame,
    };
  };

  return (
    <div
      ref={surfaceRef}
      data-opening-stage="live"
      className="relative h-full w-full overflow-hidden"
      style={{ backgroundColor: scene.background.color }}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerDown={() => onSelect(null)}
    >
      {layers.map((layer) => {
        if (!layer.visible) return null;
        const media = mediaById.get(layer.mediaId);
        if (!media?.displayUrl) return null;
        const selected = selectedLayerId === layer.id;
        return (
          <div
            key={layer.id}
            data-opening-layer={layer.id}
            className="absolute"
            style={{
              ...frameStyle(layer.frame),
              zIndex: layer.zIndex,
              outline: selected ? "2px solid #ffffff" : "none",
              cursor: "move",
            }}
            onPointerDown={(event) => startMove(event, layer.id)}
          >
            <OpeningCreativeImage src={media.displayUrl} alt={media.fileName} fit={layer.fit} />
            {selected
              ? HANDLES.map((handle) => (
                  <button
                    key={handle}
                    type="button"
                    aria-label={handle}
                    className={`absolute h-3 w-3 rounded-sm border border-white bg-white ${HANDLE_CLASS[handle]}`}
                    onPointerDown={(event) => startResize(event, layer.id, handle)}
                  />
                ))
              : null}
          </div>
        );
      })}
    </div>
  );
}
