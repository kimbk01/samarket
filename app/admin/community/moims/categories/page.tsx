import { Suspense } from "react";
import { AdminMoimCategoriesPage } from "@/components/admin/moim/AdminMoimCategoriesPage";

/** 모임 어드민 (설계 docs/design/moim §8 · 권한 키 moim) */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <AdminMoimCategoriesPage />
    </Suspense>
  );
}
