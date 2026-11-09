"use client";

import { Suspense } from "react";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";
import { OwnerStorePartnerAgreementView } from "@/components/business/owner/OwnerStorePartnerAgreementView";

/** 사장님 「입점 계약」 — 동의한 입점·수수료 계약 목록·새 버전 재동의 (설계 v2 §4-5, 2026-11-10) */
export default function OwnerStorePartnerAgreementPage() {
  return (
    <Suspense
      fallback={
        <OwnerAdminPageScrollShell className="pt-4">
          <OwnerStoreSuspenseFallback className="text-sm text-sam-muted" />
        </OwnerAdminPageScrollShell>
      }
    >
      <OwnerAdminPageScrollShell className="pt-1">
        <OwnerStorePartnerAgreementView />
      </OwnerAdminPageScrollShell>
    </Suspense>
  );
}
