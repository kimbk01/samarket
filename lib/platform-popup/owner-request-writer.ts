/**
 * CUT 5 — Owner request writer (draft / update / submit+debit / cancel).
 * Never writes campaign approval_status=approved or status active/scheduled.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import {
  isPlatformPopupCtaType,
  isPlatformPopupSuppressionMode,
  isPlatformPopupTargetSurface,
} from "@/lib/platform-popup/admin-campaign-authority";
import { validatePlatformPopupCta } from "@/lib/platform-popup/cta";
import {
  canOwnerTransitionPlatformPopupRequest,
  isOwnerEditablePlatformPopupRequest,
  isOwnerSubmitEligiblePlatformPopupRequest,
} from "@/lib/platform-popup/owner-request-lifecycle";
import {
  loadPlatformPopupOwnerRequest,
  mapPlatformPopupOwnerRequestRow,
  PLATFORM_POPUP_OWNER_REQUEST_TABLE,
  loadPlatformPopupAdPackage,
} from "@/lib/platform-popup/owner-request-loader";
import type { PlatformPopupOwnerRequestRow } from "@/lib/platform-popup/owner-request-types";
import { PLATFORM_POPUP_DEFAULT_TIMEZONE } from "@/lib/platform-popup/types";
import type { PlatformPopupTargetSurface } from "@/lib/platform-popup/types";
import { debitBusinessCashForDeliveryAd } from "@/lib/stores/advertising/canonical-business-cash-writer";
import type { InsufficientBusinessCashPayload } from "@/lib/stores/advertising/canonical-business-cash-contract";
import { assertOwnerStoreEligibleForAds } from "@/lib/stores/advertising/owner-store-sponsored-writer";

export type OwnerPlatformPopupWriterError =
  | "store_not_eligible"
  | "forbidden"
  | "not_found"
  | "not_editable"
  | "illegal_transition"
  | "package_required"
  | "package_inactive"
  | "creative_required"
  | "surface_required"
  | "surface_invalid"
  | "schedule_invalid"
  | "cta_invalid"
  | "suppression_invalid"
  | "idempotency_key_required"
  | "duplicate_submit"
  | "INSUFFICIENT_BUSINESS_CASH"
  | "bc_debit_failed"
  | "db_error";

export type OwnerPlatformPopupWriterResult =
  | { ok: true; row: PlatformPopupOwnerRequestRow; idempotent?: boolean }
  | {
      ok: false;
      error: OwnerPlatformPopupWriterError;
      detail?: string;
      insufficient?: InsufficientBusinessCashPayload;
      httpStatus?: number;
    };

export type OwnerPlatformPopupDraftPatch = {
  packageId?: string | null;
  surfaces?: string[];
  startAt?: string | null;
  endAt?: string | null;
  timezone?: string;
  ctaType?: string;
  ctaTarget?: string;
  externalUrl?: string | null;
  suppressionMode?: string;
  suppressionDurationSeconds?: number | null;
  creativeAssetPath?: string | null;
  creativeAssetUrl?: string | null;
  creativeAltText?: string | null;
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
  return out;
}

async function assertOwnership(
  sb: SupabaseClient,
  requestId: string,
  ownerUserId: string
): Promise<
  | { ok: true; row: PlatformPopupOwnerRequestRow }
  | { ok: false; error: OwnerPlatformPopupWriterError; httpStatus?: number }
> {
  const row = await loadPlatformPopupOwnerRequest(sb, requestId);
  if (!row) return { ok: false, error: "not_found", httpStatus: 404 };
  if (row.ownerUserId !== ownerUserId) return { ok: false, error: "forbidden", httpStatus: 403 };
  return { ok: true, row };
}

export async function createPlatformPopupOwnerDraft(
  sb: SupabaseClient,
  input: { ownerUserId: string; storeId: string }
): Promise<OwnerPlatformPopupWriterResult> {
  const storeId = input.storeId.trim();
  if (!storeId) return { ok: false, error: "forbidden", httpStatus: 400 };

  const eligible = await assertOwnerStoreEligibleForAds(sb, storeId);
  if (!eligible.ok) return { ok: false, error: "store_not_eligible", httpStatus: 403 };

  const { data: store, error: storeErr } = await sb
    .from("stores")
    .select("id, owner_user_id")
    .eq("id", storeId)
    .maybeSingle();
  if (storeErr || !store) return { ok: false, error: "forbidden", httpStatus: 403 };
  if (String((store as { owner_user_id?: string }).owner_user_id ?? "") !== input.ownerUserId) {
    return { ok: false, error: "forbidden", httpStatus: 403 };
  }

  const now = new Date().toISOString();
  const { data, error } = await sb
    .from(PLATFORM_POPUP_OWNER_REQUEST_TABLE)
    .insert({
      owner_user_id: input.ownerUserId,
      store_id: storeId,
      request_status: "draft",
      payment_status: "unfunded",
      requested_surfaces: ["GLOBAL"],
      timezone: PLATFORM_POPUP_DEFAULT_TIMEZONE,
      cta_type: "store",
      cta_target: storeId,
      suppression_mode: "TODAY",
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: "db_error", detail: error?.message, httpStatus: 500 };
  }
  const row = mapPlatformPopupOwnerRequestRow(data as Record<string, unknown>);
  if (!row) return { ok: false, error: "db_error", httpStatus: 500 };

  await appendAuditLog(sb, {
    actor_type: "user",
    actor_id: input.ownerUserId,
    target_type: "platform_popup_owner_request",
    target_id: row.id,
    action: "platform_popup_owner_request.create_draft",
    before_json: null,
    after_json: { storeId },
  });

  return { ok: true, row };
}

export async function updatePlatformPopupOwnerDraft(
  sb: SupabaseClient,
  input: {
    requestId: string;
    ownerUserId: string;
    patch: OwnerPlatformPopupDraftPatch;
  }
): Promise<OwnerPlatformPopupWriterResult> {
  const owned = await assertOwnership(sb, input.requestId, input.ownerUserId);
  if (!owned.ok) return owned;
  if (!isOwnerEditablePlatformPopupRequest(owned.row.requestStatus)) {
    return { ok: false, error: "not_editable", httpStatus: 409 };
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if ("packageId" in input.patch) {
    const packageId = input.patch.packageId?.trim() || null;
    if (packageId) {
      const pkg = await loadPlatformPopupAdPackage(sb, packageId);
      if (!pkg || !pkg.isActive) {
        return { ok: false, error: "package_inactive", httpStatus: 400 };
      }
      patch.package_id = pkg.id;
      patch.price_minor = pkg.priceMinor;
    } else {
      patch.package_id = null;
      patch.price_minor = null;
    }
  }

  if (input.patch.surfaces) {
    const surfaces = normalizeSurfaces(input.patch.surfaces);
    if ("error" in surfaces) return { ok: false, error: "surface_invalid", httpStatus: 400 };
    if (!surfaces.length) return { ok: false, error: "surface_required", httpStatus: 400 };
    patch.requested_surfaces = surfaces;
  }

  if ("startAt" in input.patch) patch.requested_start_at = input.patch.startAt || null;
  if ("endAt" in input.patch) patch.requested_end_at = input.patch.endAt || null;
  if (input.patch.timezone != null) {
    const tz = input.patch.timezone.trim();
    if (!tz) return { ok: false, error: "schedule_invalid", httpStatus: 400 };
    patch.timezone = tz;
  }

  const startAt =
    "requested_start_at" in patch
      ? (patch.requested_start_at as string | null)
      : owned.row.requestedStartAt;
  const endAt =
    "requested_end_at" in patch
      ? (patch.requested_end_at as string | null)
      : owned.row.requestedEndAt;
  if (startAt && endAt) {
    const a = new Date(startAt).getTime();
    const b = new Date(endAt).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) {
      return { ok: false, error: "schedule_invalid", httpStatus: 400 };
    }
  }

  if (
    input.patch.ctaType != null ||
    input.patch.ctaTarget != null ||
    "externalUrl" in input.patch
  ) {
    const ctaType = String(input.patch.ctaType ?? owned.row.ctaType).trim().toLowerCase();
    if (!isPlatformPopupCtaType(ctaType)) {
      return { ok: false, error: "cta_invalid", httpStatus: 400 };
    }
    const ctaTarget =
      input.patch.ctaTarget != null
        ? String(input.patch.ctaTarget).trim()
        : owned.row.ctaTarget;
    const externalUrl =
      "externalUrl" in input.patch
        ? input.patch.externalUrl?.trim() || null
        : owned.row.externalUrl;
    const cta = validatePlatformPopupCta({ ctaType, ctaTarget, externalUrl });
    if (!cta.ok) return { ok: false, error: "cta_invalid", detail: cta.error, httpStatus: 400 };
    patch.cta_type = cta.value.ctaType;
    patch.cta_target = cta.value.ctaTarget;
    patch.external_url = cta.value.externalUrl;
  }

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
      return { ok: false, error: "suppression_invalid", httpStatus: 400 };
    }
    patch.suppression_duration_seconds = d ?? null;
  }

  const nextMode = String(patch.suppression_mode ?? owned.row.suppressionMode).toUpperCase();
  const nextDuration =
    "suppression_duration_seconds" in patch
      ? (patch.suppression_duration_seconds as number | null)
      : owned.row.suppressionDurationSeconds;
  if (nextMode === "DURATION" && !(nextDuration != null && nextDuration > 0)) {
    return { ok: false, error: "suppression_invalid", httpStatus: 400 };
  }

  if ("creativeAssetPath" in input.patch) {
    patch.creative_asset_path = input.patch.creativeAssetPath?.trim() || null;
  }
  if ("creativeAssetUrl" in input.patch) {
    patch.creative_asset_url = input.patch.creativeAssetUrl?.trim() || null;
  }
  if ("creativeAltText" in input.patch) {
    patch.creative_alt_text = input.patch.creativeAltText?.trim() || null;
  }

  const { error } = await sb
    .from(PLATFORM_POPUP_OWNER_REQUEST_TABLE)
    .update(patch)
    .eq("id", owned.row.id)
    .eq("owner_user_id", input.ownerUserId);
  if (error) return { ok: false, error: "db_error", detail: error.message, httpStatus: 500 };

  const refreshed = await loadPlatformPopupOwnerRequest(sb, owned.row.id);
  if (!refreshed) return { ok: false, error: "db_error", httpStatus: 500 };

  await appendAuditLog(sb, {
    actor_type: "user",
    actor_id: input.ownerUserId,
    target_type: "platform_popup_owner_request",
    target_id: owned.row.id,
    action: "platform_popup_owner_request.update_draft",
    before_json: { status: owned.row.requestStatus },
    after_json: { patch },
  });

  return { ok: true, row: refreshed };
}

/**
 * Submit (or revision resubmit): debit BC platform_popup → submitted + funded.
 * Does NOT activate any campaign.
 */
