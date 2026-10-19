import { Suspense } from "react";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { formatAdminMemberLabel, loadAdminMemberIdentityMap } from "@/lib/admin-community/member-identity";
import { parseCommunityAdminPeriod } from "@/lib/admin/community-admin/community-admin-period";
import { AdminMeetingReportsPage } from "@/components/admin/philife/AdminMeetingReportsPage";
import {
  MEETING_REPORT_TABS,
  MEETING_REPORT_TARGET_OPTIONS,
  type MeetingReportAdminRow,
  type MeetingReportFilters,
  type MeetingReportListResult,
  type MeetingReportStatus,
  type MeetingReportTab,
} from "@/components/admin/community/reports/meeting-report-contract";
import { AdminPhilifeMeetingReportsHeader } from "@/components/admin/philife/AdminPhilifeMeetingReportsHeader";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const SELECT =
  "id, meeting_id, target_type, target_id, reporter_user_id, reason_type, reason_detail, status, action_result, reviewed_by, reviewed_at, created_at";

type Sp = Record<string, string | string[] | undefined>;

function one(sp: Sp, k: string): string {
  const v = sp[k];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

/** `?status=` — 대시보드 진입(없음·pending·open) = 처리 대기(접수+검토 중) */
function resolveTab(raw: string): MeetingReportTab {
  const s = raw.toLowerCase();
  if (s === "dismissed") return "rejected";
  return (MEETING_REPORT_TABS as readonly string[]).includes(s) ? (s as MeetingReportTab) : "pending";
}

const TAB_STATUSES: Record<MeetingReportTab, MeetingReportStatus[] | null> = {
  pending: ["pending", "reviewing"],
  reviewing: ["reviewing"],
  resolved: ["resolved"],
  rejected: ["rejected"],
  all: null,
};

type Filter = {
  type: string;
  fromIso: string | null;
  toIso: string | null;
  meetingIds: string[] | null;
  reporterIds: string[] | null;
};

/** 모임 신고 목록 — 서버 페이지네이션 + 탭 건수 (service-role 서버 조회, 읽기 전용) */
async function loadMeetingReports(tab: MeetingReportTab, f: Filter, page: number): Promise<MeetingReportListResult> {
  const fail: MeetingReportListResult = { ok: false, rows: [], total: 0, counts: null };
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
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

  const countFor = async (t: MeetingReportTab) => {
    let q = build("id", { count: "exact", head: true });
    const st = TAB_STATUSES[t];
    if (st) q = q.in("status", st);
    const { count, error } = await q;
    return error ? null : count ?? 0;
  };

  let listQ = build(SELECT, { count: "exact" });
  const st = TAB_STATUSES[tab];
  if (st) listQ = listQ.in("status", st);
  const [list, ...countVals] = await Promise.all([
    listQ.order("created_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    ...MEETING_REPORT_TABS.map((t) => countFor(t)),
  ]);
  if (list.error) return fail;
  const counts = countVals.every((c) => c !== null)
    ? (Object.fromEntries(MEETING_REPORT_TABS.map((t, i) => [t, countVals[i] as number])) as Record<MeetingReportTab, number>)
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
async function resolveSearch(q: string): Promise<{ meetingIds: string[]; reporterIds: string[] } | null> {
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

export default async function AdminPhilifeMeetingReportsRoute({ searchParams }: { searchParams?: Promise<Sp> }) {
  const sp = searchParams ? await searchParams : {};
  const tab = resolveTab(one(sp, "status"));
  const typeRaw = one(sp, "type");
  const type = (MEETING_REPORT_TARGET_OPTIONS as readonly string[]).includes(typeRaw) ? typeRaw : "";
  const page = Math.max(1, Math.floor(Number(one(sp, "page") || 1)) || 1);
  const q = one(sp, "q");
  const period = parseCommunityAdminPeriod({ period: one(sp, "period"), from: one(sp, "from"), to: one(sp, "to") });

  const filters: MeetingReportFilters = { tab, type, q, periodError: period.ok ? null : period.error };
  const search = q ? await resolveSearch(q) : null;
  const result: MeetingReportListResult =
    search && !search.meetingIds.length && !search.reporterIds.length
      ? { ok: true, rows: [], total: 0, counts: Object.fromEntries(MEETING_REPORT_TABS.map((t) => [t, 0])) as Record<MeetingReportTab, number> }
      : await loadMeetingReports(
          tab,
          {
            type,
            fromIso: period.ok ? period.fromIso : null,
            toIso: period.ok ? period.toIso : null,
            meetingIds: search?.meetingIds ?? null,
            reporterIds: search?.reporterIds ?? null,
          },
          page
        );

  return (
    <div className="space-y-3 p-4">
      <AdminPhilifeMeetingReportsHeader />
      <Suspense fallback={null}>
        <AdminMeetingReportsPage result={result} filters={filters} pageSize={PAGE_SIZE} />
      </Suspense>
    </div>
  );
}
