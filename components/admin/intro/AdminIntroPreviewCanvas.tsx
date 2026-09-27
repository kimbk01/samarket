"use client";

import type { IntroAdminAsset, IntroAdminScene } from "@/lib/startup/intro-v2/admin-editor-model";
import {
  introAdminPreviewFrame,
  layerPreviewStyle,
  type IntroAdminPreviewPreset,
} from "@/lib/startup/intro-v2/admin-preview";
import type { IntroLayer } from "@/lib/startup/intro-v2/types";

export function AdminIntroPreviewCanvas({
  scene,
  assets,
  preset,
  selectedLayerId,
  lang,
  onSelectLayer,
  onMoveLayerPct,
}: {
  scene: IntroAdminScene | null;
  assets: readonly IntroAdminAsset[];
  preset: IntroAdminPreviewPreset;
  selectedLayerId: string | null;
  lang: "ko" | "en";
  onSelectLayer: (id: string) => void;
  onMoveLayerPct: (layerId: string, xPct: number, yPct: number) => void;
}) {
  const frame = introAdminPreviewFrame(preset);
  const byId = new Map(assets.map((a) => [a.id, a]));
  const bg = scene?.backgroundAssetId ? byId.get(scene.backgroundAssetId) : null;

  return (
    <div className="space-y-2">
      <p className="text-[12px] text-sam-muted">
        {lang === "en"
          ? "Admin configuration preview. Not Native Runtime geometry."
          : "Admin 구성 미리보기입니다. Native Runtime 기하가 아닙니다."}
        {" · "}
        {frame.contract}
      </p>
      <div
        className="relative mx-auto overflow-hidden rounded-ui-rect border border-sam-border bg-black"
        style={{
          width: Math.min(frame.width, 360),
          height: Math.min(frame.height, 360) * (frame.height / frame.width > 1.6 ? 1.4 : 1),
          aspectRatio: `${frame.width} / ${frame.height}`,
          maxHeight: 560,
        }}
        data-intro-preview-contract="ADMIN_PREVIEW"
      >
        <div
          className="absolute inset-0"
          style={{ backgroundColor: scene?.backgroundColor ?? "#ffffff" }}
        />
        {bg?.publicUrl ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${bg.publicUrl})` }}
          />
        ) : null}
        <div
          className="pointer-events-none absolute border border-dashed border-sky-400/80"
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
            <PreviewLayer
              key={layer.id}
              layer={layer}
              asset={layer.assetId ? byId.get(layer.assetId) ?? null : null}
              selected={selectedLayerId === layer.id}
              interactionHit={
                scene?.interactionMode === "tap_layer" && scene.interactionLayerId === layer.id
              }
              fullHit={scene?.interactionMode === "tap_advance"}
              onSelect={() => onSelectLayer(layer.id)}
              onMove={(xPct, yPct) => onMoveLayerPct(layer.id, xPct, yPct)}
            />
          ))}
        {scene?.interactionMode === "tap_advance" ? (
          <div className="pointer-events-none absolute inset-0 border-2 border-amber-400/70" />
        ) : null}
      </div>
    </div>
  );
}

function PreviewLayer({
  layer,
  asset,
  selected,
  interactionHit,
  onSelect,
  onMove,
}: {
  layer: IntroLayer;
  asset: IntroAdminAsset | null;
  selected: boolean;
  interactionHit: boolean;
  fullHit?: boolean;
  onSelect: () => void;
  onMove: (xPct: number, yPct: number) => void;
}) {
  return (
    <button
      type="button"
      className={[
        "absolute cursor-move border text-left",
        selected ? "border-violet-500" : "border-transparent",
        interactionHit ? "ring-2 ring-amber-400" : "",
      ].join(" ")}
      style={layerPreviewStyle(layer)}
      onPointerDown={(e) => {
        onSelect();
        const parent = e.currentTarget.parentElement;
        if (!parent) return;
        const rect = parent.getBoundingClientRect();
        const startX = e.clientX;
        const startY = e.clientY;
        const originX = layer.xPct ?? 50;
        const originY = layer.yPct ?? 50;
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
      }}
    >
      {layer.type === "TEXT" || layer.type === "CTA" ? (
        <span className="block truncate text-[11px] text-white drop-shadow">{layer.text || layer.type}</span>
      ) : asset?.publicUrl ? (
        <span
          className="block h-10 w-full bg-contain bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${asset.publicUrl})` }}
        />
      ) : (
        <span className="block text-[10px] text-white/80">{layer.type}</span>
      )}
    </button>
  );
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n * 10) / 10));
}
