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
      <AdminPageHeader titleKey="admin_page_ops_doc_edit" backHref={`/admin/ops-docs/${id}`} />
      <AdminCard>
        <OpsDocumentForm documentId={id} />
      </AdminCard>
    </>
  );
}
