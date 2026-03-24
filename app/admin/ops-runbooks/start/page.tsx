import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { OpsRunbookStartForm } from "@/components/admin/ops-runbooks/OpsRunbookStartForm";

export default function OpsRunbookStartPage() {
  return (
    <>
      <AdminPageHeader title="런북 실행 시작" backHref="/admin/ops-runbooks" />
      <AdminCard>
        <OpsRunbookStartForm />
      </AdminCard>
    </>
  );
}
