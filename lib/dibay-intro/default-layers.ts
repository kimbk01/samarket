import {
  DIBAY_GREEN,
  DIBAY_INTRO_FONT_FAMILY,
  type CtaLayer,
  type ImageLayer,
  type LogoLayer,
  type TextLayer,
} from "@/lib/dibay-intro/document";

function newId(): string {
  return crypto.randomUUID();
}

export function createImageLayer(mediaId: string, z: number): ImageLayer {
  return {
    id: newId(),
    type: "IMAGE",
    z,
    visible: true,
    opacity: 1,
    frame: { x: 0, y: 0, width: 1, height: 1 },
    mediaId,
    fit: "cover",
  };
}

export function createLogoLayer(mediaId: string, z: number): LogoLayer {
  return {
    id: newId(),
    type: "LOGO",
    z,
    visible: true,
    opacity: 1,
    frame: { x: 0.25, y: 0.28, width: 0.5, height: 0.22 },
    mediaId,
    fit: "contain",
  };
}

export function createTextLayer(z: number, content = ""): TextLayer {
  return {
    id: newId(),
    type: "TEXT",
    z,
    visible: true,
    opacity: 1,
    frame: { x: 0.1, y: 0.54, width: 0.8, height: 0.16 },
    content,
    fontFamily: DIBAY_INTRO_FONT_FAMILY,
    fontSizePx: 28,
    fontWeight: 700,
    align: "center",
    color: "#FFFFFF",
    lineHeight: 1.3,
  };
}

export function createCtaLayer(z: number): CtaLayer {
  return {
    id: newId(),
    type: "CTA",
    z,
    visible: true,
    opacity: 1,
    frame: { x: 0.22, y: 0.74, width: 0.56, height: 0.1 },
    label: "시작하기",
    style: "primary",
    action: "CONTINUE",
    destination: null,
  };
}

export function nextLayerZ(layers: { z: number }[]): number {
  if (!layers.length) return 1;
  return Math.max(...layers.map((l) => l.z)) + 1;
}

export const DEFAULT_SCENE_GREEN = DIBAY_GREEN;
