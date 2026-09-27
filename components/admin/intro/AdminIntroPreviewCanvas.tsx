"use client";

import { useMemo } from "react";
import type { IntroAdminAsset, IntroAdminScene } from "@/lib/startup/intro-v2/admin-editor-model";
import {
  introAdminPreviewFrame,
  layerPreviewStyle,
  type IntroAdminPreviewPreset,
} from "@/lib/startup/intro-v2/admin-preview";
import { clampPct, fitStageToWorkspace, withCtaVisual } from "@/lib/startup/intro-v2/composer-visual";
import { computeContainedCreativeRect } from "@/lib/startup/product-intro-geometry";
import type { IntroCta, IntroLayer } from "@/lib/startup/intro-v2/types";

export type IntroCanvasSelection =
  | { type: "layer"; id: string }
  | { type: "cta" }
  | { type: "scene" }
  | null;

const HANDLES = ["nw", "ne", "sw", "se"] as const;
type Handle = (typeof HANDLES)[number];

export function AdminIntroPreviewCanvas({
  scene,
  assets,
  preset,
  selection,
  lang,
  onSelect,
  onMoveLayerPct,
  onResizeLayerPct,
  onMoveCtaPct,
  onResizeCtaPct,
}: {
  scene: IntroAdminScene | null;
  assets: readonly IntroAdminAsset[];
  preset: IntroAdminPreviewPreset;
  selection: IntroCanvasSelection;
  lang: "ko" | "en";
  onSelect: (next: IntroCanvasSelection) => void;
  onMoveLayerPct: (layerId: string, xPct: number, yPct: number) => void;
  onResizeLayerPct: (layerId: string, next: { xPct: number; yPct: number; widthPct: number; heightPct: number }) => void;
  onMoveCtaPct: (xPct: number, yPct: number) => void;
  onResizeCtaPct: (next: { xPct: number; yPct: number; widthPct: number; heightPct: number }) => void;
}) {
  const frame = introAdminPreviewFrame(preset);
  const fitted = fitStageToWorkspace(frame.width, frame.height, 420, 640);
  const byId = new Map(assets.map((a) => [a.id, a]));
  const bg = scene?.backgroundAssetId ? byId.get(scene.backgroundAssetId) : null;
  const interaction = scene?.interactionMode ?? "none";
  const cta = scene ? withCtaVisual(scene.cta) : null;
  const showButton = interaction === "tap_cta";
  const showFullHit = interaction === "tap_advance";

  return (
    <div className="space-y-2">
      <p className="text-[12px] text-sam-muted">
        {lang === "en"
          ? `${frame.labelEn} · ${frame.width}×${frame.height} · Admin guide only`
          : `${frame.labelKo} · ${frame.width}×${frame.height} · 편집 가이드`}
      </p>
      <div
        className="relative mx-auto overflow-hidden rounded-ui-rect border border-sam-border"
        style={{
          width: fitted.width,
          height: fitted.height,
          backgroundColor: scene?.backgroundColor ?? "#ffffff",
        }}
        data-intro-stage={`${frame.width}x${frame.height}`}
        data-intro-stage-scale={fitted.scale}
        onPointerDown={() => onSelect({ type: "scene" })}
      >
        {bg?.publicUrl ? (
          <img
            src={bg.publicUrl}
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          />
        ) : null}
        <div
          className="pointer-events-none absolute border border-dashed border-sky-400/70"
          style={{
            top: `${(frame.safeAreaGuide.top / frame.height) * 100}%`,
            right: `${(frame.safeAreaGuide.right / frame.width) * 100}%`,
            bottom: `${(frame.safeAreaGuide.bottom / frame.height) * 100}%`,
            left: `${(frame.safeAreaGuide.left / frame.width) * 100}%`,
          }}
          data-safe-area-guide="admin-preview"
        />
        {(scene?.layers ?? [])
          .slice()
          .sort((a, b) => a.zIndex - b.zIndex)
          .map((layer) => (
            <VisualLayer
              key={layer.id}
              layer={layer}
              asset={layer.assetId ? byId.get(layer.assetId) ?? null : null}
              selected={selection?.type === "layer" && selection.id === layer.id}
              interactionHit={interaction === "tap_layer" && scene?.interactionLayerId === layer.id}
              onSelect={() => onSelect({ type: "layer", id: layer.id })}
              onMove={(xPct, yPct) => onMoveLayerPct(layer.id, xPct, yPct)}
              onResize={(next) => onResizeLayerPct(layer.id, next)}
            />
          ))}
        {showFullHit ? (
          <div
            className="pointer-events-none absolute inset-0 border-2 border-amber-400/80 bg-amber-400/10"
            data-intro-hit="full-scene"
          />
        ) : null}
        {showButton && cta ? (
          <VisualCta
            cta={cta}
            selected={selection?.type === "cta"}
            onSelect={() => onSelect({ type: "cta" })}
            onMove={onMoveCtaPct}
            onResize={onResizeCtaPct}
          />
        ) : null}
      </div>
    </div>
  );
}

