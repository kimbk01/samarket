import { Suspense } from "react";
import { AdminMoimSanctionsPage } from "@/components/admin/moim/AdminMoimSanctionsPage";

/** 모임 어드민 (설계 docs/design/moim §8 · 권한 키 moim) */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <AdminMoimSanctionsPage />
    </Suspense>
  );
}
