import { PlatformEventDetailPageClient } from "@/components/platform-events/PlatformEventDetailPageClient";

export default async function PlatformEventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  return <PlatformEventDetailPageClient eventId={String(eventId ?? "")} />;
}
