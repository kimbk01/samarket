"use client";

import { getSupabaseClient } from "@/lib/supabase/client";

export interface AdminSanctionLedgerRow {
  action_id: string;
  report_id: string;
  action_type: string;
  action_note: string | null;
  admin_id: string;
  action_at: string;
  target_type: string;
  target_id: string;
  room_id: string | null;
  product_id: string | null;
  reporter_id: string;
  reason_code: string;
  reason_text: string | null;
  report_status: string;
  resolved_at: string | null;
  admin_note: string | null;
}

const ACTION_LABELS: Record<string, string> = {
  reject: "반려",
  warn: "경고",
  chat_ban: "채팅 제한",
  product_hide: "상품 숨김",
  account_suspend: "계정 정지",
  account_ban: "영구 정지",
};

/**
 * 관리자 제재 원장 조회 (view: admin_sanction_ledger 또는 report_actions + reports 조인)
 * Part 5 SQL 실행 후 사용. 뷰가 없으면 report_actions + reports 직접 조인으로 폴백.
 */
export async function getAdminSanctionLedgerFromDb(
  limit = 100
): Promise<AdminSanctionLedgerRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const sb = supabase as any;

  try {
    const { data, error } = await sb
      .from("admin_sanction_ledger")
      .select("*")
      .limit(limit)
      .order("action_at", { ascending: false });

    if (!error && data?.length) return data as AdminSanctionLedgerRow[];

    const { data: actions, error: actionsErr } = await sb
      .from("report_actions")
      .select("id, report_id, action_type, action_note, created_by, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (actionsErr || !actions?.length) return [];

    const reportIds = [...new Set((actions as any[]).map((a) => a.report_id))];
    const { data: reports } = await sb
      .from("reports")
      .select("id, target_type, target_id, room_id, product_id, reporter_id, reason_code, reason_text, status, resolved_at, admin_note")
      .in("id", reportIds);

    const reportMap = new Map((reports ?? []).map((r: any) => [r.id, r]));

    return (actions as any[]).map((a) => {
      const r = reportMap.get(a.report_id) as Record<string, unknown> | undefined;
      return {
        action_id: a.id,
        report_id: a.report_id,
        action_type: a.action_type,
        action_note: a.action_note,
        admin_id: a.created_by,
        action_at: a.created_at,
        target_type: typeof r?.target_type === "string" ? r.target_type : "",
        target_id: typeof r?.target_id === "string" ? r.target_id : "",
        room_id: typeof r?.room_id === "string" ? r.room_id : null,
        product_id: typeof r?.product_id === "string" ? r.product_id : null,
        reporter_id: typeof r?.reporter_id === "string" ? r.reporter_id : "",
        reason_code: typeof r?.reason_code === "string" ? r.reason_code : "",
        reason_text: typeof r?.reason_text === "string" ? r.reason_text : null,
        report_status: typeof r?.status === "string" ? r.status : "",
        resolved_at: typeof r?.resolved_at === "string" ? r.resolved_at : null,
        admin_note: typeof r?.admin_note === "string" ? r.admin_note : null,
      };
    }) as AdminSanctionLedgerRow[];
  } catch {
    return [];
  }
}

export function getActionTypeLabel(type: string): string {
  return ACTION_LABELS[type] ?? type;
}
