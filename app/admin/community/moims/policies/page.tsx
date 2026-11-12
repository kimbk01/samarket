import { Suspense } from "react";
import { AdminMoimPoliciesPage } from "@/components/admin/moim/AdminMoimPoliciesPage";

/** 모임 어드민 (설계 docs/design/moim §8 · 권한 키 moim) */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <AdminMoimPoliciesPage />
    </Suspense>
  );
}
