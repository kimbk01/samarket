/**
 * DIBAY INTRO — Studio truthfulness helpers.
 * Empty scenes must be visible/warned; timing displayed in human seconds.
 * Pure — no DB / network.
 */

import type { LayerV1, SceneV1, IntroDocumentV1 } from "../contracts/document";

/** Full-bleed background IMAGE layer convention (VIEWPORT + full frame). */
export function isBackgroundImageLayer(layer: LayerV1): boolean {
  if (layer.type !== "IMAGE") return false;
  if (layer.surface !== "VIEWPORT") return false;
  const { x, y, w, h } = layer.frame;
  return x <= 0.02 && y <= 0.02 && w >= 0.96 && h >= 0.96;
}

export function findBackgroundImageLayer(
  scene: SceneV1,
): LayerV1 | null {
  const matches = scene.layers.filter(isBackgroundImageLayer);
  if (matches.length === 0) return null;
  return matches.reduce((a, b) => (a.zIndex <= b.zIndex ? a : b));
}

/** Meaningful authored content — not background-only. */
export function layerHasMeaningfulContent(layer: LayerV1): boolean {
  if (!layer.visible || layer.opacity <= 0) return false;
  if (isBackgroundImageLayer(layer)) return false;
  switch (layer.type) {
    case "IMAGE":
    case "LOGO":
      return Boolean(layer.mediaRefId && layer.mediaRefId.trim());
    case "TEXT":
      return Boolean(layer.content && layer.content.trim());
    case "CTA":
      return Boolean(layer.label && layer.label.trim());
    default:
      return false;
  }
}

export function isEmptyScene(scene: SceneV1): boolean {
  return !scene.layers.some(layerHasMeaningfulContent);
}

export function formatSecondsKo(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  const rounded = Math.round(s * 10) / 10;
  return Number.isInteger(rounded)
    ? `${rounded.toFixed(1)}초`
    : `${rounded}초`;
}

export function formatTotalIntroSeconds(ms: number): string {
  return formatSecondsKo(ms);
}

export type EmptySceneWarning = {
  readonly sceneIndex: number;
  readonly sceneId: string;
  readonly sceneName: string;
  readonly durationMs: number;
  readonly backgroundLabel: string;
};

function backgroundLabel(scene: SceneV1, ko: boolean): string {
  const bgImg = findBackgroundImageLayer(scene);
  if (bgImg && bgImg.type === "IMAGE" && bgImg.mediaRefId) {
    return ko ? "배경 이미지" : "background image";
  }
  const c = scene.background.color;
  if (typeof c === "string") {
    return c.toLowerCase() === "#000" || c.toLowerCase() === "#000000"
      ? ko
        ? "검정"
        : "black"
      : c;
  }
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  if (r === 0 && g === 0 && b === 0) {
    return ko ? "검정" : "black";
  }
  return `rgb(${r},${g},${b})`;
}

export function listEmptySceneWarnings(
  document: IntroDocumentV1,
  ko: boolean,
): EmptySceneWarning[] {
  const out: EmptySceneWarning[] = [];
  document.scenes.forEach((scene, idx) => {
    if (!isEmptyScene(scene)) return;
    out.push({
      sceneIndex: idx + 1,
      sceneId: scene.sceneId,
      sceneName: scene.name,
      durationMs: scene.durationMs,
      backgroundLabel: backgroundLabel(scene, ko),
    });
  });
  return out;
}

export function emptySceneBannerText(scene: SceneV1, ko: boolean): string {
  const dur = formatSecondsKo(scene.durationMs);
  const bg = backgroundLabel(scene, ko);
  if (ko) {
    return `EMPTY SCENE — 이 장면은 약 ${dur} 동안 배경만 표시됩니다. (${bg})`;
  }
  return `EMPTY SCENE — About ${dur} of background only. (${bg})`;
}
