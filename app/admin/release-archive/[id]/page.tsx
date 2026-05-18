import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ReleaseArchiveDetailPage } from "@/components/admin/release-archive/ReleaseArchiveDetailPage";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ReleaseArchiveDetailRoute({ params }: PageProps) {
  const { id } = await params;
  return (
    <>
      <AdminPageHeader titleKey="admin_page_release_archive_detail" backHref="/admin/release-archive" />
      <ReleaseArchiveDetailPage releaseArchiveId={id} />
    </>
  );
}
