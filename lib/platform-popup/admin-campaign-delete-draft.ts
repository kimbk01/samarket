/**
 * Admin Direct draft-only physical delete.
 * Never deletes live / scheduled / paused / ended campaigns.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAuditLog } from "@/lib/audit/append-audit-log";

const DELETABLE_STATUSES = new Set(["draft", "pending_review"]);

export function isPlatformPopupDeleteSafeDraftRow(row: {
  status?: string | null;
  owner_store_id?: string | null;
  owner_request_id?: string | null;
}): boolean {
  const adminDirect = !row.owner_store_id && !row.owner_request_id;
  if (!adminDirect) return false;
  const status = String(row.status || "").toLowerCase();
  return DELETABLE_STATUSES.has(status);
}

export async function adminDeletePlatformPopupDraftCampaign(
  sb: SupabaseClient,
  input: { campaignId: string; adminUserId: string }
): Promise<{ ok: true; id: string } | { ok: false; error: string; httpStatus?: number }> {
  const campaignId = String(input.campaignId || "").trim();
  if (!campaignId) return { ok: false, error: "campaign_id_required", httpStatus: 400 };

  const { data: row, error } = await sb
    .from("platform_popup_campaigns")
    .select("id, status, approval_status, owner_store_id, owner_request_id")
    .eq("id", campaignId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message, httpStatus: 500 };
  if (!row?.id) return { ok: false, error: "not_found", httpStatus: 404 };

  if (!isPlatformPopupDeleteSafeDraftRow(row)) {
    const adminDirect = !row.owner_store_id && !row.owner_request_id;
    if (!adminDirect) {
      return { ok: false, error: "not_admin_direct", httpStatus: 400 };
    }
    return { ok: false, error: "not_draft", httpStatus: 400 };
  }

  // Children (surfaces/creatives/events) use ON DELETE CASCADE; delete campaign SSOT row.
  const { error: delErr } = await sb.from("platform_popup_campaigns").delete().eq("id", campaignId);
  if (delErr) return { ok: false, error: delErr.message, httpStatus: 500 };

  await appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: input.adminUserId,
    target_type: "platform_popup_campaign",
    target_id: campaignId,
    action: "platform_popup.delete_draft",
    before_json: {
      status: row.status,
      approval_status: row.approval_status,
      admin_direct: true,
    },
    after_json: null,
  });

  return { ok: true, id: campaignId };
}

/**
 * Validate ALL ids first. If any is protected/unknown → delete NONE.
 */
export async function adminBulkDeletePlatformPopupDraftCampaigns(
  sb: SupabaseClient,
  input: { campaignIds: string[]; adminUserId: string }
): Promise<
  | { ok: true; deletedIds: string[] }
  | { ok: false; error: string; httpStatus?: number; rejectedId?: string }
> {
  const ids = [
    ...new Set((input.campaignIds || []).map((id) => String(id || "").trim()).filter(Boolean)),
  ];
  if (ids.length === 0) {
    return { ok: false, error: "campaign_ids_required", httpStatus: 400 };
  }

  const { data: rows, error } = await sb
    .from("platform_popup_campaigns")
    .select("id, status, approval_status, owner_store_id, owner_request_id")
    .in("id", ids);

  if (error) return { ok: false, error: error.message, httpStatus: 500 };

  const byId = new Map((rows ?? []).map((r) => [String(r.id), r]));
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      return { ok: false, error: "not_found", httpStatus: 404, rejectedId: id };
    }
    if (!isPlatformPopupDeleteSafeDraftRow(row)) {
      const adminDirect = !row.owner_store_id && !row.owner_request_id;
      return {
        ok: false,
        error: adminDirect ? "not_draft" : "not_admin_direct",
        httpStatus: 400,
        rejectedId: id,
      };
    }
  }

  const deletedIds: string[] = [];
  for (const id of ids) {
    const del = await adminDeletePlatformPopupDraftCampaign(sb, {
      campaignId: id,
      adminUserId: input.adminUserId,
    });
    if (!del.ok) {
      return {
        ok: false,
        error: del.error,
        httpStatus: del.httpStatus,
        rejectedId: id,
      };
    }
    deletedIds.push(del.id);
  }

  return { ok: true, deletedIds };
}
