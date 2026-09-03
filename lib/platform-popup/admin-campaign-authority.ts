/**
 * CUT 4 — Admin campaign validation + material-edit policy (server authority).
 * Does not invent lifecycle edges — uses campaign-lifecycle SSOT.
 */

import { validatePlatformPopupCta } from "@/lib/platform-popup/cta";
import { isPlatformPopupCreativeAspectValid } from "@/lib/platform-popup/creative-contract";
import type {
  PlatformPopupApprovalStatus,
  PlatformPopupCampaignStatus,
  PlatformPopupCtaType,
  PlatformPopupSuppressionMode,
  PlatformPopupTargetSurface,
} from "@/lib/platform-popup/types";
import {
  PLATFORM_POPUP_CTA_TYPES,
  PLATFORM_POPUP_SUPPRESSION_MODES,
  PLATFORM_POPUP_TARGET_SURFACES,
} from "@/lib/platform-popup/types";

export type PlatformPopupAdminCampaignSnapshot = {
  name: string;
  status: PlatformPopupCampaignStatus;
  approvalStatus: PlatformPopupApprovalStatus;
  priority: number;
  startAt: string | null;
  endAt: string | null;
  timezone: string;
  suppressionMode: PlatformPopupSuppressionMode;
  suppressionDurationSeconds: number | null;
  ctaType: PlatformPopupCtaType;
  ctaTarget: string;
  externalUrl: string | null;
  surfaces: readonly PlatformPopupTargetSurface[];
  creative: {
    id: string;
    status: string;
    aspectW: number;
    aspectH: number;
    assetPath: string;
    assetUrl: string | null;
  } | null;
};

const MATERIAL_KEYS = [
  "creative",
  "cta",
  "surfaces",
  "schedule",
  "suppression",
] as const;

export type PlatformPopupMaterialField = (typeof MATERIAL_KEYS)[number];

/** ACTIVE/SCHEDULED material change → return to review (CUT 4 policy). */
export function platformPopupMaterialEditRequiresReview(
  status: PlatformPopupCampaignStatus
): boolean {
  return status === "active" || status === "scheduled";
}

export function isPlatformPopupTargetSurface(value: string): value is PlatformPopupTargetSurface {
  const v = value === "OWNER_OPS" ? "DELIVERY_OWNER" : value;
  return (PLATFORM_POPUP_TARGET_SURFACES as readonly string[]).includes(v);
}

export function isPlatformPopupSuppressionMode(value: string): value is PlatformPopupSuppressionMode {
  return (PLATFORM_POPUP_SUPPRESSION_MODES as readonly string[]).includes(value);
}

export function isPlatformPopupCtaType(value: string): value is PlatformPopupCtaType {
  return (PLATFORM_POPUP_CTA_TYPES as readonly string[]).includes(value);
}

export function validatePlatformPopupCampaignForApproval(
  snap: PlatformPopupAdminCampaignSnapshot
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (!snap.name.trim()) errors.push("name_required");
  if (!snap.surfaces.length) errors.push("surface_required");
  for (const s of snap.surfaces) {
    if (!isPlatformPopupTargetSurface(s)) errors.push(`surface_invalid:${s}`);
  }

  if (!snap.creative || snap.creative.status !== "ready") {
    errors.push("creative_required");
  } else {
    if (!snap.creative.assetPath.trim() && !String(snap.creative.assetUrl ?? "").trim()) {
      errors.push("creative_asset_missing");
    }
    if (!isPlatformPopupCreativeAspectValid(snap.creative.aspectW, snap.creative.aspectH)) {
      errors.push("creative_aspect_invalid");
    }
  }

  if (snap.startAt && snap.endAt) {
    const start = new Date(snap.startAt).getTime();
    const end = new Date(snap.endAt).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      errors.push("schedule_invalid");
    }
  }

  if (!snap.timezone.trim()) errors.push("timezone_required");

  if (!isPlatformPopupSuppressionMode(snap.suppressionMode)) {
    errors.push("suppression_invalid");
  }
  if (snap.suppressionMode === "DURATION") {
    if (!(snap.suppressionDurationSeconds != null && snap.suppressionDurationSeconds > 0)) {
      errors.push("suppression_duration_required");
    }
  }

  const cta = validatePlatformPopupCta({
    ctaType: snap.ctaType,
    ctaTarget: snap.ctaTarget,
    externalUrl: snap.externalUrl,
  });
  if (!cta.ok) errors.push(`cta_invalid:${cta.error}`);

  return errors.length ? { ok: false, errors } : { ok: true };
}
