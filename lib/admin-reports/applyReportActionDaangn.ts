import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";
import { TRADE_REPORT_ADMIN_ACTIONABLE } from "@/lib/admin/admin-ops-actionable-status";
import type { ReportActionType } from "@/lib/types/daangn";
import {
  isChatReportTargetType,
  looksLikeProfileUserId,
  REPORT_STATUS_BY_ACTION,
  SANCTION_TYPE_MAP,
  TRADE_REPORT_ACCOUNT_ACTIONS_MCC_ONLY,
  TRADE_REPORT_CONTENT_ACTIONS,
  TRADE_REPORT_LEDGER_ACTIONS,
} from "@/lib/admin-reports/trade-report-action-policy";

export {
  looksLikeProfileUserId,
  TRADE_REPORT_ACCOUNT_ACTIONS_MCC_ONLY,
  TRADE_REPORT_CONTENT_ACTIONS,
  TRADE_REPORT_LEDGER_ACTIONS,
};

export type ApplyReportActionResult =
  | {
      ok: true;
      previousStatus: string;
      status: string;
      /** Follow-up writes that failed after the report left the queue (surfaced, never swallowed). */
      warnings: string[];
    }
  | { ok: false; error: string; httpStatus: number };

/**
 * Trade report writer (당근형) — SERVER ONLY.
 *
 * Authority: caller must pass `requireAdminPermission("reports")` (admin_memberships SSOT)
 * and a service-role client. The previous browser writer depended on legacy
 * `profiles.role` RLS and failed for every admin_memberships admin.
 *
 * - reject / product_hide: content authority
 * - warn / chat_ban: sanctions ledger only (non-enforcing), profile id required
 * - account_*: refused — use MCC moderation
 * - Concurrency: status CAS (pending|reviewing → terminal). A second admin gets 409.
 */
