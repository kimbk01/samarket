import { AdminAccessDeniedPanel } from "@/components/admin/AdminAccessDeniedPanel";
import { requireAdminPageAccess } from "@/lib/admin/access/require-admin-page-access";
import { Suspense } from "react";
import {
  AdminCommunityReportsPage,
  type AdminCommunityReportsFilters,
} from "@/components/admin/community/AdminCommunityReportsPage";
import {
  listCommunityReportGroupsForAdmin,
  resolveCommunityReportInboxTab,
  type CommunityReportTargetFilter,
} from "@/lib/community-feed/admin-community-reports";
import {
  communityAdminListPeriodParams,
  parseCommunityAdminPeriod,
} from "@/lib/admin/community-admin/community-admin-period";
import { normalizeAdminListPage, normalizeAdminListPageSize } from "@/lib/admin/list-query/admin-list-query";

type Sp = Record<string, string | string[] | undefined>;

function one(sp: Sp, k: string): string {
  const v = sp[k];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

/** 신고 처리함 (설계 §C-2) — 대상별 묶음 · 서버 페이지네이션 · URL 필터 (service-role 서버 조회) */
export default async function AdminCommunityReportsRoute({ searchParams }: { searchParams?: Promise<Sp> }) {
  // P1-11 · AD-01: 서버 렌더 데이터 조회 전 페이지 자체 권한 가드 (레이아웃 게이트에만 의존하지 않음)
  const access = await requireAdminPageAccess("/admin/community/reports");
  if (!access.ok) return <AdminAccessDeniedPanel backHref="/admin" />;
  const sp = searchParams ? await searchParams : {};
  const tab = resolveCommunityReportInboxTab({ status: one(sp, "status"), pending: one(sp, "pending") });
  const typeRaw = one(sp, "type");
  const targetType: CommunityReportTargetFilter =
    typeRaw === "post" || typeRaw === "comment" || typeRaw === "user" ? typeRaw : "";
  // 화면 표준 (R7): page · size(20/50/100, 기본 20) — 화면의 AdminPagination 과 같은 해석
  const page = normalizeAdminListPage(one(sp, "page"));
  const pageSize = normalizeAdminListPageSize(one(sp, "size"));
  // 필터 바 날짜(from/to) · 옛 period 프리셋 링크 — 화면과 같은 변환
  const period = parseCommunityAdminPeriod(
    communityAdminListPeriodParams({ period: one(sp, "period"), from: one(sp, "from"), to: one(sp, "to") })
  );

  const filters: AdminCommunityReportsFilters = {
    tab,
    type: targetType,
    q: one(sp, "q"),
    targetId: one(sp, "targetId"),
    topicSlug: one(sp, "topicSlug"),
    reporterId: one(sp, "reporterId"),
    authorId: one(sp, "authorId"),
    periodError: period.ok ? null : period.error,
  };

  const result = await listCommunityReportGroupsForAdmin({
    tab,
    targetType,
    q: filters.q || undefined,
    targetId: filters.targetId || undefined,
    topicSlug: filters.topicSlug || undefined,
    reporterId: filters.reporterId || undefined,
    authorId: filters.authorId || undefined,
    createdFromIso: period.ok ? period.fromIso : null,
    createdToIso: period.ok ? period.toIso : null,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  return (
    <Suspense fallback={null}>
      <AdminCommunityReportsPage
        result={result}
        filters={filters}
        pageSize={pageSize}
        highlightId={one(sp, "rid")}
      />
    </Suspense>
  );
}
