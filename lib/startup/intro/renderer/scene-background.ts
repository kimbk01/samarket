import type { IntroV3Background } from "@/lib/startup/intro-v3/document";

/** Scene background fills the Scene surface edge-to-edge. Not a poster. */
export function introSceneBackgroundCssColor(background: IntroV3Background | null | undefined): string {
  if (background?.type === "COLOR") return background.color;
  return "#111111";
}
