/**
 * Admin Direct draft-only physical delete.
 * Never deletes live / scheduled / paused / ended campaigns.
 *
 * 보완 §4-3 (Owner 「설계안대로」 2026-11-04): 캠페인을 지우면 노출 기록·숨김이 연쇄로 지워지므로(ON DELETE CASCADE)
 * 삭제 전에 **서버가 노출 기록(`platform_popup_campaign_events`) 수를 센다**. 0 이 아니면 삭제 불가(`has_exposure_history`) —
 * 종료·보관만 한다. DB 원문 오류(`error.message`)는 응답에 싣지 않는다(서버 로그만).
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

type DeleteFailure = { ok: false; error: string; httpStatus?: number };

/** 노출 기록 수 — 조회 실패도 삭제 불가로 본다(fail-closed) */
async function countPlatformPopupCampaignEvents(
  sb: SupabaseClient,
  campaignId: string
): Promise<number | null> {
  const { count, error } = await sb
    .from("platform_popup_campaign_events")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);
  if (error) {
    console.error("[platform-popup/delete-draft] event_count_failed", error.message);
    return null;
  }
  return count ?? 0;
}

async function checkDeletableRow(
  sb: SupabaseClient,
  row: { id: string; status?: string | null; owner_store_id?: string | null; owner_request_id?: string | null }
): Promise<DeleteFailure | null> {
  if (!isPlatformPopupDeleteSafeDraftRow(row)) {
    const adminDirect = !row.owner_store_id && !row.owner_request_id;
    return { ok: false, error: adminDirect ? "not_draft" : "not_admin_direct", httpStatus: 400 };
  }
  const events = await countPlatformPopupCampaignEvents(sb, row.id);
  if (events == null) return { ok: false, error: "delete_check_failed", httpStatus: 500 };
  if (events > 0) return { ok: false, error: "has_exposure_history", httpStatus: 409 };
  return null;
}

export async function adminDeletePlatformPopupDraftCampaign(
  sb: SupabaseClient,
  input: { campaignId: string; adminUserId: string; reason?: string | null }
): Promise<{ ok: true; id: string } | DeleteFailure> {
  const campaignId = String(input.campaignId || "").trim();
  if (!campaignId) return { ok: false, error: "campaign_id_required", httpStatus: 400 };

  const { data: row, error } = await sb
    .from("platform_popup_campaigns")
    .select("id, status, approval_status, owner_store_id, owner_request_id")
    .eq("id", campaignId)
    .maybeSingle();

  if (error) {
    console.error("[platform-popup/delete-draft] load_failed", error.message);
    return { ok: false, error: "load_failed", httpStatus: 500 };
  }
  if (!row?.id) return { ok: false, error: "not_found", httpStatus: 404 };

  const blocked = await checkDeletableRow(sb, row as { id: string });
  if (blocked) return blocked;

  // Children (surfaces/creatives/events) use ON DELETE CASCADE; delete campaign SSOT row.
  const { error: delErr } = await sb.from("platform_popup_campaigns").delete().eq("id", campaignId);
  if (delErr) {
    console.error("[platform-popup/delete-draft] delete_failed", delErr.message);
    return { ok: false, error: "delete_failed", httpStatus: 500 };
  }

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
    after_json: input.reason ? { reason: input.reason } : null,
  });

  return { ok: true, id: campaignId };
}

/**
 * 일괄 삭제 (AL-20). 원자 처리(DB 함수 1개)는 이번 범위에 DB 변경이 없어 하지 않는다.
 * 1) 먼저 **모든 id 를 검사**한다(없음·초안 아님·노출 기록 있음 → 하나도 지우지 않음).
 * 2) 검사를 통과하면 **1건씩** 지운다. 중간에 실패하면 멈추지 않고 나머지를 계속 지운 뒤
 *    지운 id(`deletedIds`)와 실패 목록(`failed`)을 함께 돌려준다 — 일부만 지워진 것을 숨기지 않는다.
 */
export async function adminBulkDeletePlatformPopupDraftCampaigns(
  sb: SupabaseClient,
  input: { campaignIds: string[]; adminUserId: string; reason?: string | null }
): Promise<
  | { ok: true; deletedIds: string[] }
  | {
      ok: false;
      error: string;
      httpStatus?: number;
      rejectedId?: string;
      deletedIds?: string[];
      failed?: Array<{ id: string; error: string }>;
    }
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

  if (error) {
    console.error("[platform-popup/bulk-delete-draft] load_failed", error.message);
    return { ok: false, error: "load_failed", httpStatus: 500 };
  }

  const byId = new Map((rows ?? []).map((r) => [String(r.id), r]));
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      return { ok: false, error: "not_found", httpStatus: 404, rejectedId: id };
    }
    const blocked = await checkDeletableRow(sb, { ...row, id });
    if (blocked) return { ...blocked, rejectedId: id };
  }

  const deletedIds: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];
  for (const id of ids) {
    const del = await adminDeletePlatformPopupDraftCampaign(sb, {
      campaignId: id,
      adminUserId: input.adminUserId,
      reason: input.reason ?? null,
    });
    if (del.ok) deletedIds.push(del.id);
    else failed.push({ id, error: del.error });
  }

  if (failed.length) {
    return {
      ok: false,
      error: deletedIds.length ? "partial_delete_failed" : failed[0]!.error,
      httpStatus: 500,
      rejectedId: failed[0]!.id,
      deletedIds,
      failed,
    };
  }
  return { ok: true, deletedIds };
}
