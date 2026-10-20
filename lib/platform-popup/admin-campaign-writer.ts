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
import {
  PLATFORM_POPUP_DEFAULT_INTERNAL_CTA_PATH,
  PLATFORM_POPUP_DEFAULT_TIMEZONE,
} from "@/lib/platform-popup/types";
import type {
  PlatformPopupCtaType,
  PlatformPopupSuppressionMode,
  PlatformPopupTargetSurface,
} from "@/lib/platform-popup/types";
import {
  isPlatformPopupAdminSelectablePresentation,
  isPlatformPopupFrequencyMode,
  isPlatformPopupPresentationType,
  isPlatformPopupPtrRevealPresentation,
} from "@/lib/platform-popup/presentation-contract";
import {
  normalizePtrBandVariant,
  PTR_BAND_SPECS,
  type PtrBandVariant,
} from "@/lib/platform-popup/ptr-reveal-contract";
import {
  normalizeAudienceUserIds,
  normalizePtrRevealAudienceMode,
  type PtrRevealAudienceMode,
} from "@/lib/platform-popup/ptr-reveal-audience";

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
  presentationType?: string;
  frequencyMode?: string;
  /** Persist A/B creative mode without requiring re-upload. */
  creativeMode?: "card" | "artwork";
  ctaLabel?: string | null;
  title?: string | null;
  body?: string | null;
  /** ptr_reveal only — ignored for interruptive popup campaigns */
  audienceMode?: PtrRevealAudienceMode | string;
  audienceUserIds?: string[];
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
    /** 생략 시 center_modal. `ptr_reveal` = 당겨서 새로고침 띠 광고 */
    presentationType?: string;
  }
): Promise<{ ok: true; id: string } | { ok: false; error: string; httpStatus?: number }> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "name_required", httpStatus: 400 };
  const presentationType = String(input.presentationType ?? "center_modal").trim().toLowerCase();
  if (!isPlatformPopupAdminSelectablePresentation(presentationType)) {
    return { ok: false, error: "presentation_invalid", httpStatus: 400 };
  }

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
      cta_type: "internal_page",
      cta_target: PLATFORM_POPUP_DEFAULT_INTERNAL_CTA_PATH,
      external_url: null,
      presentation_type: presentationType,
      // PTR 띠 광고는 생성 시 허용 목록(빈 목록 = 누구에게도 미노출, fail-closed) — 공개는 관리자가 명시적으로 전환
      ...(presentationType === "ptr_reveal" ? { audience_mode: "allowlist", audience_user_ids: [] } : {}),
      frequency_mode: "once_per_session",
      suppression_mode: "SESSION",
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
    after_json: { name, surfaces, presentationType },
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
      "id, name, status, approval_status, priority, start_at, end_at, timezone, suppression_mode, suppression_duration_seconds, cta_type, cta_target, external_url, presentation_type"
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

  if (input.patch.presentationType != null) {
    const p = String(input.patch.presentationType).trim().toLowerCase();
    if (!isPlatformPopupPresentationType(p) || !isPlatformPopupAdminSelectablePresentation(p)) {
      return { ok: false, error: "presentation_invalid", httpStatus: 400 };
    }
    // 팝업 ↔ PTR 띠 배너 전환 금지 — 소재 규격이 달라 팝업이 PTR 로(또는 반대로) 노출되는 것을 막는다.
    if (
      isPlatformPopupPtrRevealPresentation(p) !==
      isPlatformPopupPtrRevealPresentation(current.presentation_type as string | null)
    ) {
      return { ok: false, error: "presentation_family_locked", httpStatus: 409 };
    }
    patch.presentation_type = p;
  }
  if (input.patch.frequencyMode != null) {
    const f = String(input.patch.frequencyMode).trim().toLowerCase();
    if (!isPlatformPopupFrequencyMode(f)) {
      return { ok: false, error: "frequency_invalid", httpStatus: 400 };
    }
    patch.frequency_mode = f;
  }

  const isPtrCurrent = isPlatformPopupPtrRevealPresentation(current.presentation_type as string | null);
  if (input.patch.audienceMode != null || "audienceUserIds" in input.patch) {
    if (!isPtrCurrent) {
      return { ok: false, error: "audience_ptr_only", httpStatus: 400 };
    }
    if (input.patch.audienceMode != null) {
      const mode = normalizePtrRevealAudienceMode(input.patch.audienceMode);
      patch.audience_mode = mode;
    }
    if ("audienceUserIds" in input.patch) {
      const normalized = normalizeAudienceUserIds(input.patch.audienceUserIds);
      if (!normalized.ok) return { ok: false, error: normalized.error, httpStatus: 400 };
      patch.audience_user_ids = normalized.ids;
    }
  }

  if ("ctaLabel" in input.patch) {
    const label = input.patch.ctaLabel?.trim() || null;
    patch.cta_label = label;
  }
  if ("title" in input.patch) {
    patch.title = input.patch.title?.trim() || null;
  }
  if ("body" in input.patch) {
    patch.body = input.patch.body?.trim() || null;
  }

  if (input.patch.ctaType != null || input.patch.ctaTarget != null || "externalUrl" in input.patch) {
    const ctaType = String(input.patch.ctaType ?? current.cta_type).trim().toLowerCase();
    if (!isPlatformPopupCtaType(ctaType)) {
      return { ok: false, error: "cta_type_invalid", httpStatus: 400 };
    }
    const ctaTargetRaw =
      input.patch.ctaTarget != null ? String(input.patch.ctaTarget).trim() : String(current.cta_target ?? "");
    const ctaTarget =
      ctaType === "internal_page" && !ctaTargetRaw
        ? PLATFORM_POPUP_DEFAULT_INTERNAL_CTA_PATH
        : ctaTargetRaw;
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
  if ("cta_type" in patch || "cta_target" in patch || "external_url" in patch || "cta_label" in patch) {
    material.add("cta");
  }
  if ("presentation_type" in patch || "title" in patch || "body" in patch) {
    material.add("creative");
  }
  if ("audience_mode" in patch || "audience_user_ids" in patch) {
    // Audience expansion (esp. allowlist → all) must re-enter review when live.
    material.add("surfaces");
  }
  if (input.patch.creativeMode === "artwork" || input.patch.creativeMode === "card") {
    if (isPlatformPopupPtrRevealPresentation(current.presentation_type as string | null)) {
      return { ok: false, error: "creative_mode_invalid_for_ptr", httpStatus: 400 };
    }
    material.add("creative");
  }

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

  if (input.patch.creativeMode === "artwork" || input.patch.creativeMode === "card") {
    const mode = input.patch.creativeMode;
    const { error: modeErr } = await sb
      .from("platform_popup_creatives")
      .update({ creative_mode: mode, updated_at: new Date().toISOString() })
      .eq("campaign_id", campaignId)
      .eq("status", "ready");
    if (modeErr) return { ok: false, error: modeErr.message, httpStatus: 500 };
  }

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
    aspectW?: number;
    aspectH?: number;
    creativeMode?: "card" | "artwork" | "ptr_band";
    /** creativeMode=ptr_band 전용 */
    ptrBandVariant?: PtrBandVariant;
  }
): Promise<{ ok: true; creativeId: string; revertedToReview: boolean } | { ok: false; error: string; httpStatus?: number }> {
  const campaignId = input.campaignId.trim();
  if (!campaignId) return { ok: false, error: "missing_id", httpStatus: 400 };

  const { data: campaign, error: cErr } = await sb
    .from("platform_popup_campaigns")
    .select("id, status, presentation_type")
    .eq("id", campaignId)
    .maybeSingle();
  if (cErr) return { ok: false, error: cErr.message, httpStatus: 500 };
  if (!campaign) return { ok: false, error: "not_found", httpStatus: 404 };
  if (campaign.status === "ended") return { ok: false, error: "ended_immutable", httpStatus: 409 };

  const isPtrCampaign = isPlatformPopupPtrRevealPresentation(
    (campaign as { presentation_type?: string | null }).presentation_type
  );
  if (isPtrCampaign !== (input.creativeMode === "ptr_band")) {
    // PTR 캠페인 ↔ ptr_band 소재만 짝 — 팝업 소재가 PTR 로, PTR 띠가 팝업으로 쓰이지 않게.
    return { ok: false, error: "creative_mode_presentation_mismatch", httpStatus: 400 };
  }

  const creativeMode =
    input.creativeMode === "ptr_band" ? "ptr_band" : input.creativeMode === "artwork" ? "artwork" : "card";
  const ptrVariant = normalizePtrBandVariant(input.ptrBandVariant);
  const aspectW =
    creativeMode === "ptr_band"
      ? PTR_BAND_SPECS[ptrVariant].aspectW
      : creativeMode === "artwork" && input.aspectW && input.aspectW > 0
        ? Math.trunc(input.aspectW)
        : 36;
  const aspectH =
    creativeMode === "ptr_band"
      ? PTR_BAND_SPECS[ptrVariant].aspectH
      : creativeMode === "artwork" && input.aspectH && input.aspectH > 0
        ? Math.trunc(input.aspectH)
        : 25;

  if (creativeMode === "ptr_band") {
    // 같은 변형의 ready 만 교체 — 휴대폰·태블릿 띠·로고는 각각 1개씩 ready 유지.
    const { error: rejErr } = await sb
      .from("platform_popup_creatives")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("campaign_id", campaignId)
      .eq("status", "ready")
      .eq("variant", ptrVariant);
    if (rejErr) return { ok: false, error: rejErr.message, httpStatus: 500 };
  } else {
    await sb
      .from("platform_popup_creatives")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("campaign_id", campaignId)
      .eq("status", "ready");
  }

  const row: Record<string, unknown> = {
    campaign_id: campaignId,
    asset_path: input.assetPath,
    asset_url: input.assetUrl,
    aspect_w: aspectW,
    aspect_h: aspectH,
    creative_mode: creativeMode,
    alt_text: input.altText?.trim() || null,
    status: "ready",
  };
  // `variant` 컬럼은 PTR 마이그레이션 이후에만 존재 — 기존 팝업 경로는 컬럼을 참조하지 않는다(기본값 default).
  if (creativeMode === "ptr_band") row.variant = ptrVariant;

  const { data: created, error: insErr } = await sb
    .from("platform_popup_creatives")
    .insert(row)
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
      creativeMode,
      ...(creativeMode === "ptr_band" ? { variant: ptrVariant } : {}),
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
      "name, status, approval_status, priority, start_at, end_at, timezone, suppression_mode, suppression_duration_seconds, cta_type, cta_target, external_url, presentation_type"
    )
    .eq("id", campaignId)
    .maybeSingle();
  if (!row) return null;

  // PTR 캠페인은 변형별 ready 가 여러 개 — `*` 로 읽어 variant 컬럼 유무(마이그레이션 전후)와 무관하게 동작.
  const [{ data: surfaces }, { data: readyCreatives }] = await Promise.all([
    sb.from("platform_popup_campaign_surfaces").select("surface").eq("campaign_id", campaignId),
    sb
      .from("platform_popup_creatives")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("status", "ready"),
  ]);
  const readyRows = (readyCreatives ?? []) as Array<Record<string, unknown>>;
  const creative =
    readyRows.find((r) => normalizePtrBandVariant(r.variant as string | null) === "default") ?? null;
  const isPtr = isPlatformPopupPtrRevealPresentation(
    (row as { presentation_type?: string | null }).presentation_type
  );

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
    presentationType: (row as { presentation_type?: string | null }).presentation_type ?? null,
    ptrBandVariants: isPtr
      ? readyRows
          .filter((r) => r.creative_mode === "ptr_band")
          .map((r) => normalizePtrBandVariant(r.variant as string | null))
      : undefined,
    creative: creative
      ? {
          id: String((creative as { id: string }).id),
          status: String((creative as { status: string }).status),
          aspectW: Number((creative as { aspect_w: number }).aspect_w),
          aspectH: Number((creative as { aspect_h: number }).aspect_h),
          creativeMode: (creative as { creative_mode?: string | null }).creative_mode ?? null,
          assetPath: String((creative as { asset_path: string }).asset_path),
          assetUrl: (creative as { asset_url: string | null }).asset_url,
        }
      : null,
  };
}

