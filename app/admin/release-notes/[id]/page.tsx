import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ReleaseNoteDetailCard } from "@/components/admin/release-notes/ReleaseNoteDetailCard";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ReleaseNoteDetailPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <>
      <AdminPageHeader titleKey="admin_page_release_note_detail" backHref="/admin/release-notes" />
      <ReleaseNoteDetailCard releaseNoteId={id} />
    </>
  );
}
