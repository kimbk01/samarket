import { Suspense } from "react";
import { AdminMoimDetailPage } from "@/components/admin/moim/AdminMoimDetailPage";

type PageProps = { params: Promise<{ moimId: string }> };

/** 모임 상세 (설계 docs/design/moim §8 · 권한 키 moim) */
export default async function Page({ params }: PageProps) {
  const { moimId } = await params;
  return (
    <Suspense fallback={null}>
      <AdminMoimDetailPage moimId={moimId} />
    </Suspense>
  );
}
