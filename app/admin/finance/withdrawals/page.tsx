import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCoinWithdrawalsPanel } from "@/components/admin/finance/AdminCoinWithdrawalsPanel";
import { AdminFinanceWithdrawalsShell } from "@/components/finance/AdminFinanceWithdrawalsShell";

/** Withdrawals reuse Coin withdrawal panel — Cash withdrawal does not exist. */
export default function AdminFinanceWithdrawalsPage() {
  return (
    <div className="space-y-4 p-4">
      <AdminPageHeader titleKey="admin_page_store_finance" />
      <Suspense fallback={null}>
        <AdminFinanceWithdrawalsShell>
          <AdminCoinWithdrawalsPanel />
        </AdminFinanceWithdrawalsShell>
      </Suspense>
    </div>
  );
}
