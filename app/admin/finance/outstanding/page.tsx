import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminFinanceOutstandingView } from "@/components/finance/AdminFinanceOutstandingView";

export default function AdminFinanceOutstandingPage() {
  return (
    <div className="space-y-4 p-4">
      <AdminPageHeader titleKey="admin_page_store_finance" />
      <Suspense fallback={null}>
        <AdminFinanceOutstandingView />
      </Suspense>
    </div>
  );
}
