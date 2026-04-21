"use client";

import { useEffect, useState } from "react";
import { getReportByIdFromDb } from "@/lib/admin-reports/getReportsFromDb";
import type { CommunityReportAdminRow } from "@/lib/community-feed/admin-community-reports";
import { AdminCommunityReportDetailClient } from "@/components/admin/community/AdminCommunityReportDetailClient";
import { AdminReportDetailPage } from "./AdminReportDetailPage";

type Phase = "loading" | "legacy" | "community" | "none";

/** 통합 신고 상세: `reports` 우선, 없으면 `community_reports` */
export function AdminUnifiedReportDetailRouter({ reportId }: { reportId: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [communityRow, setCommunityRow] = useState<CommunityReportAdminRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    const id = reportId?.trim();
    if (!id) {
      setPhase("none");
      return;
    }
    (async () => {
      const leg = await getReportByIdFromDb(id);
      if (cancelled) return;
      if (leg) {
        setPhase("legacy");
        return;
      }
      const res = await fetch(`/api/admin/community-reports/${encodeURIComponent(id)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json()) as { ok?: boolean; row?: CommunityReportAdminRow };
      if (cancelled) return;
      if (j.ok && j.row) {
        setCommunityRow(j.row);
        setPhase("community");
        return;
      }
      setPhase("none");
    })();
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  if (phase === "loading") {
    return <div className="py-8 text-center sam-text-body text-sam-muted">불러오는 중…</div>;
  }
  if (phase === "none") {
    return <div className="py-8 text-center sam-text-body text-sam-muted">신고를 찾을 수 없습니다.</div>;
  }
  if (phase === "legacy") {
    return <AdminReportDetailPage reportId={reportId.trim()} />;
  }
  if (phase === "community" && communityRow) {
    return <AdminCommunityReportDetailClient initialRow={communityRow} />;
  }
  return <div className="py-8 text-center sam-text-body text-sam-muted">불러오는 중…</div>;
}
