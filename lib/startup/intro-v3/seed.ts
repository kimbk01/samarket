import { introV3CampaignSource, type IntroV3Document, type IntroV3Scene } from "@/lib/startup/intro-v3/document";
import { defaultIntroV3SceneTransition } from "@/lib/startup/intro-v3/motion";

/** Operator-changeable default. Not a brand lock. */
export const INTRO_V3_SEED_BACKGROUND_COLOR = "#111111";
export const INTRO_V3_SEED_HOLD_MS = 3200;
export const INTRO_V3_SEED_TRANSITION_MS = 300;

export function createIntroV3SeedScene(ids?: { sceneId?: string }): IntroV3Scene {
  return {
    id: ids?.sceneId ?? "scene-1",
    background: { type: "COLOR", color: INTRO_V3_SEED_BACKGROUND_COLOR },
    layers: [],
    holdMs: INTRO_V3_SEED_HOLD_MS,
    advance: "TIMER",
    transition: defaultIntroV3SceneTransition(),
  };
}

export function createIntroV3SeedDocument(ids?: { sceneId?: string }): IntroV3Document {
  return {
    schemaVersion: 3,
    scenes: [createIntroV3SeedScene(ids)],
  };
}

export function createIntroV3CampaignSource(ids?: { sceneId?: string }): Record<string, unknown> {
  return introV3CampaignSource(createIntroV3SeedDocument(ids));
}
