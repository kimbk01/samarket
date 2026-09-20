import { AdminPlatformEventEditorClient } from "@/components/admin/platform-events/AdminPlatformEventEditorClient";

export default async function AdminPlatformEventEditPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  return <AdminPlatformEventEditorClient eventId={String(eventId ?? "")} />;
}
