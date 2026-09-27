/**
 * Intro V2 Admin editor model — draft rows, not published snapshots.
 */

import {
  INTRO_ADMIN_DEFAULT_MAX_HOLD_MS,
  INTRO_ADMIN_DEFAULT_TIMEZONE,
  INTRO_INTERACTION_MODE_TO_UI,
  type IntroAdminInteractionUi,
} from "@/lib/startup/intro-v2/admin-labels";
import { emptyIntroTargeting } from "@/lib/startup/intro-v2/admin-targeting-ui";
import type {
  IntroAdvanceMode,
  IntroCampaignStatus,
  IntroCta,
  IntroDeepLinkPolicy,
  IntroDeviceFamily,
  IntroFrequencyMode,
  IntroLayer,
  IntroTargeting,
} from "@/lib/startup/intro-v2/types";

export type IntroAdminAsset = {
  id: string;
  kind: string;
  storagePath: string;
  publicUrl: string | null;
  mime: string | null;
  bytes: number | null;
  sha256: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  loop: boolean;
  decodeStatus: string;
};

export type IntroAdminScene = {
  id: string;
  sortOrder: number;
  name: string;
  advanceMode: IntroAdvanceMode;
  durationMs: number | null;
  maxHoldMs: number | null;
  transition: string;
  skipPolicy: string;
  interactionMode: string;
  interactionLayerId: string | null;
  layers: IntroLayer[];
  cta: IntroCta | null;
  backgroundColor: string;
  backgroundAssetId: string | null;
};

export type IntroAdminDeviceOverride = {
  id: string;
  sceneId: string | null;
  deviceFamily: IntroDeviceFamily;
  layers: IntroLayer[] | null;
  backgroundAssetId: string | null;
};

export type IntroAdminPublicationSummary = {
  id: string;
  revision: number;
  publishedAt: string;
  publishedBy: string | null;
  isLive: boolean;
};

export type IntroAdminCampaign = {
  id: string;
  name: string;
  status: IntroCampaignStatus;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  priority: number;
  targeting: IntroTargeting;
  frequencyMode: IntroFrequencyMode;
  deepLinkPolicy: IntroDeepLinkPolicy;
  draftRevision: number;
  publishedPublicationId: string | null;
  requiresAdminConfirmation: boolean;
  source: Record<string, unknown>;
  updatedAt: string;
  updatedBy: string | null;
  scenes: IntroAdminScene[];
  assets: IntroAdminAsset[];
  deviceOverrides: IntroAdminDeviceOverride[];
  published: IntroAdminPublicationSummary | null;
};

export type IntroAdminListRow = {
  id: string;
  name: string;
  status: IntroCampaignStatus;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  priority: number;
  targeting: IntroTargeting;
  frequencyMode: IntroFrequencyMode;
  deepLinkPolicy: IntroDeepLinkPolicy;
  draftRevision: number;
  publishedRevision: number | null;
  publishedAt: string | null;
  requiresAdminConfirmation: boolean;
  v1Imported: boolean;
  v1DisplayDurationMs: number | null;
  sceneCount: number;
  mediaTypes: string[];
  hasCta: boolean;
  interactionModes: string[];
  thumbnailUrl: string | null;
  updatedAt: string;
};

export function isV1ImportedDraft(campaign: { source: Record<string, unknown> }): boolean {
  return typeof campaign.source.v1_key === "string" && campaign.source.v1_key.length > 0;
}

export function v1DisplayDurationMs(source: Record<string, unknown>): number | null {
  const raw = source.v1_display_duration_ms;
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function sceneInteractionUi(scene: IntroAdminScene): IntroAdminInteractionUi {
  const mode = scene.interactionMode;
  if (mode === "tap_advance" || mode === "tap_cta" || mode === "tap_layer" || mode === "none") {
    return INTRO_INTERACTION_MODE_TO_UI[mode];
  }
  return "NONE";
}

export function reorderScenes(scenes: readonly IntroAdminScene[], fromIndex: number, toIndex: number): IntroAdminScene[] {
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= scenes.length || toIndex >= scenes.length) {
    return scenes.map((s, i) => ({ ...s, sortOrder: i }));
  }
  const next = [...scenes];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next.map((scene, index) => ({ ...scene, sortOrder: index }));
}

