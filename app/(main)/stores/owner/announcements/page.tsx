"use client";

import { Suspense } from "react";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerAnnouncementsView } from "@/components/business/owner/OwnerAnnouncementsView";
import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";

/** 운영 공지 목록 — 어드민 → 사장님 전용 공지 (배달 오픈 4단계 · Owner 2026-11-10) */
export default function OwnerAnnouncementsPage() {
  return (
    <Suspense
      fallback={
        <OwnerAdminPageScrollShell className="pt-4">
          <OwnerStoreSuspenseFallback className="text-sm text-sam-muted" />
        </OwnerAdminPageScrollShell>
      }
    >
      <OwnerAdminPageScrollShell className="pt-1">
        <OwnerAnnouncementsView />
      </OwnerAdminPageScrollShell>
    </Suspense>
  );
}