function VisualLayer({
  layer,
  asset,
  selected,
  interactionHit,
  onSelect,
  onMove,
  onResize,
}: {
  layer: IntroLayer;
  asset: IntroAdminAsset | null;
  selected: boolean;
  interactionHit: boolean;
  onSelect: () => void;
  onMove: (xPct: number, yPct: number) => void;
  onResize: (next: { xPct: number; yPct: number; widthPct: number; heightPct: number }) => void;
}) {
  const style = layerPreviewStyle({
    ...layer,
    heightPct: layer.heightPct ?? defaultLayerHeight(layer, asset),
  });
  const fontSize = `${layer.fontSizePct ?? 4.2}cqh`;

  return (
    <div
      role="button"
      tabIndex={0}
      className={[
        "absolute cursor-move",
        selected ? "outline outline-2 outline-violet-500" : "outline-none",
        interactionHit ? "ring-2 ring-amber-400" : "",
      ].join(" ")}
      style={{ ...style, containerType: "size" }}
      data-intro-layer-id={layer.id}
      data-intro-layer-type={layer.type}
      onPointerDown={(e) => {
        e.stopPropagation();
        onSelect();
        beginDrag(e, layer.xPct ?? 50, layer.yPct ?? 50, onMove);
      }}
    >
      {layer.type === "TEXT" ? (
        <p
          className="h-full w-full overflow-hidden"
          style={{
            fontSize,
            fontWeight: layer.fontWeight ?? 700,
            lineHeight: String(layer.lineHeight ?? 1.3),
            textAlign: layer.textAlign ?? "center",
            color: "#111827",
            maxWidth: layer.maxWidthPct ? `${layer.maxWidthPct}%` : undefined,
          }}
        >
          {layer.text || ""}
        </p>
      ) : asset?.publicUrl ? (
        <ContainedImage src={asset.publicUrl} width={asset.width} height={asset.height} />
      ) : (
        <span className="block h-full w-full bg-sam-surface-muted" />
      )}
      {selected ? (
        <ResizeHandles
          xPct={layer.xPct ?? 50}
          yPct={layer.yPct ?? 50}
          widthPct={layer.widthPct ?? 40}
          heightPct={layer.heightPct ?? defaultLayerHeight(layer, asset)}
          onResize={onResize}
        />
      ) : null}
    </div>
  );
}

function ContainedImage({
  src,
  width,
  height,
}: {
  src: string;
  width: number | null;
  height: number | null;
}) {
  const rect = useMemo(() => {
    if (!width || !height) return null;
    return computeContainedCreativeRect({
      viewportWidth: 100,
      viewportHeight: 100,
      imageWidth: width,
      imageHeight: height,
      safeInsetPct: 0,
    });
  }, [width, height]);

  return (
    <img
      src={src}
      alt=""
      className="pointer-events-none h-full w-full"
      style={{
        objectFit: "contain",
        objectPosition: "center",
        width: rect ? `${rect.width}%` : "100%",
        height: rect ? `${rect.height}%` : "100%",
        marginLeft: rect ? `${rect.left}%` : 0,
        marginTop: rect ? `${rect.top}%` : 0,
      }}
      data-intro-fit="contain"
    />
  );
}