export function reorderLayers(layers: readonly IntroLayer[], fromIndex: number, toIndex: number): IntroLayer[] {
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= layers.length || toIndex >= layers.length) {
    return layers.map((layer, index) => ({ ...layer, zIndex: index + 1 }));
  }
  const next = [...layers];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next.map((layer, index) => ({ ...layer, zIndex: index + 1 }));
}

/** Operator chose a complete advance — not a guessed TIMER from V1 duration=0. */
export function scenesHaveExplicitAdvance(scenes: readonly IntroAdminScene[]): boolean {
  if (scenes.length < 1) return false;
  return scenes.every((scene) => {
    if (scene.advanceMode === "timer") return scene.durationMs != null && scene.durationMs >= 1;
    return scene.maxHoldMs != null && scene.maxHoldMs >= 1;
  });
}

export function nextSceneSortOrder(scenes: readonly { sortOrder: number }[]): number {
  if (scenes.length === 0) return 0;
  return Math.max(...scenes.map((s) => s.sortOrder)) + 1;
}

export function duplicateScene(scene: IntroAdminScene, nextId: string, sortOrder: number): IntroAdminScene {
  const idMap = new Map<string, string>();
  const layers = scene.layers.map((layer, i) => {
    const nid = `${nextId}-l${i + 1}`;
    idMap.set(layer.id, nid);
    return { ...layer, id: nid };
  });
  const interactionLayerId = scene.interactionLayerId
    ? idMap.get(scene.interactionLayerId) ?? null
    : null;
  return {
    ...scene,
    id: nextId,
    name: `${scene.name || "Scene"} copy`,
    sortOrder,
    layers,
    interactionLayerId,
    cta: scene.cta ? { ...scene.cta, destination: { ...scene.cta.destination } } : null,
  };
}

export function defaultNewScene(id: string, sortOrder: number, name: string): IntroAdminScene {
  return {
    id,
    sortOrder,
    name,
    advanceMode: "manual",
    durationMs: null,
    maxHoldMs: INTRO_ADMIN_DEFAULT_MAX_HOLD_MS,
    transition: "none",
    skipPolicy: "deny",
    interactionMode: "none",
    interactionLayerId: null,
    layers: [],
    cta: { enabled: false, destination: { type: "COMMUNITY" } },
    backgroundColor: "#ffffff",
    backgroundAssetId: null,
  };
}

export function defaultNewCampaignDraft(name: string): Omit<IntroAdminCampaign, "id" | "updatedAt" | "updatedBy"> {
  return {
    name,
    status: "draft",
    startsAt: null,
    endsAt: null,
    timezone: INTRO_ADMIN_DEFAULT_TIMEZONE,
    priority: 0,
    targeting: emptyIntroTargeting(),
    frequencyMode: "every_launch",
    deepLinkPolicy: "honor",
    draftRevision: 1,
    publishedPublicationId: null,
    requiresAdminConfirmation: false,
    source: {},
    scenes: [],
    assets: [],
    deviceOverrides: [],
    published: null,
  };
}

export function collectSceneMediaTypes(scenes: readonly IntroAdminScene[], assets: readonly IntroAdminAsset[]): string[] {
  const byId = new Map(assets.map((a) => [a.id, a.kind]));
  const kinds = new Set<string>();
  for (const scene of scenes) {
    if (scene.backgroundAssetId) {
      kinds.add(byId.get(scene.backgroundAssetId) ?? "image");
    }
    for (const layer of scene.layers) {
      if (layer.assetId) kinds.add(byId.get(layer.assetId) ?? "image");
    }
  }
  return [...kinds];
}
