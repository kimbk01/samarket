import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminStoreFinancePanels } from "@/components/admin/finance/AdminStoreFinancePanels";

export default function AdminFinancePage() {
  return (
    <div className="space-y-4 p-4">
      <AdminPageHeader titleKey="admin_page_store_finance" />
      <AdminStoreFinancePanels />
    </div>
  );
}
