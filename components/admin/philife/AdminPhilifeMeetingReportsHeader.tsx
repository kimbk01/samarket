"use client";

import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminOpsCrossLinkBar } from "@/components/admin/AdminOpsCrossLinkBar";
import { ARO_IA_001_COMMUNITY_REPORTS_PATH } from "@/lib/admin/aro-ia-001-community-common-links";

export function AdminPhilifeMeetingReportsHeader() {
  return (
    <div className="space-y-3">
      <AdminPageHeader
        titleKey="admin_meeting_reports_page_title"
        descriptionKey="admin_meeting_reports_page_desc"
      />
      <Suspense fallback={null}>
        <AdminOpsCrossLinkBar
          links={[
            {
              href: ARO_IA_001_COMMUNITY_REPORTS_PATH,
              labelKo: "일반 신고",
              labelEn: "General reports",
              dataAttr: "meeting-report-to-community-report",
            },
          ]}
          noteKo="모임(미팅) 신고입니다. 일반 커뮤니티 신고와 별도 모델입니다."
          noteEn="Meeting reports. Separate model from general community reports."
        />
      </Suspense>
    </div>
  );
}
