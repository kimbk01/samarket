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
import { parseCommunityAdminPeriod } from "@/lib/admin/community-admin/community-admin-period";
import { normalizeAdminListPageSize } from "@/lib/admin/list-query/admin-list-query";

/** 페이지 크기 — URL `size` (20/50/100, 기본 50) */
const DEFAULT_PAGE_SIZE = 50;

type Sp = Record<string, string | string[] | undefined>;

function one(sp: Sp, k: string): string {
  const v = sp[k];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

/** 신고 처리함 (설계 §C-2) — 대상별 묶음 · 서버 페이지네이션 · URL 필터 (service-role 서버 조회) */
export default async function AdminCommunityReportsRoute({ searchParams }: { searchParams?: Promise<Sp> }) {
  const sp = searchParams ? await searchParams : {};
  const tab = resolveCommunityReportInboxTab({ status: one(sp, "status"), pending: one(sp, "pending") });
  const typeRaw = one(sp, "type");
  const targetType: CommunityReportTargetFilter =
    typeRaw === "post" || typeRaw === "comment" || typeRaw === "user" ? typeRaw : "";
  const page = Math.max(1, Math.floor(Number(one(sp, "page") || 1)) || 1);
  const pageSize = normalizeAdminListPageSize(one(sp, "size"), DEFAULT_PAGE_SIZE);
  const period = parseCommunityAdminPeriod({ period: one(sp, "period"), from: one(sp, "from"), to: one(sp, "to") });

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
