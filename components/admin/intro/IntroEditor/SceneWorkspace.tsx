"use client";

import { useRef, useState, type PointerEvent } from "react";
import { introSceneBackgroundCssColor } from "@/lib/startup/intro/renderer/scene-background";
import type { IntroV3Background, IntroV3Layer, IntroV3Scene } from "@/lib/startup/intro-v3/document";
import {
  resizeIntroV3GeometryPreserveAspect,
  transformIntroV3GeometryToRect,
  translateIntroV3Geometry,
  type IntroV3Geometry,
  type IntroV3ResizeHandle,
} from "@/lib/startup/intro-v3/geometry";
import { isIntroV3PersistableRef } from "@/lib/startup/intro-v3/persistable";
import type { IntroV3ReadyCatalogItem } from "@/lib/startup/intro-v3/media-upload-client";
import { introV3CatalogPublicUrl, introV3CatalogToken } from "@/lib/startup/intro-v3/media-upload-client";

const HANDLES: IntroV3ResizeHandle[] = ["nw", "ne", "sw", "se"];

function catalogForLayer(
  layer: IntroV3Layer,
  catalog: IntroV3ReadyCatalogItem[]
): IntroV3ReadyCatalogItem | null {
  if (layer.type !== "IMAGE") return null;
  const token = layer.payload.mediaRef;
  return catalog.find((item) => introV3CatalogToken(item) === token) ?? null;
}

type PointerSession =
  | {
      kind: "drag";
      layerId: string;
      origin: IntroV3Geometry;
      startX: number;
      startY: number;
    }
  | {
      kind: "resize";
      layerId: string;
      handle: IntroV3ResizeHandle;
      origin: IntroV3Geometry;
      startX: number;
      startY: number;
      mediaAspect: number;
    };

export function SceneWorkspace({
  scene,
  selectedLayerId,
  catalog,
  onSelect,
  onGeometryChange,
}: {
  scene: IntroV3Scene;
  selectedLayerId: string | null;
  catalog: IntroV3ReadyCatalogItem[];
  onSelect: (layerId: string | null) => void;
  onGeometryChange: (layerId: string, geometry: IntroV3Geometry) => void;
}) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<PointerSession | null>(null);
  const [session, setSession] = useState<PointerSession | null>(null);
  const color = introSceneBackgroundCssColor(scene.background as IntroV3Background);
  const layers = [...scene.layers].sort((a, b) => a.z - b.z);

  const surfaceSize = () => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    return { width: Math.max(1, rect?.width ?? 1), height: Math.max(1, rect?.height ?? 1) };
  };

  const endPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (sessionRef.current) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* already released */
      }
    }
    sessionRef.current = null;
    setSession(null);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = sessionRef.current;
    if (!current) return;
    const size = surfaceSize();
    const dxPct = ((event.clientX - current.startX) / size.width) * 100;
    const dyPct = ((event.clientY - current.startY) / size.height) * 100;
    if (current.kind === "drag") {
      onGeometryChange(current.layerId, translateIntroV3Geometry(current.origin, { dxPct, dyPct }));
      return;
    }
    onGeometryChange(
      current.layerId,
      resizeIntroV3GeometryPreserveAspect({
        geometry: current.origin,
        handle: current.handle,
        dxPct,
        dyPct,
        mediaAspect: current.mediaAspect,
        surfaceWidth: size.width,
        surfaceHeight: size.height,
      })
    );
  };

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#ececf1] p-6" data-intro-workspace="1">
      <div
        ref={surfaceRef}
        className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-ui-rect shadow-[0_8px_24px_rgba(15,23,42,0.12)] ring-1 ring-black/10"
        data-intro-scene-surface="1"
        data-intro-scene-aspect="viewport"
        data-intro-pointer-session={session ? session.kind : "idle"}
        style={{ backgroundColor: color }}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) onSelect(null);
        }}
      >
        {layers.map((layer) => {
          if (layer.type !== "IMAGE") return null;
          const item = catalogForLayer(layer, catalog);
          const url = item ? introV3CatalogPublicUrl(item) : null;
          if (!url || !isIntroV3PersistableRef(url)) return null;
          const size = surfaceRef.current?.getBoundingClientRect();
          const viewport = { width: Math.max(1, size?.width ?? 360), height: Math.max(1, size?.height ?? 640) };
          const rect = transformIntroV3GeometryToRect({
            geometry: layer.geometry,
            viewport,
            mediaWidth: item?.derivative.width,
            mediaHeight: item?.derivative.height,
          });
          const selected = selectedLayerId === layer.id;
          return (
            <div
              key={layer.id}
              className="absolute"
              data-intro-image-layer={layer.id}
              data-intro-selected={selected ? "1" : "0"}
              style={{
                left: rect.x,
                top: rect.y,
                width: rect.width,
                height: rect.height,
                zIndex: layer.z,
                opacity: layer.visible ? 1 : 0.35,
                outline: selected ? "2px solid #2563eb" : "none",
                cursor: "move",
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
                onSelect(layer.id);
                const next: PointerSession = {
                  kind: "drag",
                  layerId: layer.id,
                  origin: layer.geometry,
                  startX: event.clientX,
                  startY: event.clientY,
                };
                sessionRef.current = next;
                setSession(next);
                surfaceRef.current?.setPointerCapture(event.pointerId);
              }}
            >
              {/* Composition canvas: fit is CONTAIN/COVER product authority, not thumbnail crop. */}
              <img
                src={url}
                alt={layer.payload.alt || ""}
                draggable={false}
                className="pointer-events-none h-full w-full select-none"
                data-intro-image-render="1"
                style={{ objectFit: layer.geometry.fit === "COVER" ? "cover" : "contain" }}
              />
              {selected
                ? HANDLES.map((handle) => (
                    <span
                      key={handle}
                      data-intro-resize-handle={handle}
                      className="absolute h-3 w-3 rounded-[2px] bg-white ring-2 ring-[#2563eb]"
                      style={{
                        left: handle.includes("w") ? -6 : undefined,
                        right: handle.includes("e") ? -6 : undefined,
                        top: handle.includes("n") ? -6 : undefined,
                        bottom: handle.includes("s") ? -6 : undefined,
                        cursor:
                          handle === "nw" || handle === "se"
                            ? "nwse-resize"
                            : "nesw-resize",
                      }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        const mediaAspect =
                          item && item.derivative.width > 0 && item.derivative.height > 0
                            ? item.derivative.width / item.derivative.height
                            : 1;
                        const next: PointerSession = {
                          kind: "resize",
                          layerId: layer.id,
                          handle,
                          origin: layer.geometry,
                          startX: event.clientX,
                          startY: event.clientY,
                          mediaAspect,
                        };
                        sessionRef.current = next;
                        setSession(next);
                        surfaceRef.current?.setPointerCapture(event.pointerId);
                      }}
                    />
                  ))
                : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
