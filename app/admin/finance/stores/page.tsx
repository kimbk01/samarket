import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminFinanceStoresIndexView } from "@/components/finance/AdminFinanceStoreViews";

export default function AdminFinanceStoresPage() {
  return (
    <div className="space-y-4 p-4">
      <AdminPageHeader titleKey="admin_menu_finance_stores" />
      <Suspense fallback={null}>
        <AdminFinanceStoresIndexView />
      </Suspense>
    </div>
  );
}
