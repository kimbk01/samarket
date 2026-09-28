"use client";

import { useEffect, useRef } from "react";
import { attachIntroPlayer, type IntroPlayerHandle } from "@/lib/dibay-intro/engine/player";
import type { DibayIntroDocument, NormalizedFrame } from "@/lib/dibay-intro/document";
import { clampFrame } from "@/lib/dibay-intro/geometry";

type Props = {
  document: DibayIntroDocument;
  sceneId: string;
  selectedLayerId: string | null;
  mediaUrlById: Record<string, string>;
  mediaSizeById: Record<string, { width: number; height: number }>;
  onSelectLayer: (id: string | null) => void;
  onFrameCommit: (layerId: string, frame: NormalizedFrame) => void;
  onPointerBegin: () => void;
  onPointerEnd: () => void;
};

export function DibayIntroStage({
  document,
  sceneId,
  selectedLayerId,
  mediaUrlById,
  mediaSizeById,
  onSelectLayer,
  onFrameCommit,
  onPointerBegin,
  onPointerEnd,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<IntroPlayerHandle | null>(null);
  const dragRef = useRef<{
    layerId: string;
    mode: "move" | "resize";
    startX: number;
    startY: number;
    startFrame: NormalizedFrame;
  } | null>(null);

  const scene = document.scenes.find((s) => s.id === sceneId) ?? document.scenes[0];

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    playerRef.current?.destroy();
    playerRef.current = attachIntroPlayer(host, {
      document,
      mediaUrlById,
      mediaSizeById,
      mode: "stage",
      stageSceneId: scene?.id,
      interactive: false,
    });
    return () => {
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [document, mediaUrlById, mediaSizeById, scene?.id]);

  function clientToNorm(event: React.PointerEvent): { x: number; y: number } | null {
    const host = hostRef.current;
    if (!host) return null;
    const rect = host.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  }

  function onOverlayPointerDown(event: React.PointerEvent, layerId: string, mode: "move" | "resize") {
    const layer = scene?.layers.find((l) => l.id === layerId);
    if (!layer) return;
    event.preventDefault();
    event.stopPropagation();
    onSelectLayer(layerId);
    onPointerBegin();
    const point = clientToNorm(event);
    if (!point) return;
    dragRef.current = {
      layerId,
      mode,
      startX: point.x,
      startY: point.y,
      startFrame: layer.frame,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onOverlayPointerMove(event: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const point = clientToNorm(event);
    if (!point) return;
    const dx = point.x - drag.startX;
    const dy = point.y - drag.startY;
    const start = drag.startFrame;
    const next =
      drag.mode === "move"
        ? clampFrame({ ...start, x: start.x + dx, y: start.y + dy })
        : clampFrame({
            ...start,
            width: start.width + dx,
            height: start.height + dy,
          });
    onFrameCommit(drag.layerId, next);
  }

  function onOverlayPointerUp() {
    if (!dragRef.current) return;
    dragRef.current = null;
    onPointerEnd();
  }

  return (
    <div className="relative mx-auto aspect-[9/16] w-full max-w-[360px] overflow-hidden rounded-ui-rect bg-black shadow-sam-elevated">
      <div ref={hostRef} className="absolute inset-0" data-dibay-intro-stage="1" />
      <div
        className="absolute inset-0"
        onPointerDown={() => onSelectLayer(null)}
        onPointerMove={onOverlayPointerMove}
        onPointerUp={onOverlayPointerUp}
      >
        {(scene?.layers ?? []).map((layer) => {
          const selected = layer.id === selectedLayerId;
          return (
            <div
              key={layer.id}
              data-dibay-intro-handle={layer.id}
              className={selected ? "absolute border-2 border-white" : "absolute border border-transparent"}
              style={{
                left: `${layer.frame.x * 100}%`,
                top: `${layer.frame.y * 100}%`,
                width: `${layer.frame.width * 100}%`,
                height: `${layer.frame.height * 100}%`,
                zIndex: 1000 + layer.z,
              }}
              onPointerDown={(event) => onOverlayPointerDown(event, layer.id, "move")}
            >
              {selected ? (
                <button
                  type="button"
                  aria-label="resize"
                  className="absolute right-0 bottom-0 h-3 w-3 translate-x-1/2 translate-y-1/2 bg-white"
                  onPointerDown={(event) => onOverlayPointerDown(event, layer.id, "resize")}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
