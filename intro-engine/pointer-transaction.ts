import type { IntroShowFrame, IntroShowLayer } from "./document";
import { moveFrame, pointerToNormalized, resizeFrameAspect, type ResizeCorner } from "./geometry";
import {
  beginPointerTransaction,
  endPointerTransaction,
  getWorkingDocument,
  mutateWorkingDocument,
} from "./working-document";

export type StageOrigin = { left: number; top: number };
export type StageViewport = { width: number; height: number };

type DragSession = {
  kind: "drag";
  layerId: string;
  startFrame: IntroShowFrame;
  startNorm: { x: number; y: number };
};

type ResizeSession = {
  kind: "resize";
  layerId: string;
  corner: ResizeCorner;
  origin: StageOrigin;
  viewport: StageViewport;
};

let session: DragSession | ResizeSession | null = null;

function findLayer(layerId: string): IntroShowLayer | null {
  const doc = getWorkingDocument();
  if (!doc) return null;
  return doc.scene.layers.find((layer) => layer.id === layerId) ?? null;
}

export function startLayerDrag(
  layerId: string,
  clientX: number,
  clientY: number,
  origin: StageOrigin,
  viewport: StageViewport,
): void {
  const layer = findLayer(layerId);
  if (!layer) return;
  beginPointerTransaction();
  session = {
    kind: "drag",
    layerId,
    startFrame: { ...layer.frame },
    startNorm: pointerToNormalized(clientX, clientY, origin, viewport),
  };
}

export function startLayerResize(
  layerId: string,
  corner: ResizeCorner,
  origin: StageOrigin,
  viewport: StageViewport,
): void {
  const layer = findLayer(layerId);
  if (!layer) return;
  beginPointerTransaction();
  session = { kind: "resize", layerId, corner, origin, viewport };
}

export function updatePointer(clientX: number, clientY: number, origin: StageOrigin, viewport: StageViewport): void {
  if (!session) return;
  if (session.kind === "drag") {
    const now = pointerToNormalized(clientX, clientY, origin, viewport);
    const dx = now.x - session.startNorm.x;
    const dy = now.y - session.startNorm.y;
    const nextFrame = moveFrame(session.startFrame, dx, dy);
    const layerId = session.layerId;
    mutateWorkingDocument((doc) => ({
      ...doc,
      scene: {
        ...doc.scene,
        layers: doc.scene.layers.map((layer) =>
          layer.id === layerId ? { ...layer, frame: nextFrame } : layer,
        ),
      },
    }));
    return;
  }
  const pointer = pointerToNormalized(clientX, clientY, session.origin, session.viewport);
  const layerId = session.layerId;
  const corner = session.corner;
  mutateWorkingDocument((doc) => {
    const layer = doc.scene.layers.find((item) => item.id === layerId);
    if (!layer) return doc;
    return {
      ...doc,
      scene: {
        ...doc.scene,
        layers: doc.scene.layers.map((item) =>
          item.id === layerId ? { ...item, frame: resizeFrameAspect(item.frame, corner, pointer) } : item,
        ),
      },
    };
  });
}

export function endPointer(): void {
  if (!session) return;
  session = null;
  endPointerTransaction();
}

export function isEnginePointerActive(): boolean {
  return session !== null;
}
