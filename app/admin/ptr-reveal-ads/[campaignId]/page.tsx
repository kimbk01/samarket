import { AdminPtrRevealDetailWorkspace } from "@/components/admin/ptr-reveal/AdminPtrRevealDetailWorkspace";

export default async function AdminPtrRevealAdDetailPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  return <AdminPtrRevealDetailWorkspace campaignId={campaignId} />;
}
