/**
 * DIBAY Intro Phase 1 — Admin CMS editing foundation.
 * Operator (Failed B) and Device Composer (Failed A) are not final editor authority.
 */

import { introDraftFingerprint } from "@/lib/startup/intro-v2/admin-document-state";
import type { IntroAdminCampaign, IntroAdminScene } from "@/lib/startup/intro-v2/admin-editor-model";
import type { IntroOperatorAppState } from "@/lib/startup/intro-operator-contract";
import type { IntroSurfaceInsets } from "@/lib/startup/intro-v2/geometry";

export const INTRO_CMS_EDITOR_SHELL = "AdminIntroCmsEditorPage" as const;
export const INTRO_CMS_EDITOR_DATA_ATTR = "cms-v1" as const;
export const INTRO_CMS_EDITOR_ROUTE = "/admin/intro/[campaignId]" as const;

export const INTRO_CMS_PREVIEW_VIEWPORTS = ["phone", "tablet", "wide"] as const;
export type IntroCmsPreviewViewport = (typeof INTRO_CMS_PREVIEW_VIEWPORTS)[number];

export const INTRO_CMS_SCENE_NAVIGATOR_ACTIONS = [
  "add",
  "duplicate",
  "delete",
  "reorder",
  "select",
] as const;

export type IntroCmsUnsavedDecision = "stay" | "discard_leave";
export type IntroCmsNavigationResolution = "allow" | "block" | "leave_without_save";
export type IntroCmsDeviceReadiness = "unknown";

export function cloneIntroAdminCampaign(campaign: IntroAdminCampaign): IntroAdminCampaign {
  return structuredClone(campaign);
}

export function introCmsIsDirty(current: IntroAdminCampaign, saved: IntroAdminCampaign): boolean {
  return introDraftFingerprint(current) !== introDraftFingerprint(saved);
}

export function discardIntroCmsEdits(saved: IntroAdminCampaign): IntroAdminCampaign {
  return cloneIntroAdminCampaign(saved);
}

export function applyIntroCmsSaveResult(input: {
  current: IntroAdminCampaign;
  ok: boolean;
  saved: IntroAdminCampaign | null;
}): { campaign: IntroAdminCampaign; persisted: boolean } {
  if (input.ok && input.saved) {
    return { campaign: cloneIntroAdminCampaign(input.saved), persisted: true };
  }
  return { campaign: input.current, persisted: false };
}

export function resolveIntroCmsUnsavedNavigation(input: {
  dirty: boolean;
  decision: IntroCmsUnsavedDecision | null;
}): IntroCmsNavigationResolution {
  if (!input.dirty) return "allow";
  if (input.decision === "discard_leave") return "leave_without_save";
  return "block";
}

export function introCmsDraftSavePayload(campaign: IntroAdminCampaign): {
  name: string;
  status: IntroAdminCampaign["status"];
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  priority: number;
  targeting: IntroAdminCampaign["targeting"];
  frequencyMode: IntroAdminCampaign["frequencyMode"];
  deepLinkPolicy: IntroAdminCampaign["deepLinkPolicy"];
  scenes: IntroAdminScene[];
  source: Record<string, unknown>;
} {
  const previousPhase2 =
    campaign.source.phase2 && typeof campaign.source.phase2 === "object"
      ? (campaign.source.phase2 as Record<string, unknown>)
      : {};
  const sceneTransitions: Record<string, { durationMs: number; easing: string }> = {};
  for (const scene of campaign.scenes) {
    sceneTransitions[scene.id] = {
      durationMs: scene.transitionMs ?? 280,
      easing: scene.transitionEasing ?? "ease_out",
    };
  }
  return {
    name: campaign.name,
    status: campaign.status,
    startsAt: campaign.startsAt,
    endsAt: campaign.endsAt,
    timezone: campaign.timezone,
    priority: campaign.priority,
    targeting: campaign.targeting,
    frequencyMode: campaign.frequencyMode,
    deepLinkPolicy: campaign.deepLinkPolicy,
    scenes: campaign.scenes,
    source: {
      ...campaign.source,
      sizePresetFinalAuthority: false,
      phase2: {
        ...previousPhase2,
        sceneTransitions,
      },
    },
  };
}

export function introCmsPreviewFrame(viewport: IntroCmsPreviewViewport): {
  viewport: IntroCmsPreviewViewport;
  width: number;
  height: number;
  contract: "ADMIN_PREVIEW" | "ADMIN_VERIFICATION";
  writesCreative: false;
} {
  // Explicit numeric literals are required. Shared frame-object lookup was collapsed
  // by the Production client bundler so tablet reused the phone 360×800 surface.
  if (viewport === "phone") {
    return {
      viewport,
      width: 360,
      height: 800,
      contract: "ADMIN_PREVIEW",
      writesCreative: false,
    };
  }
  if (viewport === "tablet") {
    return {
      viewport,
      width: 800,
      height: 1280,
      contract: "ADMIN_PREVIEW",
      writesCreative: false,
    };
  }
  return {
    viewport: "wide",
    width: 1280,
    height: 800,
    contract: "ADMIN_VERIFICATION",
    writesCreative: false,
  };
}

/**
 * Display-scale only. Must preserve Scene aspect.
 * Phone 360×800 can render 1:1. Never contain the whole Intro into 320×520.
 */
export const INTRO_CMS_DISPLAY_MAX = {
  phone: { width: 360, height: 800 },
  tablet: { width: 400, height: 640 },
  wide: { width: 640, height: 400 },
} as const;

export type IntroCmsDisplayFit = {
  scale: number;
  displayWidth: number;
  displayHeight: number;
  logicalWidth: number;
  logicalHeight: number;
};

export function introCmsDisplayFit(viewport: IntroCmsPreviewViewport): IntroCmsDisplayFit {
  const frame = introCmsPreviewFrame(viewport);
  const max = INTRO_CMS_DISPLAY_MAX[viewport];
  const scale = Math.min(max.width / frame.width, max.height / frame.height);
  return {
    scale,
    displayWidth: Math.round(frame.width * scale),
    displayHeight: Math.round(frame.height * scale),
    logicalWidth: frame.width,
    logicalHeight: frame.height,
  };
}

export function introCmsPreviewInsets(viewport: IntroCmsPreviewViewport): IntroSurfaceInsets {
  if (viewport === "phone") return { top: 24, right: 0, bottom: 16, left: 0 };
  if (viewport === "tablet") return { top: 24, right: 16, bottom: 24, left: 16 };
  return { top: 24, right: 24, bottom: 24, left: 24 };
}

export function introCmsCanDeleteScene(sceneCount: number): boolean {
  return sceneCount > 1;
}

export function introCmsListDeviceReadiness(_appState: IntroOperatorAppState): IntroCmsDeviceReadiness {
  return "unknown";
}

export function introCmsDeviceReadinessLabel(lang: "ko" | "en"): string {
  return lang === "en" ? "Device receipt unconfirmed" : "기기 수신 상태 미확인";
}

export function isIntroCmsFinalEditorAuthority(input: {
  routedComponent: string;
  operatorRouted: boolean;
  deviceComposerRouted: boolean;
}): boolean {
  return (
    input.routedComponent === INTRO_CMS_EDITOR_SHELL &&
    !input.operatorRouted &&
    !input.deviceComposerRouted
  );
}
