import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminFinanceHubView } from "@/components/finance/AdminFinanceHubView";

export default function AdminFinancePage() {
  return (
    <div className="space-y-4 p-4">
      <AdminPageHeader titleKey="admin_page_store_finance" />
      <Suspense fallback={null}>
        <AdminFinanceHubView />
      </Suspense>
    </div>
  );
}
