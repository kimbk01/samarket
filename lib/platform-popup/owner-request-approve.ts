/**
 * CUT 5 — Admin approve Owner request → platform_popup_campaign (idempotent).
 * One request → max one campaign. payment alone never activates.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import {
  adminApprovePlatformPopupCampaign,
  transitionPlatformPopupCampaign,
} from "@/lib/platform-popup/admin-transitions";
import {
  loadSnapshotForApproval,
  replacePlatformPopupReadyCreative,
  validatePlatformPopupCampaignForApproval,
} from "@/lib/platform-popup/admin-campaign-writer";
import {
  canAdminTransitionPlatformPopupRequest,
  nextPaymentAfterReject,
  nextStatusForAdminAction,
} from "@/lib/platform-popup/owner-request-lifecycle";
import {
  loadPlatformPopupOwnerRequest,
  PLATFORM_POPUP_OWNER_REQUEST_TABLE,
} from "@/lib/platform-popup/owner-request-loader";
import type {
  PlatformPopupOwnerRequestAdminAction,
  PlatformPopupOwnerRequestRow,
} from "@/lib/platform-popup/owner-request-types";
import { PLATFORM_POPUP_DEFAULT_TIMEZONE } from "@/lib/platform-popup/types";
import { refundBusinessCashForRejectedDeliveryAd } from "@/lib/stores/advertising/canonical-business-cash-writer";

export type AdminPlatformPopupRequestActionResult =
  | {
      ok: true;
      row: PlatformPopupOwnerRequestRow;
      campaignId?: string;
      idempotent?: boolean;
    }
  | { ok: false; error: string; httpStatus?: number; detail?: string };

async function createCampaignFromOwnerRequest(
  sb: SupabaseClient,
  input: {
    request: PlatformPopupOwnerRequestRow;
    adminUserId: string;
  }
): Promise<{ ok: true; campaignId: string } | { ok: false; error: string; httpStatus?: number }> {
  const req = input.request;
  const name = `Owner popup · ${req.storeId.slice(0, 8)}`;
  const surfaces =
    req.requestedSurfaces.length > 0 ? req.requestedSurfaces : (["GLOBAL"] as const);

  const { data, error } = await sb
    .from("platform_popup_campaigns")
    .insert({
      name,
      status: "pending_review",
      approval_status: "pending_review",
      owner_request_id: req.id,
      owner_store_id: req.storeId,
      priority: 0,
      start_at: req.requestedStartAt,
      end_at: req.requestedEndAt,
      timezone: req.timezone || PLATFORM_POPUP_DEFAULT_TIMEZONE,
      suppression_mode: req.suppressionMode,
      suppression_duration_seconds: req.suppressionDurationSeconds,
      cta_type: req.ctaType,
      cta_target: req.ctaTarget,
      external_url: req.externalUrl,
      created_by: input.adminUserId,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    // Unique one-campaign-per-request: race → load existing.
    if (/unique|duplicate|one_per_owner_request/i.test(error.message)) {
      const { data: existing } = await sb
        .from("platform_popup_campaigns")
        .select("id")
        .eq("owner_request_id", req.id)
        .maybeSingle();
      if (existing?.id) return { ok: true, campaignId: String(existing.id) };
    }
    return { ok: false, error: error.message, httpStatus: 500 };
  }
  if (!data?.id) return { ok: false, error: "campaign_create_failed", httpStatus: 500 };

  const campaignId = String(data.id);

  const { error: sErr } = await sb.from("platform_popup_campaign_surfaces").insert(
    surfaces.map((surface) => ({ campaign_id: campaignId, surface }))
  );
  if (sErr) return { ok: false, error: sErr.message, httpStatus: 500 };

  if (req.creativeAssetPath || req.creativeAssetUrl) {
    const creative = await replacePlatformPopupReadyCreative(sb, {
      campaignId,
      adminUserId: input.adminUserId,
      assetPath: req.creativeAssetPath || `owner-requests/${req.id}/creative`,
      assetUrl: req.creativeAssetUrl || "",
      altText: req.creativeAltText,
    });
    if (!creative.ok) {
      return { ok: false, error: creative.error, httpStatus: creative.httpStatus };
    }
  }

  return { ok: true, campaignId };
}

/**
 * Admin approve: convert request → campaign idempotently (one request max one campaign).
 * Double approve returns same campaignId. Optionally schedule/activate after approval.
 */
