import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { OpsRunbookStartForm } from "@/components/admin/ops-runbooks/OpsRunbookStartForm";

export default function OpsRunbookStartPage() {
  return (
    <>
      <AdminPageHeader titleKey="admin_page_runbook_start" backHref="/admin/ops-runbooks" />
      <AdminCard>
        <OpsRunbookStartForm />
      </AdminCard>
    </>
  );
}
