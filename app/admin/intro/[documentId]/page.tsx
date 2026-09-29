import { IntroStudioPage } from "@/components/admin/intro/IntroStudioPage";

type Props = { params: Promise<{ documentId: string }> };

export default async function AdminIntroDocumentPage({ params }: Props) {
  const { documentId } = await params;
  return <IntroStudioPage documentId={documentId} />;
}
