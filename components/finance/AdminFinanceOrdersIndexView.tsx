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
      <h2 className="text-lg font-semibold">{ko ? "주문별 금액 추적" : "Per-order money trace"}</h2>
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
          placeholder={ko ? "주문번호 또는 주문 ID" : "Order number or order ID"}
          aria-label={ko ? "주문번호 또는 주문 ID" : "Order number or order ID"}
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
        />
        <input
          className="min-w-[12rem] rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2"
          placeholder={ko ? "매장 ID (선택)" : "Store ID (optional)"}
          aria-label={ko ? "매장 ID (선택)" : "Store ID (optional)"}
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
        />
        <button type="submit" className="rounded-ui-rect bg-signature px-4 py-2 font-semibold text-white">
          {ko ? "금액 추적 열기" : "Open money trace"}
        </button>
      </form>
      <p className="sam-text-helper text-sam-muted">
        {ko
          ? "고객은 매장에 직접 결제하므로 주문별 지급은 없습니다. 여기서는 한 주문의 금액 흐름(결제·할인·수수료)을 추적합니다. 수수료 부과·검토는 「수수료 내역」에서 확인합니다."
          : "Customers pay the store directly, so there is no per-order payout. This traces one order's money (payment, discounts, fee). Fee charges and reviews are in Fee history."}
      </p>
      <a href="/admin/store-settlements" className="font-semibold text-signature hover:underline">
        {ko ? "수수료 내역 보기" : "View fee history"}
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
