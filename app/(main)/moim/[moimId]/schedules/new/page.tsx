import { MoimScheduleFormScreen } from "@/components/moim/MoimScheduleFormScreen";

export default async function MoimScheduleNewPage({ params }: { params: Promise<{ moimId: string }> }) {
  const { moimId } = await params;
  return <MoimScheduleFormScreen moimId={moimId} />;
}
