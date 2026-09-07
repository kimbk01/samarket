import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminFinanceSettingsView } from "@/components/finance/AdminFinanceSettingsView";

export default function AdminFinanceSettingsPage() {
  return (
    <div className="space-y-4 p-4">
      <AdminPageHeader titleKey="admin_page_store_finance" />
      <Suspense fallback={null}>
        <AdminFinanceSettingsView />
      </Suspense>
    </div>
  );
}
