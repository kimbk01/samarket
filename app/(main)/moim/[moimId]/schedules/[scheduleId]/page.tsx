import { MoimScheduleDetailScreen } from "@/components/moim/MoimScheduleDetailScreen";

export default async function MoimSchedulePage({ params }: { params: Promise<{ moimId: string; scheduleId: string }> }) {
  const { moimId, scheduleId } = await params;
  return <MoimScheduleDetailScreen moimId={moimId} scheduleId={scheduleId} />;
}
