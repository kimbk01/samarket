import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ReleaseNoteDetailCard } from "@/components/admin/release-notes/ReleaseNoteDetailCard";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ReleaseNoteDetailPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <>
      <AdminPageHeader title="릴리즈 노트 상세" backHref="/admin/release-notes" />
      <ReleaseNoteDetailCard releaseNoteId={id} />
    </>
  );
}
