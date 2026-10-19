"use client";

/**
 * `/admin/reports/[id]` — 피드 신고 상세 (설계 §C-3).
 * 처리함 오른쪽 시트와 **같은 처리 패널**(`CommunityReportDecisionPanel`)을 그대로 쓴다 — 두 번째 구현 없음.
 * 「목록으로」는 returnTo(처리함의 탭·필터·페이지) → 없으면 처리함.
 */
import { useSearchParams } from "next/navigation";
import type { CommunityReportAdminRow } from "@/lib/community-feed/admin-community-reports";
import { readAdminReturnToFromSearch } from "@/lib/admin/admin-operation-return-context";
import { ARO_IA_001_COMMUNITY_REPORTS_PATH } from "@/lib/admin/aro-ia-001-community-common-links";
import { AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { CommunityReportDecisionPanel } from "@/components/admin/community/reports/CommunityReportDecisionPanel";

export function AdminCommunityReportDetailClient({ initialRow }: { initialRow: CommunityReportAdminRow }) {
  const sp = useSearchParams();
  const backHref = readAdminReturnToFromSearch(sp) ?? ARO_IA_001_COMMUNITY_REPORTS_PATH;
  return (
    <div className="mx-auto max-w-3xl space-y-3" data-admin-community-report-detail={initialRow.id}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="sam-text-page-title font-semibold text-sam-fg">신고 처리</h1>
          <p className="mt-1 sam-text-body text-sam-muted">신고 내용을 확인하고 인정 또는 기각합니다.</p>
        </div>
        <AdminActionLink href={backHref} variant="secondary">
          목록으로
        </AdminActionLink>
      </header>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <CommunityReportDecisionPanel reportId={initialRow.id} initialRow={initialRow} />
      </div>
    </div>
  );
}
