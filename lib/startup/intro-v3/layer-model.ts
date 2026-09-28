/**
 * V3 Layer model.
 * BACKGROUND is Scene-owned and MUST NOT appear in layers[].
 */

export const INTRO_V3_LAYER_TYPES = ["IMAGE", "LOGO", "TEXT", "CTA", "DECORATION"] as const;
export type IntroV3LayerType = (typeof INTRO_V3_LAYER_TYPES)[number];

export const INTRO_V3_FORBIDDEN_LAYER_TYPES = ["BACKGROUND"] as const;

export function isIntroV3LayerType(raw: unknown): raw is IntroV3LayerType {
  return typeof raw === "string" && (INTRO_V3_LAYER_TYPES as readonly string[]).includes(raw);
}

export function backgroundIsNotALayer(layers: ReadonlyArray<{ type: string }>): boolean {
  return layers.every((layer) => layer.type !== "BACKGROUND");
}
