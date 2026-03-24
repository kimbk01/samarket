import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { OpsDocumentForm } from "@/components/admin/ops-docs/OpsDocumentForm";

export default function OpsDocCreatePage() {
  return (
    <>
      <AdminPageHeader title="문서 생성" backHref="/admin/ops-docs" />
      <AdminCard>
        <OpsDocumentForm />
      </AdminCard>
    </>
  );
}
