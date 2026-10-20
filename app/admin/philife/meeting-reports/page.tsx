import { Suspense } from "react";
import { parseCommunityAdminPeriod } from "@/lib/admin/community-admin/community-admin-period";
import {
  ADMIN_MEETING_REPORTS_PAGE_SIZE,
  loadAdminMeetingReports,
  resolveAdminMeetingReportSearch,
} from "@/lib/admin/community-admin/load-admin-meeting-reports";
import { resolveMeetingReportTab } from "@/lib/admin/metrics/admin-metric-filters";
import { AdminMeetingReportsPage } from "@/components/admin/philife/AdminMeetingReportsPage";
import {
  MEETING_REPORT_TABS,
  MEETING_REPORT_TARGET_OPTIONS,
  type MeetingReportFilters,
  type MeetingReportListResult,
  type MeetingReportTab,
} from "@/components/admin/community/reports/meeting-report-contract";
import { AdminPhilifeMeetingReportsHeader } from "@/components/admin/philife/AdminPhilifeMeetingReportsHeader";

export const dynamic = "force-dynamic";

type Sp = Record<string, string | string[] | undefined>;

function one(sp: Sp, k: string): string {
  const v = sp[k];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

export default async function AdminPhilifeMeetingReportsRoute({ searchParams }: { searchParams?: Promise<Sp> }) {
  const sp = searchParams ? await searchParams : {};
  const tab = resolveMeetingReportTab(one(sp, "status"));
  const typeRaw = one(sp, "type");
  const type = (MEETING_REPORT_TARGET_OPTIONS as readonly string[]).includes(typeRaw) ? typeRaw : "";
  const page = Math.max(1, Math.floor(Number(one(sp, "page") || 1)) || 1);
  const q = one(sp, "q");
  const period = parseCommunityAdminPeriod({ period: one(sp, "period"), from: one(sp, "from"), to: one(sp, "to") });

  const filters: MeetingReportFilters = { tab, type, q, periodError: period.ok ? null : period.error };
  const search = q ? await resolveAdminMeetingReportSearch(q) : null;
  const result: MeetingReportListResult =
    search && !search.meetingIds.length && !search.reporterIds.length
      ? { ok: true, rows: [], total: 0, counts: Object.fromEntries(MEETING_REPORT_TABS.map((t) => [t, 0])) as Record<MeetingReportTab, number> }
      : await loadAdminMeetingReports(
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
        <AdminMeetingReportsPage result={result} filters={filters} pageSize={ADMIN_MEETING_REPORTS_PAGE_SIZE} />
      </Suspense>
    </div>
  );
}
