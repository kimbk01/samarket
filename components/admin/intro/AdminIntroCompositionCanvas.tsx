"use client";

import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import {
  introCmsDisplayFit,
  introCmsPreviewFrame,
  introCmsPreviewInsets,
  type IntroCmsPreviewViewport,
} from "@/lib/startup/intro-v2/admin-cms-phase1";
import type { IntroAdminAsset, IntroAdminScene } from "@/lib/startup/intro-v2/admin-editor-model";
import { introCompositionIdentities, layerIsVisible } from "@/lib/startup/intro-v2/composition";
import {
  introTextFontSizePx,
  introUsableSceneRect,
  layerUsesSafeArea,
  transformLayerToRect,
} from "@/lib/startup/intro-v2/geometry";
import type { IntroAnimationMeta, IntroLayer } from "@/lib/startup/intro-v2/types";

function fontFamilyForToken(token: IntroLayer["fontToken"]): string {
  return 'ui-sans-serif, system-ui, "Apple SD Gothic Neo", sans-serif';
}

function animationHint(animation: IntroLayer["animation"]): string {
  if (!animation || typeof animation === "string") return typeof animation === "string" ? animation : "none";
  const meta = animation as IntroAnimationMeta;
  return [meta.enter?.type, meta.emphasis?.type, meta.exit?.type].filter((v) => v && v !== "none").join("+") || "none";
}

