import { IntroStudio } from "@/components/admin/intro/IntroStudio";

export default async function AdminIntroStudioPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  return (
    <div data-admin-intro-studio-page="1">
      <IntroStudio documentId={documentId} ko />
    </div>
  );
}
