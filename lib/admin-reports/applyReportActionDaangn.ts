"use client";

import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

import { getSupabaseClient } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { ReportActionType } from "@/lib/types/daangn";

export type ApplyReportActionResult = { ok: true } | { ok: false; error: string };

/** Trade report content actions — mutate reports / posts only. */
export const TRADE_REPORT_CONTENT_ACTIONS: ReadonlySet<ReportActionType> = new Set([
  "reject",
  "product_hide",
]);

/**
 * Account-enforcing actions — MCC only (`/api/admin/users/[id]/moderation`).
 * Must NOT write `sanctions` or masquerade as profile ban.
 */
export const TRADE_REPORT_ACCOUNT_ACTIONS_MCC_ONLY: ReadonlySet<ReportActionType> = new Set([
  "account_suspend",
  "account_ban",
]);

/** Non-enforcing ledger notes (warn/chat_ban) — require a real profiles.id. */
export const TRADE_REPORT_LEDGER_ACTIONS: ReadonlySet<ReportActionType> = new Set([
  "warn",
  "chat_ban",
]);

const REPORT_STATUS_BY_ACTION: Record<ReportActionType, string> = {
  reject: "rejected",
  warn: "sanctioned",
  chat_ban: "sanctioned",
  product_hide: "sanctioned",
  account_suspend: "sanctioned",
  account_ban: "sanctioned",
};

/** report_actions → sanctions sanction_type 매핑 (ledger-only; not MCC enforcement) */
const SANCTION_TYPE_MAP: Partial<Record<ReportActionType, string>> = {
  warn: "warning",
  chat_ban: "chat_ban",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function looksLikeProfileUserId(value: unknown): boolean {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

/**
 * Trade report writer (당근형).
 * - reject / product_hide: content authority
 * - warn / chat_ban: sanctions ledger only (non-enforcing), profile id required
 * - account_*: refused — use MCC moderation
 */
export async function applyReportActionDaangn(
  reportId: string,
  actionType: ReportActionType,
  targetUserId: string,
  options?: { actionNote?: string | null }
): Promise<ApplyReportActionResult> {
  const user = getCurrentUser();
  if (!user?.id) return { ok: false, error: "로그인이 필요합니다." };

  if (TRADE_REPORT_ACCOUNT_ACTIONS_MCC_ONLY.has(actionType)) {
    return {
      ok: false,
      error:
        "계정 정지/차단은 MCC 회원 제재에서만 실행됩니다. 이 신고 writer는 계정을 제재하지 않습니다.",
    };
  }

  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: "기능을 사용할 수 없습니다." };

  const sb = supabase as any;

  const { data: report } = await sb
    .from("reports")
    .select("id, status, target_type, target_id, product_id")
    .eq("id", reportId)
    .single();
  if (!report) return { ok: false, error: "해당 신고를 찾을 수 없습니다." };

  const ttRaw = String(report.target_type ?? "").toLowerCase();
  const isChatTarget = ttRaw === "chat" || ttRaw === "chat_room" || ttRaw === "chat_message";

  const needsSanctionUser = SANCTION_TYPE_MAP[actionType] != null;

  let sanctionUserId = targetUserId?.trim() ?? "";
  if (needsSanctionUser && !sanctionUserId && (report.target_type === "product" || report.target_type === "post")) {
    const pid = report.product_id ?? report.target_id;
    if (pid) {
      const { data: post } = await sb.from(POSTS_TABLE_READ).select("user_id").eq("id", pid).maybeSingle();
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

  if (needsSanctionUser) {
    if (isChatTarget) {
      return {
        ok: false,
        error:
          "채팅 신고에는 회원 원장 제재를 넣을 수 없습니다. 메신저 도메인 신고/방 조치 또는 MCC를 사용하세요.",
      };
    }
    if (!looksLikeProfileUserId(sanctionUserId)) {
      return { ok: false, error: "제재 대상이 유효한 회원 ID가 아닙니다." };
    }
    const { data: profile } = await sb.from("profiles").select("id").eq("id", sanctionUserId).maybeSingle();
    if (!profile?.id) {
      return { ok: false, error: "제재 대상 회원 프로필을 찾을 수 없습니다." };
    }
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
    void hideErr;
  }

  const sanctionType = SANCTION_TYPE_MAP[actionType];
  if (sanctionType) {
    const endAt =
      actionType === "chat_ban"
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        : null;
    await sb.from("sanctions").insert({
      user_id: sanctionUserId,
      sanction_type: sanctionType,
      start_at: now,
      end_at: endAt,
      reason: options?.actionNote ?? `신고 처리(원장): ${actionType}`,
      created_by: user.id,
      created_at: now,
    });
  }

  return { ok: true };
}