export { validatePlatformPopupCampaignForApproval };

/**
 * 캠페인 복사 — 설정·대상 화면·ready 소재(같은 저장 파일 재사용)를 새 draft 로.
 * 승인·기간은 복사하지 않는다(새 캠페인은 다시 승인). 원본 소재 파일은 삭제 경로가 없어 공유해도 안전.
 */
export async function copyPlatformPopupAdminCampaign(
  sb: SupabaseClient,
  input: { campaignId: string; adminUserId: string; nameSuffix: string }
): Promise<{ ok: true; id: string } | { ok: false; error: string; httpStatus?: number }> {
  const sourceId = input.campaignId.trim();
  if (!sourceId) return { ok: false, error: "missing_id", httpStatus: 400 };

  const { data: src, error: srcErr } = await sb
    .from("platform_popup_campaigns")
    .select(
      "name, priority, timezone, suppression_mode, suppression_duration_seconds, cta_type, cta_target, external_url, cta_label, title, body, presentation_type, frequency_mode, owner_store_id"
    )
    .eq("id", sourceId)
    .maybeSingle();
  if (srcErr) return { ok: false, error: srcErr.message, httpStatus: 500 };
  if (!src) return { ok: false, error: "not_found", httpStatus: 404 };
  if ((src as { owner_store_id?: string | null }).owner_store_id) {
    // 오너 요청 캠페인은 오너 요청 흐름 소유 — 관리자 복사 대상 아님
    return { ok: false, error: "owner_campaign_copy_forbidden", httpStatus: 409 };
  }
  const s = src as Record<string, unknown>;
  // PTR: 노출 대상(허용 목록)도 복사 — 복사본이 공개(all)로 바뀌어 승인 시 의도치 않게 공개 노출되는 것 방지
  let audienceCopy: Record<string, unknown> | null = null;
  if (isPlatformPopupPtrRevealPresentation(s.presentation_type as string | null)) {
    const { data: aud, error: audErr } = await sb
      .from("platform_popup_campaigns")
      .select("audience_mode, audience_user_ids")
      .eq("id", sourceId)
      .maybeSingle();
    if (audErr) return { ok: false, error: audErr.message, httpStatus: 500 };
    const a = (aud ?? {}) as { audience_mode?: string | null; audience_user_ids?: string[] | null };
    audienceCopy = {
      audience_mode: normalizePtrRevealAudienceMode(a.audience_mode),
      audience_user_ids: Array.isArray(a.audience_user_ids) ? a.audience_user_ids : [],
    };
  }

  const { data: created, error: insErr } = await sb
    .from("platform_popup_campaigns")
    .insert({
      name: `${String(s.name ?? "").trim()}${input.nameSuffix}`.slice(0, 200),
      status: "draft",
      approval_status: "not_submitted",
      priority: s.priority ?? 0,
      timezone: s.timezone ?? PLATFORM_POPUP_DEFAULT_TIMEZONE,
      suppression_mode: s.suppression_mode ?? "SESSION",
      suppression_duration_seconds: s.suppression_duration_seconds ?? null,
      cta_type: s.cta_type,
      cta_target: s.cta_target,
      external_url: s.external_url ?? null,
      cta_label: s.cta_label ?? null,
      title: s.title ?? null,
      body: s.body ?? null,
      presentation_type: s.presentation_type,
      frequency_mode: s.frequency_mode ?? "once_per_session",
      created_by: input.adminUserId,
      ...(audienceCopy ?? {}),
    })
    .select("id")
    .maybeSingle();
  if (insErr) return { ok: false, error: insErr.message, httpStatus: 500 };
  if (!created?.id) return { ok: false, error: "create_failed", httpStatus: 500 };
  const newId = created.id as string;

  const [{ data: surfaces }, { data: creatives }] = await Promise.all([
    sb.from("platform_popup_campaign_surfaces").select("surface").eq("campaign_id", sourceId),
    sb.from("platform_popup_creatives").select("*").eq("campaign_id", sourceId).eq("status", "ready"),
  ]);
  if (surfaces?.length) {
    const { error } = await sb.from("platform_popup_campaign_surfaces").insert(
      surfaces.map((r) => ({ campaign_id: newId, surface: (r as { surface: string }).surface }))
    );
    if (error) return { ok: false, error: error.message, httpStatus: 500 };
  }
  if (creatives?.length) {
    const rows = (creatives as Array<Record<string, unknown>>).map((c) => {
      const row: Record<string, unknown> = {
        campaign_id: newId,
        asset_path: c.asset_path,
        asset_url: c.asset_url,
        aspect_w: c.aspect_w,
        aspect_h: c.aspect_h,
        creative_mode: c.creative_mode,
        alt_text: c.alt_text ?? null,
        status: "ready",
      };
      if (c.creative_mode === "ptr_band") row.variant = c.variant;
      return row;
    });
    const { error } = await sb.from("platform_popup_creatives").insert(rows);
    if (error) return { ok: false, error: error.message, httpStatus: 500 };
  }

  await appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: input.adminUserId,
    target_type: "platform_popup_campaign",
    target_id: newId,
    action: "platform_popup.copy",
    before_json: { sourceCampaignId: sourceId },
    after_json: { surfaces: surfaces?.length ?? 0, creatives: creatives?.length ?? 0 },
  });

  return { ok: true, id: newId };
}

