"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { FinanceAdminNav } from "@/components/finance/FinanceAdminNav";
import { financeOrderHref, financeStoreHref } from "@/lib/finance/routes";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";

export function AdminFinanceOrdersIndexView() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const router = useRouter();
  const [orderId, setOrderId] = useState("");
  const [storeId, setStoreId] = useState("");

  return (
    <div className="space-y-4" data-admin-finance-orders-index="1">
      <FinanceAdminNav ko={ko} />
      <h2 className="text-[16px] font-semibold text-sam-fg">{t("admin_finance_per_order_money_trace")}</h2>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          const oid = orderId.trim();
          if (!oid) return;
          router.push(financeOrderHref(oid, storeId.trim() ? { storeId: storeId.trim() } : null));
        }}
      >
        <input
          className="min-w-[16rem] flex-1 rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2"
          placeholder={t("admin_finance_order_number_or_order_id")}
          aria-label={t("admin_finance_order_number_or_order_id")}
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
        />
        <input
          className="min-w-[12rem] rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2"
          placeholder={t("admin_finance_store_id_optional")}
          aria-label={t("admin_finance_store_id_optional")}
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
        />
        <AdminActionButton type="submit" variant="primary">
          {adminCta("search", ko)}
        </AdminActionButton>
      </form>
      <p className="sam-text-helper text-sam-muted">
        {t("admin_finance_customers_pay_the_store_directly_so")}
      </p>
      <a href="/admin/store-settlements" className="font-semibold text-signature hover:underline">
        {t("admin_finance_view_fee_history")}
      </a>
      {storeId.trim() ? (
        <div>
          <a
            href={financeStoreHref(storeId.trim())}
            className="font-semibold text-signature hover:underline"
          >
            {t("finance_store_finance_cta")}
          </a>
        </div>
      ) : null}
    </div>
  );
}
