import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { BackupDetailPage } from "@/components/admin/backup/BackupDetailPage";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BackupDetailRoute({ params }: PageProps) {
  const { id } = await params;
  return (
    <>
      <AdminPageHeader titleKey="admin_page_backup_detail" backHref="/admin/backup" />
      <BackupDetailPage snapshotId={id} />
    </>
  );
}
