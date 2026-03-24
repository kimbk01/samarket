"use client";

import { getSupabaseClient } from "@/lib/supabase/client";

export interface ReportActionLogItem {
  id: string;
  actionType: string;
  actionNote: string | null;
  createdAt: string;
  adminNickname: string;
}

const ACTION_LABELS: Record<string, string> = {
  reject: "반려",
  warn: "경고",
  chat_ban: "채팅 제한",
  product_hide: "게시글 숨김",
  account_suspend: "계정 일시 정지",
  account_ban: "계정 영구 정지",
};

export function labelReportActionType(code: string): string {
  return ACTION_LABELS[code] ?? code;
}

export async function getReportActionsFromDb(reportId: string): Promise<ReportActionLogItem[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  try {
    const sb = supabase as any;
    const { data: rows, error } = await sb
      .from("report_actions")
      .select("id, action_type, action_note, created_by, created_at")
      .eq("report_id", reportId)
      .order("created_at", { ascending: false });

    if (error || !Array.isArray(rows) || rows.length === 0) return [];

    const adminIds = [...new Set(rows.map((r: { created_by: string }) => r.created_by).filter(Boolean))];
    const nicknameById: Record<string, string> = {};
    if (adminIds.length > 0) {
      const { data: users } = await sb.from("test_users").select("id, display_name, username").in("id", adminIds);
      if (Array.isArray(users)) {
        users.forEach((u: { id: string; display_name?: string; username?: string }) => {
          nicknameById[u.id] = (u.display_name ?? u.username ?? u.id).trim() || u.id;
        });
      }
    }

    return rows.map((r: { id: string; action_type: string; action_note: string | null; created_by: string; created_at: string }) => ({
      id: r.id,
      actionType: r.action_type,
      actionNote: r.action_note,
      createdAt: r.created_at,
      adminNickname: nicknameById[r.created_by] ?? r.created_by,
    }));
  } catch {
    return [];
  }
}