export async function applyReportActionDaangn(
  sb: SupabaseClient,
  input: {
    reportId: string;
    actionType: ReportActionType;
    targetUserId: string;
    actionNote?: string | null;
    adminUserId: string;
  }
): Promise<ApplyReportActionResult> {
  const { reportId, actionType, adminUserId } = input;
  const actionNote = input.actionNote ?? null;

  if (TRADE_REPORT_ACCOUNT_ACTIONS_MCC_ONLY.has(actionType)) {
    return {
      ok: false,
      httpStatus: 400,
      error:
        "계정 정지/차단은 MCC 회원 제재에서만 실행됩니다. 이 신고 writer는 계정을 제재하지 않습니다.",
    };
  }

  const { data: report, error: reportErr } = await sb
    .from("reports")
    .select("id, status, target_type, target_id, product_id")
    .eq("id", reportId)
    .maybeSingle();
  if (reportErr) return { ok: false, httpStatus: 500, error: reportErr.message };
  if (!report) return { ok: false, httpStatus: 404, error: "해당 신고를 찾을 수 없습니다." };

  const previousStatus = String(report.status ?? "");
  if (!(TRADE_REPORT_ADMIN_ACTIONABLE as readonly string[]).includes(previousStatus)) {
    return { ok: false, httpStatus: 409, error: "이미 처리된 신고입니다." };
  }

  const isChatTarget = isChatReportTargetType(report.target_type);
  const needsSanctionUser = SANCTION_TYPE_MAP[actionType] != null;

  let sanctionUserId = input.targetUserId?.trim() ?? "";
  if (needsSanctionUser && !sanctionUserId && (report.target_type === "product" || report.target_type === "post")) {
    const pid = report.product_id ?? report.target_id;
    if (pid) {
      const { data: post } = await sb.from(POSTS_TABLE_READ).select("user_id").eq("id", pid).maybeSingle();
      sanctionUserId = String(post?.user_id ?? "").trim();
    }
  }
  if (needsSanctionUser && !sanctionUserId && report.target_type === "comment") {
    const { data: cRow } = await sb.from("comments").select("user_id").eq("id", report.target_id).maybeSingle();
    sanctionUserId = String(cRow?.user_id ?? "").trim();
  }
  if (needsSanctionUser && !sanctionUserId) {
    return {
      ok: false,
      httpStatus: 400,
      error: "제재 대상 회원을 확인할 수 없습니다. 게시글 작성자 정보를 확인해 주세요.",
    };
  }

  if (needsSanctionUser) {
    if (isChatTarget) {
      return {
        ok: false,
        httpStatus: 400,
        error:
          "채팅 신고에는 회원 원장 제재를 넣을 수 없습니다. 메신저 도메인 신고/방 조치 또는 MCC를 사용하세요.",
      };
    }
    if (!looksLikeProfileUserId(sanctionUserId)) {
      return { ok: false, httpStatus: 400, error: "제재 대상이 유효한 회원 ID가 아닙니다." };
    }
    const { data: profile } = await sb.from("profiles").select("id").eq("id", sanctionUserId).maybeSingle();
    if (!profile?.id) {
      return { ok: false, httpStatus: 400, error: "제재 대상 회원 프로필을 찾을 수 없습니다." };
    }
  }

  const now = new Date().toISOString();
  const newStatus = REPORT_STATUS_BY_ACTION[actionType] ?? "resolved";

  // CAS: only one admin can move the report out of the actionable set.
  const { data: claimed, error: claimErr } = await sb
    .from("reports")
    .update({ status: newStatus, resolved_at: now, resolved_by: adminUserId })
    .eq("id", reportId)
    .in("status", [...TRADE_REPORT_ADMIN_ACTIONABLE])
    .select("id");
  if (claimErr) return { ok: false, httpStatus: 500, error: claimErr.message };
  if (!claimed || claimed.length === 0) {
    return { ok: false, httpStatus: 409, error: "이미 처리된 신고입니다." };
  }

  const { error: actionErr } = await sb.from("report_actions").insert({
    report_id: reportId,
    action_type: actionType,
    action_note: actionNote,
    created_by: adminUserId,
    created_at: now,
  });
  if (actionErr) {
    // Restore the queue state so the report is not closed without its action record.
    await sb
      .from("reports")
      .update({ status: previousStatus, resolved_at: null, resolved_by: null })
      .eq("id", reportId)
      .eq("status", newStatus);
    return { ok: false, httpStatus: 500, error: actionErr.message || "처리 기록에 실패했습니다." };
  }

  const warnings: string[] = [];

  const pid = report.product_id ?? report.target_id;
  if (actionType === "product_hide" && pid) {
    // Cut A / S3 — align with POST /api/admin/posts/[postId]/status hide (status + visibility).
    const hidePatch = { status: "hidden", visibility: "hidden", updated_at: now };
    let { error: hideErr } = await sb.from(POSTS_TABLE_WRITE).update(hidePatch).eq("id", pid);
    if (hideErr && /visibility|column/i.test(String(hideErr.message))) {
      hideErr = (
        await sb
          .from(POSTS_TABLE_WRITE)
          .update({ status: "hidden", updated_at: now })
          .eq("id", pid)
      ).error;
    }
    if (hideErr) warnings.push(`product_hide_failed: ${hideErr.message}`);
  }

  const sanctionType = SANCTION_TYPE_MAP[actionType];
  if (sanctionType) {
    const endAt =
      actionType === "chat_ban"
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        : null;
    const { error: sanctionErr } = await sb.from("sanctions").insert({
      user_id: sanctionUserId,
      sanction_type: sanctionType,
      start_at: now,
      end_at: endAt,
      reason: actionNote ?? `신고 처리(원장): ${actionType}`,
      created_by: adminUserId,
      created_at: now,
    });
    if (sanctionErr) warnings.push(`sanction_ledger_failed: ${sanctionErr.message}`);
  }

  return { ok: true, previousStatus, status: newStatus, warnings };
}