export async function adminApprovePlatformPopupOwnerRequest(
  sb: SupabaseClient,
  input: {
    requestId: string;
    adminUserId: string;
    activate?: boolean;
    schedule?: boolean;
  }
): Promise<AdminPlatformPopupRequestActionResult> {
  const request = await loadPlatformPopupOwnerRequest(sb, input.requestId);
  if (!request) return { ok: false, error: "not_found", httpStatus: 404 };

  // Idempotent: already linked.
  if (request.adminCampaignId) {
    if (request.requestStatus !== "approved") {
      await sb
        .from(PLATFORM_POPUP_OWNER_REQUEST_TABLE)
        .update({
          request_status: "approved",
          reviewed_at: request.reviewedAt ?? new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", request.id);
    }
    // Optionally push schedule/active on existing campaign (admin only).
    if (input.activate || input.schedule) {
      await adminApprovePlatformPopupCampaign(sb, {
        campaignId: request.adminCampaignId,
        adminUserId: input.adminUserId,
        activate: input.activate,
        schedule: input.schedule,
      });
    }
    const refreshed = await loadPlatformPopupOwnerRequest(sb, request.id);
    return {
      ok: true,
      row: refreshed ?? request,
      campaignId: request.adminCampaignId,
      idempotent: true,
    };
  }

  if (!canAdminTransitionPlatformPopupRequest(request.requestStatus, "approved")) {
    return { ok: false, error: "illegal_transition", httpStatus: 409 };
  }

  if (request.paymentStatus !== "funded") {
    return { ok: false, error: "payment_not_funded", httpStatus: 400 };
  }

  const created = await createCampaignFromOwnerRequest(sb, {
    request,
    adminUserId: input.adminUserId,
  });
  if (!created.ok) {
    return { ok: false, error: created.error, httpStatus: created.httpStatus };
  }

  const snap = await loadSnapshotForApproval(sb, created.campaignId);
  if (!snap) return { ok: false, error: "campaign_snapshot_missing", httpStatus: 500 };
  const gate = validatePlatformPopupCampaignForApproval({
    ...snap,
    status: input.activate ? "active" : input.schedule ? "scheduled" : "approved",
    approvalStatus: "approved",
  });
  if (!gate.ok) {
    return {
      ok: false,
      error: `approval_validation_failed:${gate.errors.join(",")}`,
      httpStatus: 400,
    };
  }

  const transitioned = await adminApprovePlatformPopupCampaign(sb, {
    campaignId: created.campaignId,
    adminUserId: input.adminUserId,
    activate: input.activate === true,
    schedule: input.schedule === true && input.activate !== true,
  });
  if (!transitioned.ok) {
    return {
      ok: false,
      error: transitioned.error,
      httpStatus: transitioned.httpStatus,
    };
  }

  const now = new Date().toISOString();
  const { error: linkErr } = await sb
    .from(PLATFORM_POPUP_OWNER_REQUEST_TABLE)
    .update({
      request_status: "approved",
      admin_campaign_id: created.campaignId,
      reviewed_at: now,
      revision_reason: null,
      rejection_reason: null,
      updated_at: now,
    })
    .eq("id", request.id)
    .is("admin_campaign_id", null);

  if (linkErr) {
    // Race: another approve linked first — return that campaign.
    const again = await loadPlatformPopupOwnerRequest(sb, request.id);
    if (again?.adminCampaignId) {
      return {
        ok: true,
        row: again,
        campaignId: again.adminCampaignId,
        idempotent: true,
      };
    }
    return { ok: false, error: linkErr.message, httpStatus: 500 };
  }

  const refreshed = await loadPlatformPopupOwnerRequest(sb, request.id);
  await appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: input.adminUserId,
    target_type: "platform_popup_owner_request",
    target_id: request.id,
    action: "platform_popup_owner_request.approve",
    before_json: { request_status: request.requestStatus },
    after_json: {
      request_status: "approved",
      campaign_id: created.campaignId,
      campaign_status: transitioned.status,
    },
  });

  return {
    ok: true,
    row: refreshed ?? { ...request, requestStatus: "approved", adminCampaignId: created.campaignId },
    campaignId: created.campaignId,
    idempotent: false,
  };
}

