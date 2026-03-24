import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { OpsDocumentForm } from "@/components/admin/ops-docs/OpsDocumentForm";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function OpsDocEditRoute({ params }: PageProps) {
  const { id } = await params;
  return (
    <>
      <AdminPageHeader title="문서 수정" backHref={`/admin/ops-docs/${id}`} />
      <AdminCard>
        <OpsDocumentForm documentId={id} />
      </AdminCard>
    </>
  );
}
