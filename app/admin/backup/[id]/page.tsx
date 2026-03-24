import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { BackupDetailPage } from "@/components/admin/backup/BackupDetailPage";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BackupDetailRoute({ params }: PageProps) {
  const { id } = await params;
  return (
    <>
      <AdminPageHeader title="백업 상세" backHref="/admin/backup" />
      <BackupDetailPage snapshotId={id} />
    </>
  );
}
