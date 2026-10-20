"use client";

/** 신고 처리 기록 — 서버 API(권한 키 `reports`) 호출 (거래 Admin 설계 v2 D-42 · D-43) */
export interface ReportActionLogItem {
  id: string;
  actionType: string;
  actionNote: string | null;
  createdAt: string;
  adminNickname: string;
}

export async function getReportActionsFromDb(reportId: string): Promise<ReportActionLogItem[]> {
  try {
    const res = await fetch(`/api/admin/reports/${encodeURIComponent(reportId)}`, {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; actions?: ReportActionLogItem[] };
    return res.ok && Array.isArray(json.actions) ? json.actions : [];
  } catch {
    return [];
  }
}
