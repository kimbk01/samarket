import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminFinanceAdsView } from "@/components/finance/AdminFinanceAdsView";

export default function AdminFinanceAdsPage() {
  return (
    <div className="space-y-4 p-4">
      <AdminPageHeader titleKey="admin_page_store_finance" />
      <Suspense fallback={null}>
        <AdminFinanceAdsView />
      </Suspense>
    </div>
  );
}
