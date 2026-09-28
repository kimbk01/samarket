import { isIntroV3HexColor, type IntroV3Background, type IntroV3Document } from "@/lib/startup/intro-v3/document";

export function patchSceneBackgroundColor(
  document: IntroV3Document,
  sceneId: string,
  color: string
): IntroV3Document | null {
  if (!isIntroV3HexColor(color)) return null;
  const scenes = document.scenes.map((scene) => {
    if (scene.id !== sceneId) return scene;
    const background: IntroV3Background = { type: "COLOR", color };
    return { ...scene, background };
  });
  if (scenes.every((scene, i) => scene === document.scenes[i])) return null;
  return { ...document, scenes };
}
