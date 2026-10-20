/**
 * 모임 신고 목록 로더 (서버 전용) — `/admin/philife/meeting-reports` 화면과 통합 대시보드 「모임 신고 대기」가
 * 같은 탭 필터(`applyMeetingReportTabFilter`)를 쓴다. 서버 페이지네이션 + 탭 건수, 읽기 전용(service-role).
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { formatAdminMemberLabel, loadAdminMemberIdentityMap } from "@/lib/admin-community/member-identity";
import {
  applyMeetingReportTabFilter,
  MEETING_REPORT_TAB_KEYS,
  type MeetingReportTabKey,
} from "@/lib/admin/metrics/admin-metric-filters";
import type {
  MeetingReportAdminRow,
  MeetingReportListResult,
  MeetingReportStatus,
  MeetingReportTab,
} from "@/components/admin/community/reports/meeting-report-contract";

export const ADMIN_MEETING_REPORTS_PAGE_SIZE = 50;

const SELECT =
  "id, meeting_id, target_type, target_id, reporter_user_id, reason_type, reason_detail, status, action_result, reviewed_by, reviewed_at, created_at";

export type AdminMeetingReportFilter = {
  type: string;
  fromIso: string | null;
  toIso: string | null;
  meetingIds: string[] | null;
  reporterIds: string[] | null;
};

/** 모임 신고 목록 — 서버 페이지네이션 + 탭 건수. `sb` 생략 = 서버 service-role 클라이언트. */
export async function loadAdminMeetingReports(
  tab: MeetingReportTabKey,
  f: AdminMeetingReportFilter,
  page: number,
  client?: SupabaseClient
): Promise<MeetingReportListResult> {
  const fail: MeetingReportListResult = { ok: false, rows: [], total: 0, counts: null };
  let sb: SupabaseClient;
  try {
    sb = client ?? (getSupabaseServer() as unknown as SupabaseClient);
  } catch {
    return fail;
  }
  const build = (cols: string, opts?: { count: "exact"; head?: boolean }) => {
    let q = sb.from("meeting_reports").select(cols, opts);
    if (f.type) q = q.eq("target_type", f.type);
    if (f.fromIso) q = q.gte("created_at", f.fromIso);
    if (f.toIso) q = q.lt("created_at", f.toIso);
    const ors: string[] = [];
    if (f.meetingIds?.length) ors.push(`meeting_id.in.(${f.meetingIds.join(",")})`);
    if (f.reporterIds?.length) ors.push(`reporter_user_id.in.(${f.reporterIds.join(",")})`);
    if (ors.length) q = q.or(ors.join(","));
    return q;
  };

  const countFor = async (t: MeetingReportTabKey) => {
    const { count, error } = await applyMeetingReportTabFilter(build("id", { count: "exact", head: true }), t);
    return error ? null : count ?? 0;
  };

  const [list, ...countVals] = await Promise.all([
    applyMeetingReportTabFilter(build(SELECT, { count: "exact" }), tab)
      .order("created_at", { ascending: false })
      .range((page - 1) * ADMIN_MEETING_REPORTS_PAGE_SIZE, page * ADMIN_MEETING_REPORTS_PAGE_SIZE - 1),
    ...MEETING_REPORT_TAB_KEYS.map((t) => countFor(t)),
  ]);
  if (list.error) return fail;
  const counts = countVals.every((c) => c !== null)
    ? (Object.fromEntries(MEETING_REPORT_TAB_KEYS.map((t, i) => [t, countVals[i] as number])) as Record<MeetingReportTab, number>)
    : null;

  const raw = (list.data ?? []) as unknown as Record<string, unknown>[];
  const meetingIds = [...new Set(raw.map((r) => (r.meeting_id ? String(r.meeting_id) : "")).filter(Boolean))];
  const titles = new Map<string, string>();
  if (meetingIds.length) {
    const { data: meetings } = await sb.from("meetings").select("id, title").in("id", meetingIds);
    for (const m of (meetings ?? []) as Array<{ id?: string; title?: string | null }>) {
      if (m.id && m.title) titles.set(m.id, m.title);
    }
  }
  const userIds = raw.flatMap((r) => [
    String(r.reporter_user_id ?? ""),
    String(r.reviewed_by ?? ""),
    r.target_type === "member" ? String(r.target_id ?? "") : "",
  ]);
  const ids = await loadAdminMemberIdentityMap(sb, userIds.filter(Boolean));
  const ident = (id: string) => {
    const m = ids.get(id);
    return m ? { nickname: m.nickname, handle: m.username } : null;
  };

  const rows: MeetingReportAdminRow[] = raw.map((r) => {
    const s = String(r.status ?? "pending");
    const meetingId = r.meeting_id ? String(r.meeting_id) : null;
    const reviewer = r.reviewed_by ? String(r.reviewed_by) : null;
    return {
      id: String(r.id),
      meeting_id: meetingId,
      meeting_title: meetingId ? titles.get(meetingId) ?? null : null,
      target_type: String(r.target_type ?? "meeting"),
      target_id: String(r.target_id ?? ""),
      target_member: r.target_type === "member" ? ident(String(r.target_id ?? "")) : null,
      reporter_user_id: String(r.reporter_user_id ?? ""),
      reporter: ident(String(r.reporter_user_id ?? "")),
      reason_type: String(r.reason_type ?? "etc"),
      reason_detail: r.reason_detail != null ? String(r.reason_detail) : null,
      status: (["pending", "reviewing", "resolved", "rejected"].includes(s) ? s : "pending") as MeetingReportStatus,
      action_result: r.action_result != null ? String(r.action_result) : null,
      reviewed_by: reviewer,
      reviewed_by_label: reviewer ? formatAdminMemberLabel(ids.get(reviewer) ?? null, "관리자") : null,
      reviewed_at: r.reviewed_at != null ? String(r.reviewed_at) : null,
      created_at: String(r.created_at ?? ""),
    };
  });
  return { ok: true, rows, total: list.count ?? rows.length, counts };
}

/** 검색어 → 모임 id · 신고자 id (모임 이름 · 닉네임) */
export async function resolveAdminMeetingReportSearch(
  q: string
): Promise<{ meetingIds: string[]; reporterIds: string[] } | null> {
  const safe = q.replace(/[%_,()\\]/g, " ").trim().slice(0, 60);
  if (!safe) return null;
  try {
    const sb = getSupabaseServer();
    const [{ data: ms }, { data: ps }] = await Promise.all([
      sb.from("meetings").select("id").ilike("title", `%${safe}%`).limit(100),
      sb.from("profiles").select("id").ilike("nickname", `%${safe}%`).limit(100),
    ]);
    return {
      meetingIds: ((ms ?? []) as Array<{ id?: string }>).map((m) => String(m.id ?? "")).filter(Boolean),
      reporterIds: ((ps ?? []) as Array<{ id?: string }>).map((p) => String(p.id ?? "")).filter(Boolean),
    };
  } catch {
    return { meetingIds: [], reporterIds: [] };
  }
}
