import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminFinanceConversionsView } from "@/components/finance/AdminFinanceConversionsView";

/** Coin→Cash conversion list — not a redirect to raw filtered txs. */
export default function AdminFinanceConversionsPage() {
  return (
    <div className="space-y-4 p-4">
      <AdminPageHeader titleKey="admin_page_store_finance" />
      <Suspense fallback={null}>
        <AdminFinanceConversionsView />
      </Suspense>
    </div>
  );
}
