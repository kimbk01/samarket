import { Suspense } from "react";
import { AdminLoadingFallback } from "@/components/admin/AdminLoadingFallback";
import { AdminStoreOwnerNoticesPage } from "@/components/admin/stores/AdminStoreOwnerNoticesPage";

/** 배달·매장 › 매장 › 매장 공지 — 사장님 전용 운영 공지 목록 (설계 v3.2 §3-4 · Owner 2026-11-10) */
export default function AdminStoreOwnerNoticesRoute() {
  return (
    <Suspense fallback={<AdminLoadingFallback />}>
      <AdminStoreOwnerNoticesPage />
    </Suspense>
  );
}
