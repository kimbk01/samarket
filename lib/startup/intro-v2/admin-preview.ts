/**
 * Admin configuration preview presets.
 * This is NOT Native Runtime geometry authority. Phase 0 SAFE AREA = NOT_PROVEN.
 */

export const INTRO_ADMIN_PREVIEW_PRESETS = [
  "samsung_phone",
  "iphone_14_pro_max",
  "android_tablet",
  "ipad",
] as const;
export type IntroAdminPreviewPreset = (typeof INTRO_ADMIN_PREVIEW_PRESETS)[number];

export type IntroAdminPreviewFrame = {
  id: IntroAdminPreviewPreset;
  labelKo: string;
  labelEn: string;
  deviceFamily: "PHONE" | "TABLET";
  width: number;
  height: number;
  /** Guide-only insets. ADMIN PREVIEW CONTRACT — not native truth. */
  safeAreaGuide: { top: number; right: number; bottom: number; left: number };
  contract: "ADMIN_PREVIEW";
};

export const INTRO_ADMIN_PREVIEW_FRAMES: Record<IntroAdminPreviewPreset, IntroAdminPreviewFrame> = {
  samsung_phone: {
    id: "samsung_phone",
    labelKo: "Samsung Phone",
    labelEn: "Samsung Phone",
    deviceFamily: "PHONE",
    width: 360,
    height: 800,
    safeAreaGuide: { top: 24, right: 0, bottom: 16, left: 0 },
    contract: "ADMIN_PREVIEW",
  },
  iphone_14_pro_max: {
    id: "iphone_14_pro_max",
    labelKo: "iPhone 14 Pro Max",
    labelEn: "iPhone 14 Pro Max",
    deviceFamily: "PHONE",
    width: 430,
    height: 932,
    safeAreaGuide: { top: 47, right: 0, bottom: 34, left: 0 },
    contract: "ADMIN_PREVIEW",
  },
  android_tablet: {
    id: "android_tablet",
    labelKo: "Android Tablet",
    labelEn: "Android Tablet",
    deviceFamily: "TABLET",
    width: 800,
    height: 1280,
    safeAreaGuide: { top: 24, right: 16, bottom: 24, left: 16 },
    contract: "ADMIN_PREVIEW",
  },
  ipad: {
    id: "ipad",
    labelKo: "iPad",
    labelEn: "iPad",
    deviceFamily: "TABLET",
    width: 834,
    height: 1194,
    safeAreaGuide: { top: 24, right: 20, bottom: 20, left: 20 },
    contract: "ADMIN_PREVIEW",
  },
};

export function introAdminPreviewFrame(preset: IntroAdminPreviewPreset): IntroAdminPreviewFrame {
  return INTRO_ADMIN_PREVIEW_FRAMES[preset];
}

/**
 * Convert Phase 1 normalized coords to preview CSS percent.
 * Admin CSS pixels are never stored.
 */
export function layerPreviewStyle(layer: {
  anchor: string;
  xPct?: number;
  yPct?: number;
  widthPct?: number;
  opacity?: number;
  rotation?: number;
}): Record<string, string> {
  const x = layer.xPct ?? 50;
  const y = layer.yPct ?? 50;
  const width = layer.widthPct ?? 40;
  const transform: string[] = [];
  if (layer.anchor.includes("center") && !layer.anchor.startsWith("center_")) {
    transform.push("translate(-50%, -50%)");
  } else if (layer.anchor.endsWith("_center")) {
    transform.push("translateX(-50%)");
  } else if (layer.anchor.startsWith("center_")) {
    transform.push("translateY(-50%)");
  }
  if (layer.rotation) transform.push(`rotate(${layer.rotation}deg)`);
  return {
    position: "absolute",
    left: `${x}%`,
    top: `${y}%`,
    width: `${width}%`,
    opacity: String(layer.opacity ?? 1),
    transform: transform.join(" "),
  };
}
