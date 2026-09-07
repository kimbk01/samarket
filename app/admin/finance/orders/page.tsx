import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminFinanceOrdersIndexView } from "@/components/finance/AdminFinanceOrdersIndexView";

export default function AdminFinanceOrdersPage() {
  return (
    <div className="space-y-4 p-4">
      <AdminPageHeader titleKey="admin_page_store_finance" />
      <Suspense fallback={null}>
        <AdminFinanceOrdersIndexView />
      </Suspense>
    </div>
  );
}
