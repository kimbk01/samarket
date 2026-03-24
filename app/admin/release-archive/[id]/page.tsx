import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ReleaseArchiveDetailPage } from "@/components/admin/release-archive/ReleaseArchiveDetailPage";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ReleaseArchiveDetailRoute({ params }: PageProps) {
  const { id } = await params;
  return (
    <>
      <AdminPageHeader title="릴리즈 아카이브 상세" backHref="/admin/release-archive" />
      <ReleaseArchiveDetailPage releaseArchiveId={id} />
    </>
  );
}