export async function submitPlatformPopupOwnerRequest(
  sb: SupabaseClient,
  input: {
    requestId: string;
    ownerUserId: string;
    idempotencyKey: string;
  }
): Promise<OwnerPlatformPopupWriterResult> {
  const key = input.idempotencyKey.trim();
  if (!key) return { ok: false, error: "idempotency_key_required", httpStatus: 400 };

  const owned = await assertOwnership(sb, input.requestId, input.ownerUserId);
  if (!owned.ok) return owned;

  // Idempotent replay: same key already submitted.
  if (
    owned.row.submitIdempotencyKey === key &&
    (owned.row.requestStatus === "submitted" ||
      owned.row.requestStatus === "under_review" ||
      owned.row.requestStatus === "approved")
  ) {
    return { ok: true, row: owned.row, idempotent: true };
  }

  if (!isOwnerSubmitEligiblePlatformPopupRequest(owned.row.requestStatus)) {
    return { ok: false, error: "illegal_transition", httpStatus: 409 };
  }
  if (!canOwnerTransitionPlatformPopupRequest(owned.row.requestStatus, "submitted")) {
    return { ok: false, error: "illegal_transition", httpStatus: 409 };
  }

  if (!owned.row.packageId || !(owned.row.priceMinor != null && owned.row.priceMinor > 0)) {
    return { ok: false, error: "package_required", httpStatus: 400 };
  }
  if (!owned.row.requestedSurfaces.length) {
    return { ok: false, error: "surface_required", httpStatus: 400 };
  }
  if (!owned.row.creativeAssetPath && !owned.row.creativeAssetUrl) {
    return { ok: false, error: "creative_required", httpStatus: 400 };
  }
  if (owned.row.requestedStartAt && owned.row.requestedEndAt) {
    const a = new Date(owned.row.requestedStartAt).getTime();
    const b = new Date(owned.row.requestedEndAt).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) {
      return { ok: false, error: "schedule_invalid", httpStatus: 400 };
    }
  }
  const cta = validatePlatformPopupCta({
    ctaType: owned.row.ctaType,
    ctaTarget: owned.row.ctaTarget,
    externalUrl: owned.row.externalUrl,
  });
  if (!cta.ok) return { ok: false, error: "cta_invalid", detail: cta.error, httpStatus: 400 };

  // Bind idempotency key before debit (unique constraint catches races).
  const { error: keyErr } = await sb
    .from(PLATFORM_POPUP_OWNER_REQUEST_TABLE)
    .update({
      submit_idempotency_key: key,
      updated_at: new Date().toISOString(),
    })
    .eq("id", owned.row.id)
    .eq("owner_user_id", input.ownerUserId)
    .in("request_status", ["draft", "revision_required"]);
  if (keyErr) {
    if (/unique|duplicate/i.test(keyErr.message)) {
      return { ok: false, error: "duplicate_submit", httpStatus: 409 };
    }
    return { ok: false, error: "db_error", detail: keyErr.message, httpStatus: 500 };
  }

  const secured = await debitBusinessCashForDeliveryAd(sb, {
    ownerUserId: input.ownerUserId,
    storeId: owned.row.storeId,
    applicationId: owned.row.id,
    productKind: "platform_popup",
    amountMinor: owned.row.priceMinor,
  });

  if (!secured.ok) {
    // Clear key so owner can retry with same/different key after funding.
    await sb
      .from(PLATFORM_POPUP_OWNER_REQUEST_TABLE)
      .update({
        submit_idempotency_key: null,
        payment_status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", owned.row.id)
      .eq("owner_user_id", input.ownerUserId);

    if (secured.error === "INSUFFICIENT_BUSINESS_CASH" && secured.insufficient) {
      return {
        ok: false,
        error: "INSUFFICIENT_BUSINESS_CASH",
        insufficient: secured.insufficient,
        httpStatus: 402,
      };
    }
    return {
      ok: false,
      error: "bc_debit_failed",
      detail: secured.detail ?? secured.error,
      httpStatus: 400,
    };
  }

  const now = new Date().toISOString();
  const { error: updErr } = await sb
    .from(PLATFORM_POPUP_OWNER_REQUEST_TABLE)
    .update({
      request_status: "submitted",
      payment_status: "funded",
      submitted_at: owned.row.submittedAt ?? now,
      revision_reason: null,
      updated_at: now,
    })
    .eq("id", owned.row.id)
    .eq("owner_user_id", input.ownerUserId);

  if (updErr) {
    return { ok: false, error: "db_error", detail: updErr.message, httpStatus: 500 };
  }

  const refreshed = await loadPlatformPopupOwnerRequest(sb, owned.row.id);
  if (!refreshed) return { ok: false, error: "db_error", httpStatus: 500 };

  await appendAuditLog(sb, {
    actor_type: "user",
    actor_id: input.ownerUserId,
    target_type: "platform_popup_owner_request",
    target_id: owned.row.id,
    action: "platform_popup_owner_request.submit",
    before_json: {
      request_status: owned.row.requestStatus,
      payment_status: owned.row.paymentStatus,
    },
    after_json: {
      request_status: "submitted",
      payment_status: "funded",
      funding_id: secured.fundingId,
      amount_minor: secured.amountMinor,
      // Explicit: payment alone never activates a campaign.
      campaign_activated: false,
    },
  });

  return { ok: true, row: refreshed, idempotent: secured.idempotent };
}

export async function cancelPlatformPopupOwnerRequest(
  sb: SupabaseClient,
  input: { requestId: string; ownerUserId: string }
): Promise<OwnerPlatformPopupWriterResult> {
  const owned = await assertOwnership(sb, input.requestId, input.ownerUserId);
  if (!owned.ok) return owned;
  if (!canOwnerTransitionPlatformPopupRequest(owned.row.requestStatus, "cancelled")) {
    return { ok: false, error: "illegal_transition", httpStatus: 409 };
  }

  const { error } = await sb
    .from(PLATFORM_POPUP_OWNER_REQUEST_TABLE)
    .update({
      request_status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", owned.row.id)
    .eq("owner_user_id", input.ownerUserId);
  if (error) return { ok: false, error: "db_error", detail: error.message, httpStatus: 500 };

  const refreshed = await loadPlatformPopupOwnerRequest(sb, owned.row.id);
  if (!refreshed) return { ok: false, error: "db_error", httpStatus: 500 };

  await appendAuditLog(sb, {
    actor_type: "user",
    actor_id: input.ownerUserId,
    target_type: "platform_popup_owner_request",
    target_id: owned.row.id,
    action: "platform_popup_owner_request.cancel",
    before_json: { request_status: owned.row.requestStatus },
    after_json: { request_status: "cancelled" },
  });

  return { ok: true, row: refreshed };
}
