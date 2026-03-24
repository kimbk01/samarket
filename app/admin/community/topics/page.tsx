import { AdminCommunityTopicsPage } from "@/components/admin/community/AdminCommunityTopicsPage";
import { listAllCommunitySectionsForAdmin } from "@/lib/community-feed/queries";
import { listAllCommunityTopicsForAdmin } from "@/lib/community-topics/server";

export default async function AdminCommunityTopicsRoute() {
  const [sections, topics] = await Promise.all([listAllCommunitySectionsForAdmin(), listAllCommunityTopicsForAdmin()]);
  return <AdminCommunityTopicsPage sections={sections} topics={topics} />;
}
