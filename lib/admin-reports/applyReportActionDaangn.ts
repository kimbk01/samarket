"use client";

import { getSupabaseClient } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { ReportActionType } from "@/lib/types/daangn";

export type ApplyReportActionResult = { ok: true } | { ok: false; error: string };

const REPORT_STATUS_BY_ACTION: Record<ReportActionType, string> = {
  reject: "rejected",
  warn: "sanctioned",
  chat_ban: "sanctioned",
  product_hide: "sanctioned",
  account_suspend: "sanctioned",
  account_ban: "sanctioned",
};

/** report_actions → sanctions sanction_type 매핑 */
const SANCTION_TYPE_MAP: Partial<Record<ReportActionType, string>> = {
  warn: "warning",
  chat_ban: "chat_ban",
  account_suspend: "temp_suspend",
  account_ban: "permanent_ban",
};

/**
 * 당근형: 관리자 신고 처리 (제재 원장 = report_actions + reports 갱신 + sanctions)
 * - report_actions insert (원장에 기록)
 * - reports.status / resolved_at / resolved_by 갱신
 * - 제재 유형이면 sanctions insert
 */
export async function applyReportActionDaangn(
  reportId: string,
  actionType: ReportActionType,
  targetUserId: string,
  options?: { actionNote?: string | null }
): Promise<ApplyReportActionResult> {
  const user = getCurrentUser();
  if (!user?.id) return { ok: false, error: "로그인이 필요합니다." };

  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: "기능을 사용할 수 없습니다." };

  const sb = supabase as any;

  const { data: report } = await sb
    .from("reports")
    .select("id, status, target_type, target_id, product_id")
    .eq("id", reportId)
    .single();
  if (!report) return { ok: false, error: "해당 신고를 찾을 수 없습니다." };

  const needsSanctionUser = SANCTION_TYPE_MAP[actionType] != null;

  let sanctionUserId = targetUserId?.trim() ?? "";
  if (needsSanctionUser && !sanctionUserId && (report.target_type === "product" || report.target_type === "post")) {
    const pid = report.product_id ?? report.target_id;
    if (pid) {
      const { data: post } = await sb.from("posts").select("user_id").eq("id", pid).maybeSingle();
      sanctionUserId = (post?.user_id ?? "").trim() || "";
    }
  }
  if (needsSanctionUser && !sanctionUserId && report.target_type === "comment") {
    const { data: cRow } = await sb.from("comments").select("user_id").eq("id", report.target_id).maybeSingle();
    sanctionUserId = String(cRow?.user_id ?? "").trim() || "";
  }
  if (needsSanctionUser && !sanctionUserId) {
    return { ok: false, error: "제재 대상 회원을 확인할 수 없습니다. 게시글 작성자 정보를 확인해 주세요." };
  }

  const now = new Date().toISOString();
  const newStatus = REPORT_STATUS_BY_ACTION[actionType] ?? "resolved";

  const { error: actionErr } = await sb.from("report_actions").insert({
    report_id: reportId,
    action_type: actionType,
    action_note: options?.actionNote ?? null,
    created_by: user.id,
    created_at: now,
  });
  if (actionErr) return { ok: false, error: actionErr.message ?? "처리 기록에 실패했습니다." };

  await sb
    .from("reports")
    .update({
      status: newStatus,
      resolved_at: now,
      resolved_by: user.id,
    })
    .eq("id", reportId);

  const pid = report.product_id ?? report.target_id;
  if (actionType === "product_hide" && pid) {
    await sb.from("posts").update({ status: "hidden", updated_at: now }).eq("id", pid);
  }

  const sanctionType = SANCTION_TYPE_MAP[actionType];
  if (sanctionType) {
    const endAt =
      actionType === "account_suspend"
        ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        : actionType === "chat_ban"
          ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
          : null;
    await sb.from("sanctions").insert({
      user_id: sanctionUserId,
      sanction_type: sanctionType,
      start_at: now,
      end_at: endAt,
      reason: options?.actionNote ?? `신고 처리: ${actionType}`,
      created_by: user.id,
      created_at: now,
    });
  }

  return { ok: true };
}
