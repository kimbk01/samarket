/**
 * CUT 4 — Admin create / update campaign writer (service_role).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import {
  isPlatformPopupCtaType,
  isPlatformPopupSuppressionMode,
  isPlatformPopupTargetSurface,
  platformPopupMaterialEditRequiresReview,
  validatePlatformPopupCampaignForApproval,
  type PlatformPopupAdminCampaignSnapshot,
  type PlatformPopupMaterialField,
} from "@/lib/platform-popup/admin-campaign-authority";
import { validatePlatformPopupCta } from "@/lib/platform-popup/cta";
import { PLATFORM_POPUP_DEFAULT_TIMEZONE } from "@/lib/platform-popup/types";
import type {
  PlatformPopupCtaType,
  PlatformPopupSuppressionMode,
  PlatformPopupTargetSurface,
} from "@/lib/platform-popup/types";

export type PlatformPopupAdminUpsertInput = {
  name?: string;
  priority?: number;
  startAt?: string | null;
  endAt?: string | null;
  timezone?: string;
  suppressionMode?: string;
  suppressionDurationSeconds?: number | null;
  ctaType?: string;
  ctaTarget?: string;
  externalUrl?: string | null;
  surfaces?: string[];
};

function normalizeSurfaces(raw: string[] | undefined): PlatformPopupTargetSurface[] | { error: string } {
  if (!raw) return [];
  const out: PlatformPopupTargetSurface[] = [];
  for (const s of raw) {
    let v = String(s).trim().toUpperCase();
    if (v === "OWNER_OPS") v = "DELIVERY_OWNER";
    if (!isPlatformPopupTargetSurface(v)) return { error: `surface_invalid:${v}` };
    if (!out.includes(v)) out.push(v);
  }
  // GLOBAL is exclusive — never persist mixed with domain rows.
  if (out.includes("GLOBAL")) return ["GLOBAL"];
  return out;
}

export async function createPlatformPopupAdminCampaign(
  sb: SupabaseClient,
  input: {
    adminUserId: string;
    name: string;
    surfaces?: string[];
    priority?: number;
    timezone?: string;
  }
): Promise<{ ok: true; id: string } | { ok: false; error: string; httpStatus?: number }> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "name_required", httpStatus: 400 };

  const surfaces = normalizeSurfaces(input.surfaces?.length ? input.surfaces : ["GLOBAL"]);
  if ("error" in surfaces) return { ok: false, error: surfaces.error, httpStatus: 400 };

  const { data, error } = await sb
    .from("platform_popup_campaigns")
    .insert({
      name,
      status: "draft",
      approval_status: "not_submitted",
      priority: Number.isFinite(input.priority) ? Number(input.priority) : 0,
      timezone: (input.timezone ?? PLATFORM_POPUP_DEFAULT_TIMEZONE).trim() || PLATFORM_POPUP_DEFAULT_TIMEZONE,
      created_by: input.adminUserId,
    })
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message, httpStatus: 500 };
  if (!data?.id) return { ok: false, error: "create_failed", httpStatus: 500 };

  if (surfaces.length) {
    const { error: sErr } = await sb.from("platform_popup_campaign_surfaces").insert(
      surfaces.map((surface) => ({ campaign_id: data.id, surface }))
    );
    if (sErr) return { ok: false, error: sErr.message, httpStatus: 500 };
  }

  await appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: input.adminUserId,
    target_type: "platform_popup_campaign",
    target_id: data.id,
    action: "platform_popup.create",
    before_json: null,
    after_json: { name, surfaces },
  });

  return { ok: true, id: data.id as string };
}

export async function updatePlatformPopupAdminCampaign(
  sb: SupabaseClient,
  input: {
    campaignId: string;
    adminUserId: string;
    patch: PlatformPopupAdminUpsertInput;
    materialTouched?: PlatformPopupMaterialField[];
  }
): Promise<
  | { ok: true; id: string; revertedToReview: boolean }
  | { ok: false; error: string; httpStatus?: number }
> {
  const campaignId = input.campaignId.trim();
  if (!campaignId) return { ok: false, error: "missing_id", httpStatus: 400 };

  const { data: current, error: fetchErr } = await sb
    .from("platform_popup_campaigns")
    .select(
      "id, name, status, approval_status, priority, start_at, end_at, timezone, suppression_mode, suppression_duration_seconds, cta_type, cta_target, external_url"
    )
    .eq("id", campaignId)
    .maybeSingle();

  if (fetchErr) return { ok: false, error: fetchErr.message, httpStatus: 500 };
  if (!current) return { ok: false, error: "not_found", httpStatus: 404 };

  if (current.status === "ended") {
    return { ok: false, error: "ended_immutable", httpStatus: 409 };
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.patch.name != null) {
    const name = input.patch.name.trim();
    if (!name) return { ok: false, error: "name_required", httpStatus: 400 };
    patch.name = name;
  }
  if (input.patch.priority != null) {
    if (!Number.isFinite(input.patch.priority)) {
      return { ok: false, error: "priority_invalid", httpStatus: 400 };
    }
    patch.priority = Math.trunc(input.patch.priority);
  }
  if (input.patch.timezone != null) {
    const tz = input.patch.timezone.trim();
    if (!tz) return { ok: false, error: "timezone_required", httpStatus: 400 };
    patch.timezone = tz;
  }
  if ("startAt" in input.patch) patch.start_at = input.patch.startAt || null;
  if ("endAt" in input.patch) patch.end_at = input.patch.endAt || null;

  if (input.patch.suppressionMode != null) {
    const mode = String(input.patch.suppressionMode).trim().toUpperCase();
    if (!isPlatformPopupSuppressionMode(mode)) {
      return { ok: false, error: "suppression_invalid", httpStatus: 400 };
    }
    patch.suppression_mode = mode;
  }
  if ("suppressionDurationSeconds" in input.patch) {
    const d = input.patch.suppressionDurationSeconds;
    if (d != null && (!(Number.isFinite(d) && d > 0))) {
      return { ok: false, error: "suppression_duration_invalid", httpStatus: 400 };
    }
    patch.suppression_duration_seconds = d ?? null;
  }

  if (input.patch.ctaType != null || input.patch.ctaTarget != null || "externalUrl" in input.patch) {
    const ctaType = String(input.patch.ctaType ?? current.cta_type).trim().toLowerCase();
    if (!isPlatformPopupCtaType(ctaType)) {
      return { ok: false, error: "cta_type_invalid", httpStatus: 400 };
    }
    const ctaTarget =
      input.patch.ctaTarget != null ? String(input.patch.ctaTarget).trim() : String(current.cta_target ?? "");
    const externalUrl =
      "externalUrl" in input.patch
        ? input.patch.externalUrl?.trim() || null
        : (current.external_url as string | null);
    const cta = validatePlatformPopupCta({ ctaType, ctaTarget, externalUrl });
    if (!cta.ok) return { ok: false, error: `cta_invalid:${cta.error}`, httpStatus: 400 };
    patch.cta_type = cta.value.ctaType;
    patch.cta_target = cta.value.ctaTarget;
    patch.external_url = cta.value.externalUrl;
  }

  const startAt = ("start_at" in patch ? patch.start_at : current.start_at) as string | null;
  const endAt = ("end_at" in patch ? patch.end_at : current.end_at) as string | null;
  if (startAt && endAt) {
    const a = new Date(startAt).getTime();
    const b = new Date(endAt).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) {
      return { ok: false, error: "schedule_invalid", httpStatus: 400 };
    }
  }

  const nextMode = String(patch.suppression_mode ?? current.suppression_mode).toUpperCase();
  const nextDuration =
    "suppression_duration_seconds" in patch
      ? (patch.suppression_duration_seconds as number | null)
      : (current.suppression_duration_seconds as number | null);
  if (nextMode === "DURATION" && !(nextDuration != null && nextDuration > 0)) {
    return { ok: false, error: "suppression_duration_required", httpStatus: 400 };
  }

  let surfacesChanged = false;
  if (input.patch.surfaces) {
    const surfaces = normalizeSurfaces(input.patch.surfaces);
    if ("error" in surfaces) return { ok: false, error: surfaces.error, httpStatus: 400 };
    if (!surfaces.length) return { ok: false, error: "surface_required", httpStatus: 400 };
    const { error: delErr } = await sb
      .from("platform_popup_campaign_surfaces")
      .delete()
      .eq("campaign_id", campaignId);
    if (delErr) return { ok: false, error: delErr.message, httpStatus: 500 };
    const { error: insErr } = await sb.from("platform_popup_campaign_surfaces").insert(
      surfaces.map((surface) => ({ campaign_id: campaignId, surface }))
    );
    if (insErr) return { ok: false, error: insErr.message, httpStatus: 500 };
    surfacesChanged = true;
  }

  const material = new Set(input.materialTouched ?? []);
  if (surfacesChanged) material.add("surfaces");
  if ("start_at" in patch || "end_at" in patch || "timezone" in patch) material.add("schedule");
  if ("suppression_mode" in patch || "suppression_duration_seconds" in patch) {
    material.add("suppression");
  }
  if ("cta_type" in patch || "cta_target" in patch || "external_url" in patch) material.add("cta");

  let revertedToReview = false;
  if (
    material.size > 0 &&
    platformPopupMaterialEditRequiresReview(
      current.status as import("@/lib/platform-popup/types").PlatformPopupCampaignStatus
    )
  ) {
    patch.status = "pending_review";
    patch.approval_status = "pending_review";
    patch.approved_by = null;
    patch.approved_at = null;
    revertedToReview = true;
  }

  const { error: updErr } = await sb.from("platform_popup_campaigns").update(patch).eq("id", campaignId);
  if (updErr) return { ok: false, error: updErr.message, httpStatus: 500 };

  await appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: input.adminUserId,
    target_type: "platform_popup_campaign",
    target_id: campaignId,
    action: revertedToReview ? "platform_popup.material_edit_review" : "platform_popup.update",
    before_json: {
      status: current.status,
      approval_status: current.approval_status,
    },
    after_json: {
      patch,
      material: [...material],
      revertedToReview,
    },
  });

  return { ok: true, id: campaignId, revertedToReview };
}

export async function replacePlatformPopupReadyCreative(
  sb: SupabaseClient,
  input: {
    campaignId: string;
    adminUserId: string;
    assetPath: string;
    assetUrl: string;
    altText?: string | null;
  }
): Promise<{ ok: true; creativeId: string; revertedToReview: boolean } | { ok: false; error: string; httpStatus?: number }> {
  const campaignId = input.campaignId.trim();
  if (!campaignId) return { ok: false, error: "missing_id", httpStatus: 400 };

  const { data: campaign, error: cErr } = await sb
    .from("platform_popup_campaigns")
    .select("id, status")
    .eq("id", campaignId)
    .maybeSingle();
  if (cErr) return { ok: false, error: cErr.message, httpStatus: 500 };
  if (!campaign) return { ok: false, error: "not_found", httpStatus: 404 };
  if (campaign.status === "ended") return { ok: false, error: "ended_immutable", httpStatus: 409 };

  await sb
    .from("platform_popup_creatives")
    .update({ status: "rejected", updated_at: new Date().toISOString() })
    .eq("campaign_id", campaignId)
    .eq("status", "ready");

  const { data: created, error: insErr } = await sb
    .from("platform_popup_creatives")
    .insert({
      campaign_id: campaignId,
      asset_path: input.assetPath,
      asset_url: input.assetUrl,
      aspect_w: 36,
      aspect_h: 25,
      alt_text: input.altText?.trim() || null,
      status: "ready",
    })
    .select("id")
    .maybeSingle();

  if (insErr) return { ok: false, error: insErr.message, httpStatus: 500 };
  if (!created?.id) return { ok: false, error: "creative_create_failed", httpStatus: 500 };

  let revertedToReview = false;
  if (
    platformPopupMaterialEditRequiresReview(
      String(campaign.status) as import("@/lib/platform-popup/types").PlatformPopupCampaignStatus
    )
  ) {
    await sb
      .from("platform_popup_campaigns")
      .update({
        status: "pending_review",
        approval_status: "pending_review",
        approved_by: null,
        approved_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaignId);
    revertedToReview = true;
  } else {
    await sb
      .from("platform_popup_campaigns")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", campaignId);
  }

  await appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: input.adminUserId,
    target_type: "platform_popup_campaign",
    target_id: campaignId,
    action: "platform_popup.creative_changed",
    before_json: null,
    after_json: {
      creativeId: created.id,
      assetPath: input.assetPath,
      revertedToReview,
    },
  });

  return { ok: true, creativeId: created.id as string, revertedToReview };
}

export async function loadSnapshotForApproval(
  sb: SupabaseClient,
  campaignId: string
): Promise<PlatformPopupAdminCampaignSnapshot | null> {
  const { data: row } = await sb
    .from("platform_popup_campaigns")
    .select(
      "name, status, approval_status, priority, start_at, end_at, timezone, suppression_mode, suppression_duration_seconds, cta_type, cta_target, external_url"
    )
    .eq("id", campaignId)
    .maybeSingle();
  if (!row) return null;

  const [{ data: surfaces }, { data: creative }] = await Promise.all([
    sb.from("platform_popup_campaign_surfaces").select("surface").eq("campaign_id", campaignId),
    sb
      .from("platform_popup_creatives")
      .select("id, status, aspect_w, aspect_h, asset_path, asset_url")
      .eq("campaign_id", campaignId)
      .eq("status", "ready")
      .maybeSingle(),
  ]);

  return {
    name: String(row.name ?? ""),
    status: row.status,
    approvalStatus: row.approval_status,
    priority: Number(row.priority ?? 0),
    startAt: row.start_at,
    endAt: row.end_at,
    timezone: String(row.timezone ?? ""),
    suppressionMode: row.suppression_mode as PlatformPopupSuppressionMode,
    suppressionDurationSeconds: row.suppression_duration_seconds,
    ctaType: row.cta_type as PlatformPopupCtaType,
    ctaTarget: String(row.cta_target ?? ""),
    externalUrl: row.external_url,
    surfaces: (surfaces ?? []).map((s) => (s as { surface: PlatformPopupTargetSurface }).surface),
    creative: creative
      ? {
          id: String((creative as { id: string }).id),
          status: String((creative as { status: string }).status),
          aspectW: Number((creative as { aspect_w: number }).aspect_w),
          aspectH: Number((creative as { aspect_h: number }).aspect_h),
          assetPath: String((creative as { asset_path: string }).asset_path),
          assetUrl: (creative as { asset_url: string | null }).asset_url,
        }
      : null,
  };
}

export { validatePlatformPopupCampaignForApproval };