export function AdminIntroCompositionCanvas({
  campaignId,
  scene,
  assets,
  viewport,
  selectedLayerId,
  onSelectLayer,
  onMoveLayerPct,
}: {
  campaignId: string;
  scene: IntroAdminScene | null;
  assets: readonly IntroAdminAsset[];
  viewport: IntroCmsPreviewViewport;
  selectedLayerId: string | null;
  onSelectLayer: (layerId: string) => void;
  onMoveLayerPct?: (layerId: string, xPct: number, yPct: number) => void;
}) {
  const frame = introCmsPreviewFrame(viewport);
  const insets = introCmsPreviewInsets(viewport);
  const fit = introCmsDisplayFit(viewport);
  const scale = fit.scale;
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const layers = [...(scene?.layers ?? [])].filter(layerIsVisible).sort((a, b) => a.zIndex - b.zIndex);
  const identities = scene
    ? introCompositionIdentities({ campaignId, scene })
    : { campaignId, sceneId: "", layerIds: [], assetIds: [], texts: [], ctaTarget: "", zOrder: [] };
  const safeGuide = introUsableSceneRect({ width: frame.width, height: frame.height }, insets, true);
  const backgroundAsset = scene?.backgroundAssetId ? byId.get(scene.backgroundAssetId) : null;

  return (
    <div
      className="space-y-2"
      data-intro-preview-viewport={viewport}
      data-intro-preview-frame-w={String(frame.width)}
      data-intro-preview-frame-h={String(frame.height)}
      data-intro-preview-readonly="false"
      data-intro-preview-mutation="0"
      data-intro-campaign-id={identities.campaignId}
      data-intro-scene-id={identities.sceneId}
      data-intro-layer-ids={identities.layerIds.join(",")}
      data-intro-asset-ids={identities.assetIds.join(",")}
      data-intro-texts={identities.texts.join("\u001f")}
      data-intro-cta-target={identities.ctaTarget}
      data-intro-z-order={identities.zOrder.join(",")}
    >
      <p className="text-[12px] text-sam-muted">
        {frame.width}×{frame.height} · {viewport.toUpperCase()}
      </p>
      <div
        className="relative mx-auto overflow-hidden rounded-ui-rect border border-sam-border"
        data-intro-composition-canvas="1"
        data-intro-scene-surface="1"
        data-intro-inner-composition="none"
        data-intro-logical-w={String(fit.logicalWidth)}
        data-intro-logical-h={String(fit.logicalHeight)}
        data-intro-display-w={String(fit.displayWidth)}
        data-intro-display-h={String(fit.displayHeight)}
        style={{
          width: fit.displayWidth,
          height: fit.displayHeight,
          backgroundColor: scene?.backgroundColor ?? "#ffffff",
        }}
      >
        {backgroundAsset?.publicUrl ? (
          <div className="pointer-events-none absolute inset-0" data-intro-scene-background="1">
            <SamarketThumbnail
              src={backgroundAsset.publicUrl}
              alt=""
              fill
              className="h-full w-full"
              imageClassName="h-full w-full object-cover"
            />
          </div>
        ) : null}
        <div
          className="pointer-events-none absolute border border-dashed border-sky-400/70"
          data-intro-safe-area-guide="1"
          style={{
            left: safeGuide.x * scale,
            top: safeGuide.y * scale,
            width: safeGuide.width * scale,
            height: safeGuide.height * scale,
          }}
        />
        {layers.map((layer) => {
          const asset = layer.assetId ? byId.get(layer.assetId) : null;
          const rect = transformLayerToRect({
            layer,
            viewport: { width: frame.width, height: frame.height },
            insets,
            mediaWidth: asset?.width,
            mediaHeight: asset?.height,
          });
          const usable = introUsableSceneRect(
            { width: frame.width, height: frame.height },
            insets,
            layerUsesSafeArea(layer)
          );
          const selected = layer.id === selectedLayerId;
          const objectFit =
            layer.aspectPolicy === "cover" ? "cover" : layer.aspectPolicy === "fill" ? "fill" : "contain";
          const isBackground = layer.type === "BACKGROUND";
          return (
            <div
              key={layer.id}
              role="button"
              tabIndex={0}
              data-intro-layer-node={layer.id}
              data-intro-layer-type={layer.type}
              data-intro-layer-safe-area={layerUsesSafeArea(layer) ? "true" : "false"}
              data-intro-animation={animationHint(layer.animation)}
              className={`absolute ${isBackground ? "pointer-events-none" : "cursor-move"} ${
                selected ? "ring-2 ring-sam-fg" : ""
              }`}
              style={{
                left: rect.x * scale,
                top: rect.y * scale,
                width: rect.width * scale,
                height: rect.height * scale,
                opacity: layer.opacity ?? 1,
                transform: layer.rotation ? `rotate(${layer.rotation}deg)` : undefined,
                zIndex: layer.zIndex,
                backgroundColor: isBackground ? layer.color ?? scene?.backgroundColor ?? undefined : undefined,
              }}
              onClick={(event) => {
                event.stopPropagation();
                onSelectLayer(layer.id);
              }}
              onPointerDown={(event) => {
                if (!onMoveLayerPct || isBackground) return;
                event.preventDefault();
                onSelectLayer(layer.id);
                const startX = event.clientX;
                const startY = event.clientY;
                const startPctX = layer.xPct ?? 50;
                const startPctY = layer.yPct ?? 50;
                const move = (next: PointerEvent) => {
                  const dx = ((next.clientX - startX) / scale / usable.width) * 100;
                  const dy = ((next.clientY - startY) / scale / usable.height) * 100;
                  onMoveLayerPct(
                    layer.id,
                    Math.min(100, Math.max(0, Math.round((startPctX + dx) * 10) / 10)),
                    Math.min(100, Math.max(0, Math.round((startPctY + dy) * 10) / 10))
                  );
                };
                const up = () => {
                  window.removeEventListener("pointermove", move);
                  window.removeEventListener("pointerup", up);
                };
                window.addEventListener("pointermove", move);
                window.addEventListener("pointerup", up);
              }}
            >
              {layer.type === "TEXT" ? (
                <p
                  className="h-full w-full overflow-hidden"
                  style={{
                    color: layer.color ?? "#111827",
                    fontSize: introTextFontSizePx(layer.fontSizePct, usable.height) * scale,
                    fontWeight: layer.fontWeight ?? 600,
                    lineHeight: layer.lineHeight ?? 1.3,
                    textAlign: layer.textAlign ?? "center",
                    fontFamily: fontFamilyForToken(layer.fontToken),
                    whiteSpace: layer.wrap === false ? "nowrap" : "pre-wrap",
                    WebkitLineClamp: layer.maxLines ?? undefined,
                    display: layer.maxLines ? "-webkit-box" : undefined,
                    WebkitBoxOrient: layer.maxLines ? "vertical" : undefined,
                  }}
                >
                  {layer.text ?? ""}
                </p>
              ) : layer.type === "CTA" ? (
                <div
                  className="flex h-full w-full items-center justify-center text-center"
                  style={{
                    backgroundColor: layer.fillColor ?? "#111827",
                    color: layer.color ?? "#ffffff",
                    borderRadius: `${layer.cornerRadiusPct ?? 24}%`,
                    fontSize: introTextFontSizePx(layer.fontSizePct, usable.height) * scale,
                    fontWeight: layer.fontWeight ?? 700,
                  }}
                >
                  {layer.text || scene?.cta?.label || "CTA"}
                </div>
              ) : layer.type === "BACKGROUND" && !asset?.publicUrl ? (
                <div className="h-full w-full" style={{ backgroundColor: layer.color ?? "transparent" }} />
              ) : layer.type === "DECORATION" && layer.decorationKind !== "sticker" ? (
                <div
                  className="h-full w-full"
                  style={{
                    backgroundColor: layer.fillColor ?? "#a855f7",
                    border: layer.strokeColor
                      ? `${Math.max(1, ((layer.strokeWidthPct ?? 1) / 100) * rect.width * scale)}px solid ${layer.strokeColor}`
                      : undefined,
                    borderRadius: layer.decorationKind === "divider" ? 0 : `${layer.cornerRadiusPct ?? 0}%`,
                  }}
                />
              ) : asset?.publicUrl ? (
                <SamarketThumbnail
                  src={asset.publicUrl}
                  alt=""
                  fill
                  className="h-full w-full"
                  imageClassName={
                    objectFit === "cover"
                      ? "h-full w-full object-cover"
                      : objectFit === "fill"
                        ? "h-full w-full object-fill"
                        : "h-full w-full object-contain"
                  }
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center border border-dashed border-sam-border text-[10px] text-sam-muted">
                  {layer.name || layer.type}
                </div>
              )}
            </div>
          );
        })}
        {scene?.cta?.enabled && !scene.layers.some((layer) => layer.type === "CTA" && layerIsVisible(layer)) ? (
          <div
            className="pointer-events-none absolute flex items-center justify-center bg-sam-fg text-[10px] text-sam-app"
            style={{
              ...(() => {
                const rect = transformLayerToRect({
                  layer: {
                    type: "CTA",
                    anchor: "center",
                    xPct: scene.cta.xPct,
                    yPct: scene.cta.yPct,
                    widthPct: scene.cta.widthPct,
                    heightPct: scene.cta.heightPct,
                    safeArea: true,
                    aspectPolicy: "none",
                  },
                  viewport: { width: frame.width, height: frame.height },
                  insets,
                });
                return {
                  left: rect.x * scale,
                  top: rect.y * scale,
                  width: rect.width * scale,
                  height: rect.height * scale,
                  opacity: scene.cta.opacity ?? 1,
                };
              })(),
            }}
          >
            {scene.cta.label || "CTA"}
          </div>
        ) : null}
      </div>
    </div>
  );
}
