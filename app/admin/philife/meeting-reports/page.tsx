import { AdminAccessDeniedPanel } from "@/components/admin/AdminAccessDeniedPanel";
import { requireAdminPageAccess } from "@/lib/admin/access/require-admin-page-access";
import { Suspense } from "react";
import {
  communityAdminListPeriodParams,
  parseCommunityAdminPeriod,
} from "@/lib/admin/community-admin/community-admin-period";
import { normalizeAdminListPage, normalizeAdminListPageSize } from "@/lib/admin/list-query/admin-list-query";
import { loadAdminMeetingReports } from "@/lib/admin/community-admin/load-admin-meeting-reports";
import { resolveMeetingReportTab } from "@/lib/admin/metrics/admin-metric-filters";
import { AdminMeetingReportsPage } from "@/components/admin/philife/AdminMeetingReportsPage";
import {
  MEETING_REPORT_TARGET_OPTIONS,
  type MeetingReportFilters,
  type MeetingReportListResult,
} from "@/components/admin/community/reports/meeting-report-contract";
import { AdminPhilifeMeetingReportsHeader } from "@/components/admin/philife/AdminPhilifeMeetingReportsHeader";

export const dynamic = "force-dynamic";

type Sp = Record<string, string | string[] | undefined>;

function one(sp: Sp, k: string): string {
  const v = sp[k];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

export default async function AdminPhilifeMeetingReportsRoute({ searchParams }: { searchParams?: Promise<Sp> }) {
  // P1-11 · AD-01: 서버 렌더 데이터 조회 전 페이지 자체 권한 가드 (레이아웃 게이트에만 의존하지 않음)
  const access = await requireAdminPageAccess("/admin/philife/meeting-reports");
  if (!access.ok) return <AdminAccessDeniedPanel backHref="/admin" />;
  const sp = searchParams ? await searchParams : {};
  const tab = resolveMeetingReportTab(one(sp, "status"));
  const typeRaw = one(sp, "type");
  const type = (MEETING_REPORT_TARGET_OPTIONS as readonly string[]).includes(typeRaw) ? typeRaw : "";
  // 화면 표준 (R7): page · size(20/50/100, 기본 20) — 화면의 AdminPagination 과 같은 해석
  const page = normalizeAdminListPage(one(sp, "page"));
  const pageSize = normalizeAdminListPageSize(one(sp, "size"));
  const q = one(sp, "q");
  // 필터 바 날짜(from/to) · 옛 period 프리셋 링크 — 화면과 같은 변환
  const period = parseCommunityAdminPeriod(
    communityAdminListPeriodParams({ period: one(sp, "period"), from: one(sp, "from"), to: one(sp, "to") })
  );

  const filters: MeetingReportFilters = { tab, type, q, periodError: period.ok ? null : period.error };
  // 검색(모임 이름 · 신고자 닉네임)은 로더가 DB 에서 한 번에 거른다 (R7: 후보 100건 상한 없음)
  const result: MeetingReportListResult = await loadAdminMeetingReports(
    tab,
    {
      type,
      fromIso: period.ok ? period.fromIso : null,
      toIso: period.ok ? period.toIso : null,
      meetingIds: null,
      reporterIds: null,
      q: q || null,
    },
    page,
    undefined,
    { pageSize }
  );

  return (
    <div className="space-y-3 p-4">
      <AdminPhilifeMeetingReportsHeader />
      <Suspense fallback={null}>
        <AdminMeetingReportsPage result={result} filters={filters} pageSize={pageSize} />
      </Suspense>
    </div>
  );
}
