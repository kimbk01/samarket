/**
 * DIBAY INTRO — Phase 1
 * Pure CONTENT_FIT responsive mapping.
 * No positioned COVER mapping.
 */

import type {
  AspectRatioV1,
  DeviceClassV1,
  FrameV1,
  LayerV1,
} from "../contracts/document";
import {
  BASE_COMPOSITION_ASPECT,
  TABLET_LANDSCAPE_ASPECT,
} from "../contracts/document";

export type ViewportSize = {
  readonly width: number;
  readonly height: number;
};

export type ContentRegion = {
  readonly RW: number;
  readonly RH: number;
  readonly OX: number;
  readonly OY: number;
  readonly aspect: AspectRatioV1;
};

export type DeviceRect = {
  readonly vx: number;
  readonly vy: number;
  readonly vw: number;
  readonly vh: number;
};

/**
 * FIT content region:
 *   scale = min(VW/CaW, VH/CaH)
 *   RW = CaW * scale
 *   RH = CaH * scale
 *   OX = (VW - RW) / 2
 *   OY = (VH - RH) / 2
 */
export function fitContentRegion(
  viewport: ViewportSize,
  aspect: AspectRatioV1,
): ContentRegion {
  const CaW = aspect.w;
  const CaH = aspect.h;
  const VW = viewport.width;
  const VH = viewport.height;
  const scale = Math.min(VW / CaW, VH / CaH);
  const RW = CaW * scale;
  const RH = CaH * scale;
  const OX = (VW - RW) / 2;
  const OY = (VH - RH) / 2;
  return { RW, RH, OX, OY, aspect };
}

export function mapFrameToDevice(
  frame: FrameV1,
  region: ContentRegion,
): DeviceRect {
  return {
    vx: region.OX + frame.x * region.RW,
    vy: region.OY + frame.y * region.RH,
    vw: frame.w * region.RW,
    vh: frame.h * region.RH,
  };
}

export type ResolvedLayerGeometry = {
  readonly layerId: string;
  readonly frame: FrameV1;
  readonly region: ContentRegion;
  readonly deviceRect: DeviceRect;
  readonly usedTabletOverride: boolean;
  readonly mapping: "CONTENT_FIT";
};

/**
 * Resolve layer geometry for a device class.
 * Tablet: override frame + 16:10 FIT if present; else base 9:16 FIT fallback.
 * Never COVER for positioned content.
 */
export function resolveLayerGeometry(
  layer: LayerV1,
  viewport: ViewportSize,
  deviceClass: DeviceClassV1,
): ResolvedLayerGeometry {
  const hasOverride =
    deviceClass === "TABLET_LANDSCAPE" &&
    layer.layoutOverrides?.TABLET_LANDSCAPE?.frame != null;

  const aspect = hasOverride
    ? TABLET_LANDSCAPE_ASPECT
    : BASE_COMPOSITION_ASPECT;
  const frame = hasOverride
    ? layer.layoutOverrides!.TABLET_LANDSCAPE!.frame
    : layer.frame;
  const region = fitContentRegion(viewport, aspect);
  const deviceRect = mapFrameToDevice(frame, region);

  return {
    layerId: layer.layerId,
    frame,
    region,
    deviceRect,
    usedTabletOverride: Boolean(hasOverride),
    mapping: "CONTENT_FIT",
  };
}

/**
 * VIEWPORT IMAGE fills the physical viewport; media fit applies inside.
 * Not a second authored coordinate authority.
 */
export function resolveViewportImageRect(
  viewport: ViewportSize,
): DeviceRect {
  return {
    vx: 0,
    vy: 0,
    vw: viewport.width,
    vh: viewport.height,
  };
}

/** Positioned layers MUST NOT use viewport COVER composition mapping. */
export function isPositionedCoverForbidden(layer: LayerV1): boolean {
  if (layer.type === "LOGO" || layer.type === "TEXT" || layer.type === "CTA") {
    return true;
  }
  if (layer.type === "IMAGE" && layer.surface === "CONTENT") {
    return true;
  }
  return false;
}

export function isFullyVisibleInViewport(
  rect: DeviceRect,
  viewport: ViewportSize,
  epsilon = 1e-6,
): boolean {
  return (
    rect.vx >= -epsilon &&
    rect.vy >= -epsilon &&
    rect.vx + rect.vw <= viewport.width + epsilon &&
    rect.vy + rect.vh <= viewport.height + epsilon &&
    rect.vw > 0 &&
    rect.vh > 0
  );
}
