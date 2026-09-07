import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminFinanceOrderDetailView } from "@/components/finance/AdminFinanceOrderDetailView";

export default function AdminFinanceOrderPage() {
  return (
    <div className="space-y-4 p-4">
      <AdminPageHeader titleKey="admin_page_store_finance" />
      <Suspense fallback={null}>
        <AdminFinanceOrderDetailView />
      </Suspense>
    </div>
  );
}
