import { MoimScheduleFormScreen } from "@/components/moim/MoimScheduleFormScreen";

export default async function MoimScheduleEditPage({ params }: { params: Promise<{ moimId: string; scheduleId: string }> }) {
  const { moimId, scheduleId } = await params;
  return <MoimScheduleFormScreen moimId={moimId} scheduleId={scheduleId} />;
}
