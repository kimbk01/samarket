import { AdminCommunityReportsPage } from "@/components/admin/community/AdminCommunityReportsPage";
import { listCommunityReportsForAdmin } from "@/lib/community-feed/admin-community-reports";

export default async function AdminCommunityReportsRoute({
  searchParams,
}: {
  searchParams?: Promise<{ rid?: string }>;
}) {
  const rows = await listCommunityReportsForAdmin(200);
  const sp = searchParams ? await searchParams : {};
  const highlightId = sp.rid?.trim() ?? "";
  return <AdminCommunityReportsPage initialRows={rows} highlightId={highlightId} />;
}