export async function adminActOnPlatformPopupOwnerRequest(
  sb: SupabaseClient,
  input: {
    requestId: string;
    adminUserId: string;
    action: PlatformPopupOwnerRequestAdminAction;
    reason?: string | null;
    activate?: boolean;
    schedule?: boolean;
  }
): Promise<AdminPlatformPopupRequestActionResult> {
  if (input.action === "approve") {
    return adminApprovePlatformPopupOwnerRequest(sb, {
      requestId: input.requestId,
      adminUserId: input.adminUserId,
      activate: input.activate,
      schedule: input.schedule,
    });
  }

  const request = await loadPlatformPopupOwnerRequest(sb, input.requestId);
  if (!request) return { ok: false, error: "not_found", httpStatus: 404 };

  const nextStatus = nextStatusForAdminAction(input.action);
  if (!canAdminTransitionPlatformPopupRequest(request.requestStatus, nextStatus)) {
    return { ok: false, error: "illegal_transition", httpStatus: 409 };
  }

  if (input.action === "reject") {
    let paymentStatus = request.paymentStatus;
    if (request.paymentStatus === "funded") {
      const refund = await refundBusinessCashForRejectedDeliveryAd(sb, {
        adminUserId: input.adminUserId,
        applicationId: request.id,
        productKind: "platform_popup",
      });
      if (!refund.ok) {
        return {
          ok: false,
          error: `refund_failed:${refund.error}`,
          detail: refund.detail,
          httpStatus: 400,
        };
      }
      paymentStatus = nextPaymentAfterReject(request.paymentStatus);
    }

    const now = new Date().toISOString();
    const { error } = await sb
      .from(PLATFORM_POPUP_OWNER_REQUEST_TABLE)
      .update({
        request_status: "rejected",
        payment_status: paymentStatus,
        rejection_reason: input.reason?.trim() || null,
        reviewed_at: now,
        updated_at: now,
      })
      .eq("id", request.id);
    if (error) return { ok: false, error: error.message, httpStatus: 500 };

    // If a campaign was somehow linked, reject it too (should be rare pre-approve).
    if (request.adminCampaignId) {
      await transitionPlatformPopupCampaign(sb, {
        campaignId: request.adminCampaignId,
        actorUserId: input.adminUserId,
        actorRole: "admin",
        nextStatus: "rejected",
        nextApproval: "rejected",
      });
    }

    const refreshed = await loadPlatformPopupOwnerRequest(sb, request.id);
    await appendAuditLog(sb, {
      actor_type: "admin",
      actor_id: input.adminUserId,
      target_type: "platform_popup_owner_request",
      target_id: request.id,
      action: "platform_popup_owner_request.reject",
      before_json: { request_status: request.requestStatus, payment_status: request.paymentStatus },
      after_json: {
        request_status: "rejected",
        payment_status: paymentStatus,
        reason: input.reason ?? null,
      },
    });
    return { ok: true, row: refreshed ?? request };
  }

  if (input.action === "revision_required") {
    // No refund — owner keeps funding and edits then resubmits.
    const now = new Date().toISOString();
    const { error } = await sb
      .from(PLATFORM_POPUP_OWNER_REQUEST_TABLE)
      .update({
        request_status: "revision_required",
        revision_reason: input.reason?.trim() || null,
        submit_idempotency_key: null,
        reviewed_at: now,
        updated_at: now,
      })
      .eq("id", request.id);
    if (error) return { ok: false, error: error.message, httpStatus: 500 };

    const refreshed = await loadPlatformPopupOwnerRequest(sb, request.id);
    await appendAuditLog(sb, {
      actor_type: "admin",
      actor_id: input.adminUserId,
      target_type: "platform_popup_owner_request",
      target_id: request.id,
      action: "platform_popup_owner_request.revision_required",
      before_json: { request_status: request.requestStatus },
      after_json: {
        request_status: "revision_required",
        reason: input.reason ?? null,
        payment_status: request.paymentStatus,
        refunded: false,
      },
    });
    return { ok: true, row: refreshed ?? request };
  }

  // start_review
  const now = new Date().toISOString();
  const { error } = await sb
    .from(PLATFORM_POPUP_OWNER_REQUEST_TABLE)
    .update({
      request_status: "under_review",
      reviewed_at: now,
      updated_at: now,
    })
    .eq("id", request.id);
  if (error) return { ok: false, error: error.message, httpStatus: 500 };

  const refreshed = await loadPlatformPopupOwnerRequest(sb, request.id);
  await appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: input.adminUserId,
    target_type: "platform_popup_owner_request",
    target_id: request.id,
    action: "platform_popup_owner_request.start_review",
    before_json: { request_status: request.requestStatus },
    after_json: { request_status: "under_review" },
  });
  return { ok: true, row: refreshed ?? request };
}
