"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { FinanceAdminNav } from "@/components/finance/FinanceAdminNav";
import { financeOrderHref, financeStoreHref } from "@/lib/finance/routes";

export function AdminFinanceOrdersIndexView() {
  const { language } = useI18n();
  const ko = language !== "en";
  const router = useRouter();
  const [orderId, setOrderId] = useState("");
  const [storeId, setStoreId] = useState("");

  return (
    <div className="space-y-4" data-admin-finance-orders-index="1">
      <FinanceAdminNav ko={ko} />
      <h2 className="text-lg font-semibold">{ko ? "주문별 정산" : "Order settlements"}</h2>
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
          placeholder="Order ID"
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
        />
        <input
          className="min-w-[12rem] rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2"
          placeholder="Store ID (optional)"
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
        />
        <button type="submit" className="rounded-ui-rect bg-signature px-4 py-2 font-semibold text-white">
          {ko ? "주문 정산 열기" : "Open order finance"}
        </button>
      </form>
      <p className="sam-text-helper text-sam-muted">
        {ko
          ? "기존 정산 목록은 /admin/store-settlements 를 유지합니다. 여기서는 Order Money Chain으로 진입합니다."
          : "Keep /admin/store-settlements for payout ops. This opens Order Money Chain."}
      </p>
      <a href="/admin/store-settlements" className="font-semibold text-signature hover:underline">
        {ko ? "정산 지급 목록 열기" : "Open settlement payout list"}
      </a>
      {storeId.trim() ? (
        <div>
          <a
            href={financeStoreHref(storeId.trim())}
            className="font-semibold text-signature hover:underline"
          >
            {ko ? "매장 재무 보기" : "Store finance"}
          </a>
        </div>
      ) : null}
    </div>
  );
}
