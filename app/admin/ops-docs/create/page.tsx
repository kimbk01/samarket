import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { OpsDocumentForm } from "@/components/admin/ops-docs/OpsDocumentForm";

export default function OpsDocCreatePage() {
  return (
    <>
      <AdminPageHeader titleKey="admin_page_ops_doc_create" backHref="/admin/ops-docs" />
      <AdminCard>
        <OpsDocumentForm />
      </AdminCard>
    </>
  );
}
