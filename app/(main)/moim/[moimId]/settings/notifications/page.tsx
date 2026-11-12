import { MoimNotificationSettingsScreen } from "@/components/moim/MoimNotificationSettingsScreen";

export default async function MoimNotificationSettingsPage({ params }: { params: Promise<{ moimId: string }> }) {
  const { moimId } = await params;
  return <MoimNotificationSettingsScreen moimId={moimId} />;
}