function VisualCta({
  cta,
  selected,
  onSelect,
  onMove,
  onResize,
}: {
  cta: IntroCta;
  selected: boolean;
  onSelect: () => void;
  onMove: (xPct: number, yPct: number) => void;
  onResize: (next: { xPct: number; yPct: number; widthPct: number; heightPct: number }) => void;
}) {
  const visual = withCtaVisual(cta);
  const style = layerPreviewStyle({
    anchor: "center",
    xPct: visual.xPct,
    yPct: visual.yPct,
    widthPct: visual.widthPct,
    heightPct: visual.heightPct,
    opacity: visual.opacity,
  });

  return (
    <div
      className={["absolute", selected ? "outline outline-2 outline-violet-500" : ""].join(" ")}
      style={style}
      data-intro-cta="button"
      onPointerDown={(e) => {
        e.stopPropagation();
        onSelect();
        beginDrag(e, visual.xPct ?? 50, visual.yPct ?? 86, onMove);
      }}
    >
      <button
        type="button"
        className="flex h-full w-full items-center justify-center bg-[var(--sam-brand)] text-white"
        style={{
          fontSize: `${visual.fontSizePct ?? 3.2}cqh`,
          fontWeight: visual.fontWeight ?? 700,
          borderRadius: `${visual.cornerRadiusPct ?? 24}px`,
          containerType: "size",
        }}
      >
        {visual.label || "시작하기"}
      </button>
      {selected ? (
        <ResizeHandles
          xPct={visual.xPct ?? 50}
          yPct={visual.yPct ?? 86}
          widthPct={visual.widthPct ?? 56}
          heightPct={visual.heightPct ?? 8}
          onResize={onResize}
        />
      ) : null}
    </div>
  );
}

function ResizeHandles({
  xPct,
  yPct,
  widthPct,
  heightPct,
  onResize,
}: {
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  onResize: (next: { xPct: number; yPct: number; widthPct: number; heightPct: number }) => void;
}) {
  return (
    <>
      {HANDLES.map((handle) => (
        <span
          key={handle}
          data-intro-handle={handle}
          className="absolute h-3 w-3 rounded-sm border border-white bg-violet-500"
          style={handleStyle(handle)}
          onPointerDown={(e) => {
            e.stopPropagation();
            beginResize(e, handle, { xPct, yPct, widthPct, heightPct }, onResize);
          }}
        />
      ))}
    </>
  );
}

function handleStyle(handle: Handle): Record<string, string> {
  const map: Record<Handle, Record<string, string>> = {
    nw: { left: "-6px", top: "-6px", cursor: "nwse-resize" },
    ne: { right: "-6px", top: "-6px", cursor: "nesw-resize" },
    sw: { left: "-6px", bottom: "-6px", cursor: "nesw-resize" },
    se: { right: "-6px", bottom: "-6px", cursor: "nwse-resize" },
  };
  return map[handle];
}

function beginDrag(
  e: React.PointerEvent,
  originX: number,
  originY: number,
  onMove: (xPct: number, yPct: number) => void
) {
  const parent = e.currentTarget.parentElement;
  if (!parent) return;
  const rect = parent.getBoundingClientRect();
  const startX = e.clientX;
  const startY = e.clientY;
  const move = (ev: PointerEvent) => {
    const dx = ((ev.clientX - startX) / rect.width) * 100;
    const dy = ((ev.clientY - startY) / rect.height) * 100;
    onMove(clampPct(originX + dx), clampPct(originY + dy));
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function beginResize(
  e: React.PointerEvent,
  handle: Handle,
  origin: { xPct: number; yPct: number; widthPct: number; heightPct: number },
  onResize: (next: { xPct: number; yPct: number; widthPct: number; heightPct: number }) => void
) {
  const parent = e.currentTarget.parentElement?.parentElement;
  if (!parent) return;
  const rect = parent.getBoundingClientRect();
  const startX = e.clientX;
  const startY = e.clientY;
  const move = (ev: PointerEvent) => {
    const dx = ((ev.clientX - startX) / rect.width) * 100;
    const dy = ((ev.clientY - startY) / rect.height) * 100;
    let { xPct, yPct, widthPct, heightPct } = origin;
    if (handle.includes("e")) widthPct = clampPct(origin.widthPct + dx, 4, 100);
    if (handle.includes("w")) {
      widthPct = clampPct(origin.widthPct - dx, 4, 100);
      xPct = clampPct(origin.xPct + dx);
    }
    if (handle.includes("s")) heightPct = clampPct(origin.heightPct + dy, 4, 100);
    if (handle.includes("n")) {
      heightPct = clampPct(origin.heightPct - dy, 4, 100);
      yPct = clampPct(origin.yPct + dy);
    }
    onResize({ xPct, yPct, widthPct, heightPct });
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function defaultLayerHeight(layer: IntroLayer, asset: IntroAdminAsset | null): number {
  if (layer.heightPct != null) return layer.heightPct;
  if (asset?.width && asset.height && layer.widthPct) {
    return clampPct(layer.widthPct * (asset.height / asset.width), 4, 100);
  }
  if (layer.type === "TEXT") return 12;
  return 40;
}
