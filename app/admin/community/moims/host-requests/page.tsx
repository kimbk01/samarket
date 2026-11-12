import { Suspense } from "react";
import { AdminMoimHostRequestsPage } from "@/components/admin/moim/AdminMoimHostRequestsPage";

/** 모임 어드민 (설계 docs/design/moim §8 · 권한 키 moim) */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <AdminMoimHostRequestsPage />
    </Suspense>
  );
}
