import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminFinanceTransactionsView } from "@/components/finance/AdminFinanceTransactionsView";

export default function AdminFinanceTransactionsPage() {
  return (
    <div className="space-y-4 p-4">
      <AdminPageHeader titleKey="admin_page_store_finance" />
      <Suspense fallback={null}>
        <AdminFinanceTransactionsView />
      </Suspense>
    </div>
  );
}
