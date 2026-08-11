import {
  AdminCommunityReportsPage,
  type AdminCommunityReportsFilters,
} from "@/components/admin/community/AdminCommunityReportsPage";
import { listCommunityReportsForAdmin } from "@/lib/community-feed/admin-community-reports";

export default async function AdminCommunityReportsRoute({
  searchParams,
}: {
  searchParams?: Promise<{
    rid?: string;
    status?: string;
    pending?: string;
    targetId?: string;
    topicSlug?: string;
    reporterId?: string;
    authorId?: string;
  }>;
}) {
  const sp = searchParams ? await searchParams : {};
  const statusRaw = sp.status?.trim() ?? "";
  const pendingFlag = sp.pending === "1" || sp.pending === "true";
  const isPending = statusRaw === "pending" || pendingFlag;
  const status =
    isPending ? "pending"
    : statusRaw && ["open", "reviewing", "resolved", "dismissed"].includes(statusRaw) ? statusRaw
    : "";

  const filters: AdminCommunityReportsFilters = {
    status,
    targetId: sp.targetId?.trim() ?? "",
    topicSlug: sp.topicSlug?.trim() ?? "",
    reporterId: sp.reporterId?.trim() ?? "",
    authorId: sp.authorId?.trim() ?? "",
  };

  const rows = await listCommunityReportsForAdmin({
    limit: 200,
    pending: isPending || undefined,
    status: isPending || !status ? undefined : status,
    targetId: filters.targetId || undefined,
    topicSlug: filters.topicSlug || undefined,
    reporterId: filters.reporterId || undefined,
    authorId: filters.authorId || undefined,
  });

  const highlightId = sp.rid?.trim() ?? "";
  return (
    <AdminCommunityReportsPage initialRows={rows} highlightId={highlightId} filters={filters} />
  );
}
