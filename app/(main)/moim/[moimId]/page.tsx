import { Suspense } from "react";
import { MoimDetailScreen } from "@/components/moim/MoimDetailScreen";

export default async function MoimDetailPage({ params }: { params: Promise<{ moimId: string }> }) {
  const { moimId } = await params;
  return (
    <Suspense fallback={null}>
      <MoimDetailScreen moimId={moimId} />
    </Suspense>
  );
}
