"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  getDemoBuyerUserId,
  listMemberOrderStatusEventsForBuyer,
} from "@/lib/member-orders/member-order-store";
import { useMemberOrdersVersion } from "@/lib/member-orders/use-member-orders-store";

export function MemberOrderStatusHistoryContent() {
  const { t, tt } = useI18n();
  const v = useMemberOrdersVersion();
  const buyerId = getDemoBuyerUserId();

  const rows = useMemo(() => {
    void v;
    return listMemberOrderStatusEventsForBuyer(buyerId);
  }, [buyerId, v]);

  if (!buyerId) {
    return (
      <p className="rounded-ui-rect border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        {t("member_order_status_history_role_hint")}
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-ui-rect bg-sam-surface p-4 text-sm text-sam-muted ring-1 ring-sam-border-soft">
        {t("member_order_status_history_empty")}
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li
          key={r.id}
          className="rounded-ui-rect border border-sam-border-soft bg-sam-surface px-3 py-3 shadow-sm ring-1 ring-sam-border-soft"
        >
          <div className="flex flex-wrap justify-between gap-1 text-[11px] text-sam-meta">
            <span className="font-mono">{r.status}</span>
            <span>{new Date(r.created_at).toLocaleString("ko-KR")}</span>
          </div>
          <p className="mt-1 text-[14px] font-semibold text-sam-fg">
            {r.store_name}
            <span className="ml-1.5 font-mono text-[12px] font-normal text-sam-muted">
              {r.order_no}
            </span>
          </p>
          <p className="mt-0.5 text-[13px] text-sam-fg">{tt(r.message)}</p>
          <div className="mt-2">
            <Link
              href="/my/store-orders"
              className="text-[12px] font-medium text-signature underline"
            >
              {t("member_order_status_history_delivery_link")}
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