/**
 * PTR 띠 소재 변형 삭제(ready → rejected, 저장 파일은 유지·감사 로그 기록).
 * 휴대폰 띠(default)는 필수 — 노출 중·예약 중에는 삭제 불가(교체만). 노출 중 변경은 재검토로 전환.
 */
export async function removePlatformPopupPtrBandVariant(
  sb: SupabaseClient,
  input: { campaignId: string; adminUserId: string; variant: string; reason?: string | null }
): Promise<{ ok: true; revertedToReview: boolean; removed: number } | { ok: false; error: string; httpStatus?: number }> {
  const campaignId = input.campaignId.trim();
  if (!campaignId) return { ok: false, error: "missing_id", httpStatus: 400 };
  const variant = String(input.variant ?? "").trim().toLowerCase();
  if (variant !== "default" && variant !== "tablet" && variant !== "logo") {
    return { ok: false, error: "variant_invalid", httpStatus: 400 };
  }

  const { data: campaign, error: cErr } = await sb
    .from("platform_popup_campaigns")
    .select("id, status, presentation_type")
    .eq("id", campaignId)
    .maybeSingle();
  if (cErr) return { ok: false, error: cErr.message, httpStatus: 500 };
  if (!campaign) return { ok: false, error: "not_found", httpStatus: 404 };
  if (!isPlatformPopupPtrRevealPresentation((campaign as { presentation_type?: string | null }).presentation_type)) {
    return { ok: false, error: "creative_mode_presentation_mismatch", httpStatus: 400 };
  }
  const status = String(campaign.status) as import("@/lib/platform-popup/types").PlatformPopupCampaignStatus;
  if (status === "ended") return { ok: false, error: "ended_immutable", httpStatus: 409 };
  const live = platformPopupMaterialEditRequiresReview(status);
  if (variant === "default" && live) {
    return { ok: false, error: "ptr_default_band_required_live", httpStatus: 409 };
  }

  const { data: removedRows, error: rmErr } = await sb
    .from("platform_popup_creatives")
    .update({ status: "rejected", updated_at: new Date().toISOString() })
    .eq("campaign_id", campaignId)
    .eq("status", "ready")
    .eq("variant", variant)
    .select("id");
  if (rmErr) return { ok: false, error: rmErr.message, httpStatus: 500 };
  const removed = (removedRows ?? []).length;
  if (removed === 0) return { ok: false, error: "creative_not_found", httpStatus: 404 };

  let revertedToReview = false;
  if (live) {
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
    await sb.from("platform_popup_campaigns").update({ updated_at: new Date().toISOString() }).eq("id", campaignId);
  }

  await appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: input.adminUserId,
    target_type: "platform_popup_campaign",
    target_id: campaignId,
    action: "platform_popup.creative_removed",
    before_json: null,
    after_json: { variant, removed, revertedToReview, ...(input.reason ? { reason: input.reason } : {}) },
  });

  return { ok: true, revertedToReview, removed };
}
