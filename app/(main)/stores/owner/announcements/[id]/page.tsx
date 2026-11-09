"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerAnnouncementDetailView } from "@/components/business/owner/OwnerAnnouncementDetailView";
import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";

function OwnerAnnouncementDetailInner() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id.trim() : "";
  return <OwnerAnnouncementDetailView noticeId={id} />;
}

/** 운영 공지 상세 — 알림 링크 목적지 (배달 오픈 4단계 · Owner 2026-11-10) */
export default function OwnerAnnouncementDetailPage() {
  return (
    <Suspense
      fallback={
        <OwnerAdminPageScrollShell className="pt-4">
          <OwnerStoreSuspenseFallback className="text-sm text-sam-muted" />
        </OwnerAdminPageScrollShell>
      }
    >
      <OwnerAdminPageScrollShell className="pt-1">
        <OwnerAnnouncementDetailInner />
      </OwnerAdminPageScrollShell>
    </Suspense>
  );
}
