import { OpsDocumentDetailPage } from "@/components/admin/ops-docs/OpsDocumentDetailPage";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function OpsDocumentDetailRoute({ params }: PageProps) {
  const { id } = await params;
  return <OpsDocumentDetailPage documentId={id} />;
}
