"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminMemberMetricGrid, AdminMemberPager } from "@/components/admin/users/AdminMemberMetricGrid";
import {
  memberOrderDetailHref,
  memberOrdersByBuyerHref,
} from "@/lib/admin-users/member-deep-links";
import type { MemberOrdersTabPayload } from "@/lib/admin-users/member-orders-tab";
import { ADMIN_USERS_LITE_CARD } from "@/lib/ui/admin-users-lite-styles";

export function AdminMemberDeliveryPanel({ userId }: { userId: string }) {
  const { t, safeT, language } = useI18n();
  const [page, setPage] = useState(1);
  const [state, setState] = useState<{ kind: "loading" } | { kind: "error" } | { kind: "ok"; data: MemberOrdersTabPayload }>({
    kind: "loading",
  });
  const locale = language === "en" ? "en-US" : "ko-KR";
  const fmt = (value: string | null) => {
    if (!value) return t("admin_users_empty_placeholder");
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? new Date(time).toLocaleString(locale) : value;
  };

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    (async () => {
      try {
        const qs = new URLSearchParams({ page: String(page), pageSize: "10" });
        const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/orders?${qs}`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as MemberOrdersTabPayload & { ok?: boolean };
        if (cancelled) return;
        if (!res.ok || data.ok === false) {
          setState({ kind: "error" });
          return;
        }
        setState({ kind: "ok", data });
      } catch {
        if (!cancelled) setState({ kind: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, page]);

  if (state.kind === "loading") {
    return <div className={`${ADMIN_USERS_LITE_CARD} py-8 text-center text-sm text-[#667085]`}>{t("admin_users_detail_loading")}</div>;
  }
  if (state.kind === "error") {
    return (
      <div className={`${ADMIN_USERS_LITE_CARD} py-8 text-center text-sm font-semibold text-[#b42318]`}>
        {safeT("admin_users_cc_load_failed", { fallbackKo: "불러오기 실패", fallbackEn: "Load failed" })}
      </div>
    );
  }

  const { summary, total, orders } = state.data;
  const hasNext = total.ok && page * 10 < total.value;

  return (
    <div className="space-y-4">
      <AdminMemberMetricGrid
        items={[
          { label: t("admin_users_cc_overview_orders_total"), metric: summary.total },
          { label: t("admin_users_cc_overview_orders_open"), metric: summary.inProgress },
          { label: t("admin_users_cc_overview_orders_done"), metric: summary.completed },
          { label: t("admin_users_cc_overview_orders_cancel"), metric: summary.cancelled },
          {
            label: safeT("admin_users_cc_summary_refunded", { fallbackKo: "환불", fallbackEn: "Refunded" }),
            metric: summary.refunded,
          },
          {
            label: t("admin_users_cc_overview_last_order"),
            metric: summary.lastOrderAt,
            format: (value) => fmt(typeof value === "string" ? value : null),
          },
        ]}
      />
      <div className="flex justify-end">
        <Link href={memberOrdersByBuyerHref(userId)} className="text-xs font-semibold text-[#2563eb]">
          {safeT("admin_users_cc_cta_open_order_admin", { fallbackKo: "Admin 주문관리에서 열기", fallbackEn: "Open in order admin" })}
        </Link>
      </div>
      <div className={`${ADMIN_USERS_LITE_CARD} overflow-x-auto`}>
        <table className="min-w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-[#eaecf0] bg-[#f8fafc] text-left text-[11px] font-semibold uppercase text-[#475467]">
              <th className="px-3 py-2">{safeT("admin_users_cc_col_order_no", { fallbackKo: "주문번호", fallbackEn: "Order no." })}</th>
              <th className="px-3 py-2">{t("admin_users_store_col_store_name")}</th>
              <th className="px-3 py-2">{safeT("admin_users_cc_col_amount", { fallbackKo: "주문금액", fallbackEn: "Amount" })}</th>
              <th className="px-3 py-2">{t("admin_users_lite_col_status")}</th>
              <th className="px-3 py-2">{t("admin_users_col_joined")}</th>
              <th className="px-3 py-2">{t("admin_users_col_actions")}</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((row) => (
              <tr key={row.id} className="border-b border-[#eaecf0]">
                <td className="px-3 py-2 font-medium text-[#101828]">{row.orderNo}</td>
                <td className="px-3 py-2 text-[#475467]">{row.storeName || row.storeId}</td>
                <td className="px-3 py-2 tabular-nums">{row.paymentAmount == null ? "—" : row.paymentAmount.toLocaleString()}</td>
                <td className="px-3 py-2">{row.status}</td>
                <td className="px-3 py-2 tabular-nums text-[#475467]">{fmt(row.createdAt)}</td>
                <td className="px-3 py-2">
                  <Link href={memberOrderDetailHref(row.id)} className="text-xs font-semibold text-[#2563eb]">
                    {safeT("admin_users_cc_cta_order_detail", { fallbackKo: "주문 상세", fallbackEn: "Order detail" })}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {orders.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-[#667085]">
            {safeT("admin_users_cc_empty", { fallbackKo: "항목이 없습니다.", fallbackEn: "No items." })}
          </p>
        ) : null}
      </div>
      <AdminMemberPager page={page} hasNext={hasNext} onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => p + 1)} />
    </div>
  );
}
