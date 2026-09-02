/**
 * Platform Popup CUT 1 — Admin approval / lifecycle server writer.
 * Enforces: Owner cannot APPROVE/ACTIVE; payment cannot ACTIVE.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import {
  assertPlatformPopupActivationAllowed,
  canSetPlatformPopupApproval,
  canTransitionPlatformPopupStatus,
} from "@/lib/platform-popup/campaign-lifecycle";
import {
  loadSnapshotForApproval,
  validatePlatformPopupCampaignForApproval,
} from "@/lib/platform-popup/admin-campaign-writer";
import type {
  PlatformPopupActorRole,
  PlatformPopupApprovalStatus,
  PlatformPopupCampaignStatus,
} from "@/lib/platform-popup/types";

export type PlatformPopupAdminTransitionInput = {
  campaignId: string;
  actorUserId: string;
  actorRole: PlatformPopupActorRole;
  nextStatus?: PlatformPopupCampaignStatus;
  nextApproval?: PlatformPopupApprovalStatus;
};

export type PlatformPopupAdminTransitionResult =
  | { ok: true; status: PlatformPopupCampaignStatus; approvalStatus: PlatformPopupApprovalStatus }
  | { ok: false; error: string; httpStatus?: number };

type CampaignRow = {
  id: string;
  status: PlatformPopupCampaignStatus;
  approval_status: PlatformPopupApprovalStatus;
};

export async function transitionPlatformPopupCampaign(
  sb: SupabaseClient,
  input: PlatformPopupAdminTransitionInput
): Promise<PlatformPopupAdminTransitionResult> {
  const campaignId = input.campaignId.trim();
  if (!campaignId) return { ok: false, error: "missing_id", httpStatus: 400 };

  if (input.actorRole === "payment") {
    return { ok: false, error: "payment_cannot_activate", httpStatus: 403 };
  }

  const { data: row, error: fetchErr } = await sb
    .from("platform_popup_campaigns")
    .select("id, status, approval_status")
    .eq("id", campaignId)
    .maybeSingle();

  if (fetchErr) return { ok: false, error: fetchErr.message, httpStatus: 500 };
  if (!row) return { ok: false, error: "not_found", httpStatus: 404 };

  const current = row as CampaignRow;
  const nextStatus = input.nextStatus ?? current.status;
  const nextApproval = input.nextApproval ?? current.approval_status;

  if (input.nextStatus && input.nextStatus !== current.status) {
    if (!canTransitionPlatformPopupStatus(current.status, input.nextStatus, input.actorRole)) {
      return { ok: false, error: "status_transition_forbidden", httpStatus: 403 };
    }
  }

  if (input.nextApproval && input.nextApproval !== current.approval_status) {
    if (!canSetPlatformPopupApproval(current.approval_status, input.nextApproval, input.actorRole)) {
      return { ok: false, error: "approval_transition_forbidden", httpStatus: 403 };
    }
  }

  const activation = assertPlatformPopupActivationAllowed({
    actor: input.actorRole,
    nextStatus,
    nextApproval,
  });
  if (!activation.ok) {
    return { ok: false, error: activation.error, httpStatus: 403 };
  }

  // Only admin may write approval=approved and approved_by.
  if (nextApproval === "approved" && input.actorRole !== "admin") {
    return { ok: false, error: "owner_cannot_approve", httpStatus: 403 };
  }

  // CUT 4 — approve / schedule / active require complete campaign authority.
  if (
    nextApproval === "approved" ||
    nextStatus === "approved" ||
    nextStatus === "scheduled" ||
    nextStatus === "active"
  ) {
    const snap = await loadSnapshotForApproval(sb, campaignId);
    if (!snap) return { ok: false, error: "not_found", httpStatus: 404 };
    const gate = validatePlatformPopupCampaignForApproval({
      ...snap,
      status: nextStatus,
      approvalStatus: nextApproval,
    });
    if (!gate.ok) {
      return {
        ok: false,
        error: `approval_validation_failed:${gate.errors.join(",")}`,
        httpStatus: 400,
      };
    }
  }

  const patch: Record<string, unknown> = {
    status: nextStatus,
    approval_status: nextApproval,
    updated_at: new Date().toISOString(),
  };

  if (nextApproval === "approved" && current.approval_status !== "approved") {
    patch.approved_by = input.actorUserId;
    patch.approved_at = new Date().toISOString();
  }

  if (nextApproval === "rejected") {
    patch.approved_by = null;
    patch.approved_at = null;
  }

  const { data: updated, error: updErr } = await sb
    .from("platform_popup_campaigns")
    .update(patch)
    .eq("id", campaignId)
    .select("id, status, approval_status")
    .maybeSingle();

  if (updErr) return { ok: false, error: updErr.message, httpStatus: 500 };
  if (!updated) return { ok: false, error: "update_failed", httpStatus: 500 };

  await appendAuditLog(sb, {
    actor_type: input.actorRole === "admin" ? "admin" : "user",
    actor_id: input.actorUserId,
    target_type: "platform_popup_campaign",
    target_id: campaignId,
    action: "platform_popup.transition",
    before_json: {
      status: current.status,
      approval_status: current.approval_status,
    },
    after_json: {
      status: updated.status,
      approval_status: updated.approval_status,
      actor_role: input.actorRole,
    },
  });

  return {
    ok: true,
    status: updated.status as PlatformPopupCampaignStatus,
    approvalStatus: updated.approval_status as PlatformPopupApprovalStatus,
  };
}

/** Convenience: Admin approve + optionally move to scheduled/active. */
export async function adminApprovePlatformPopupCampaign(
  sb: SupabaseClient,
  input: {
    campaignId: string;
    adminUserId: string;
    activate?: boolean;
    schedule?: boolean;
  }
): Promise<PlatformPopupAdminTransitionResult> {
  const nextStatus: PlatformPopupCampaignStatus | undefined = input.activate
    ? "active"
    : input.schedule
      ? "scheduled"
      : "approved";

  return transitionPlatformPopupCampaign(sb, {
    campaignId: input.campaignId,
    actorUserId: input.adminUserId,
    actorRole: "admin",
    nextStatus,
    nextApproval: "approved",
  });
}
