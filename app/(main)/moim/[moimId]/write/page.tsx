import { Suspense } from "react";
import { MoimWriteScreen } from "@/components/moim/MoimWriteScreen";

export default async function MoimWritePage({ params }: { params: Promise<{ moimId: string }> }) {
  const { moimId } = await params;
  return (
    <Suspense fallback={null}>
      <MoimWriteScreen moimId={moimId} />
    </Suspense>
  );
}
