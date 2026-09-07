import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminFinanceTransactionDetailView } from "@/components/finance/AdminFinanceTransactionDetailView";

export default function AdminFinanceTransactionDetailPage() {
  return (
    <div className="space-y-4 p-4">
      <AdminPageHeader titleKey="admin_page_store_finance" />
      <Suspense fallback={null}>
        <AdminFinanceTransactionDetailView />
      </Suspense>
    </div>
  );
}
