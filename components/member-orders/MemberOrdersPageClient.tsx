"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import {
  filterMemberOrdersByTab,
  getDemoBuyerUserId,
  listMemberOrdersForBuyer,
  requestMemberOrderCancel,
  resetMemberOrdersMock,
} from "@/lib/member-orders/member-order-store";
import type { MemberOrder, MemberOrderTab } from "@/lib/member-orders/types";
import { useMemberOrdersVersion } from "@/lib/member-orders/use-member-orders-store";
import { CancelOrderRequestModal } from "./CancelOrderRequestModal";
import { MemberNotificationBell } from "./MemberNotificationBell";
import { MemberOrderList } from "./MemberOrderList";
import { MemberOrderTabs } from "./MemberOrderTabs";

const BASE = "/mypage/store-orders";

export function MemberOrdersPageClient() {
  const { t } = useI18n();
  const v = useMemberOrdersVersion();
  const buyerId = getDemoBuyerUserId();
  const [tab, setTab] = useState<MemberOrderTab>("all");
  const [toast, setToast] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<MemberOrder | null>(null);

  const all = useMemo(() => {
    void v;
    return listMemberOrdersForBuyer(buyerId);
  }, [buyerId, v]);

  const filtered = useMemo(() => {
    const rows = filterMemberOrdersByTab(all, tab);
    return [...rows].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [all, tab]);

  const counts = useMemo(() => {
    const keys: MemberOrderTab[] = ["all", "active", "done", "issue"];
    const o: Record<MemberOrderTab, number> = {
      all: 0,
      active: 0,
      done: 0,
      issue: 0,
    };
    for (const k of keys) o[k] = filterMemberOrdersByTab(all, k).length;
    return o;
  }, [all]);

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <header className="sticky top-0 z-10 border-b border-gray-100 bg-white px-2 py-2">
        <div className="mx-auto flex max-w-lg items-center gap-2">
          <AppBackButton backHref="/my" />
          <h1 className="min-w-0 flex-1 truncate text-center text-[16px] font-bold text-gray-900">
            {t("member_orders_title")}
          </h1>
          <div className="flex shrink-0 items-center gap-1">
            <MemberNotificationBell />
            <button
              type="button"
              className="shrink-0 text-[11px] text-gray-500 underline"
              onClick={() => {
                if (confirm(t("member_orders_reset_confirm"))) resetMemberOrdersMock();
              }}
            >
              {t("common_reset_filters")}
            </button>
          </div>
        </div>
        <p className="mx-auto max-w-lg px-3 pb-2 text-center text-[11px] text-gray-500">
          {t("member_orders_simulation_hint")}
        </p>
      </header>

      <div className="mx-auto max-w-lg space-y-4 px-3 pt-4">
        {toast ? (
          <p className="rounded-xl bg-gray-900 px-3 py-2 text-center text-xs text-white">{toast}</p>
        ) : null}

        {!buyerId ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-center text-xs text-amber-950">
            {t("member_orders_member_only")}
          </p>
        ) : null}

        <MemberOrderTabs active={tab} onChange={setTab} counts={counts} />

        <p className="text-xs text-gray-500">
          <Link href="/my/store-orders" className="text-violet-700 underline">
            {t("member_orders_chat_list")}
          </Link>
          {" · "}
          {t("member_orders_store_orders_prefix")}{" "}
          <Link href="/mypage/store-orders" className="text-violet-700 underline">
            {t("member_orders_store_orders_link")}
          </Link>
          {t("member_orders_link_suffix")}
        </p>

        <MemberOrderList
          orders={filtered}
          basePath={BASE}
          onOpenCancel={setCancelTarget}
        />
      </div>

      <CancelOrderRequestModal
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={(label, detail) => {
          if (!cancelTarget) return;
          const r = requestMemberOrderCancel(buyerId, cancelTarget.id, label, detail);
          setToast(r.ok ? t("member_orders_cancel_requested") : r.error);
          setTimeout(() => setToast(null), 2800);
        }}
      />
    </div>
  );
}
