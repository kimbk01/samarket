"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import Link from "next/link";
import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";
import { requireAuthAction } from "@/lib/auth/require-auth-action";
import {
  type StoreOrdersHubFilter,
  ordersHubHref,
} from "@/lib/stores/store-orders-hub-filter";
import type { MessageKey } from "@/lib/i18n/messages";

const FILTER_CHIP_KEYS: { key: StoreOrdersHubFilter; labelKey: MessageKey }[] = [
  { key: "all", labelKey: "store_owner_tab_all" },
  { key: "receiving", labelKey: "store_order_dash_chip_receiving" },
  { key: "preparing", labelKey: "store_order_dash_chip_preparing" },
  { key: "delivering", labelKey: "store_order_dash_chip_delivering" },
  { key: "done", labelKey: "store_owner_tab_done" },
  { key: "issue", labelKey: "store_owner_tab_issue_short" },
];

const RAIL =
  "flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export type StoreOrderDashboardBuyerState =
  | { kind: "idle" | "loading" }
  | {
      kind: "ready";
      activeOrders: number;
      totalOrders: number;
      orderChatRooms: number;
      unreadChats: number;
    };

export type RecentOrderPreview = {
  id: string;
  store_name: string;
  order_status: string;
  created_at: string;
};

export function StoreOrderDashboardSection({
  buyerState,
  recentOrder,
  embedded = false,
}: {
  buyerState: StoreOrderDashboardBuyerState;
  recentOrder: RecentOrderPreview | null;
  /** 매장 탭 하단 묶음 안에서 — 카드 테두리·제목 중복 제거 */
  embedded?: boolean;
}) {
  const { t } = useI18n();
  const shell = embedded ? "rounded-ui-rect bg-sam-app/90 p-2" : "rounded-ui-rect border border-sam-border-soft bg-sam-surface p-3 shadow-sm";
  const shellReady = embedded ?
    "space-y-2 p-0"
  : "rounded-ui-rect border border-sam-border-soft bg-sam-surface p-3 shadow-sm ring-1 ring-black/[0.03]";

  if (buyerState.kind !== "ready") {
    const loadingHint =
      buyerState.kind === "loading" ? t("store_order_dash_loading_hint") : null;
    return (
      <section className={shell}>
        {!embedded ?
          <h2 className="sam-text-body font-bold text-sam-fg">{t("store_my_orders_title")}</h2>
        : null}
        <p className="mt-1 sam-text-xxs text-sam-muted">
          {loadingHint ?? t("store_order_dash_guest_hint")}
        </p>
        <div className={`mt-3 ${RAIL}`}>
          <button
            type="button"
            onClick={() => {
              void requireAuthAction("delivery_order", async () => {}, { next: "/orders" });
            }}
            className="flex w-[120px] shrink-0 flex-col justify-center rounded-ui-rect bg-sam-ink px-3 py-3 text-center sam-text-helper font-bold text-white"
          >
            {t("store_order_dash_login")}
          </button>
          <Link
            href="/orders"
            className="flex w-[120px] shrink-0 flex-col justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-center sam-text-helper font-semibold text-sam-fg"
          >
            {t("store_order_dash_hub")}
          </Link>
        </div>
      </section>
    );
  }

  const b = buyerState;

  return (
    <section className={shellReady}>
      {!embedded ?
        <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
          <h2 className="sam-text-body font-bold tracking-tight text-sam-fg">{t("store_my_orders_title")}</h2>
          <div className="flex items-center gap-2">
            {b.unreadChats > 0 ?
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 sam-text-xxs font-bold text-white">
                {b.unreadChats > 99 ? "99+" : b.unreadChats}
              </span>
            : null}
            <Link href="/orders" className="sam-text-helper font-semibold text-signature">
              {t("store_order_dash_all_count", { count: b.totalOrders })}
            </Link>
          </div>
        </div>
      : <div className="mb-1 flex items-center justify-end gap-2 px-0.5">
          {b.unreadChats > 0 ?
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 sam-text-xxs font-bold text-white">
              {b.unreadChats > 99 ? "99+" : b.unreadChats}
            </span>
          : null}
          <Link href="/orders" className="sam-text-helper font-semibold text-signature">
            {t("store_order_dash_all_count", { count: b.totalOrders })}
          </Link>
        </div>
      }

      <HorizontalDragScroll className={RAIL} aria-label={t("store_order_shortcuts_aria")}>
        <Link
          href={ordersHubHref("receiving")}
          className="flex w-[132px] shrink-0 flex-col rounded-ui-rect bg-sam-app p-3 ring-1 ring-sam-border-soft"
        >
          <span className="sam-text-xxs font-medium text-sam-muted">{t("store_in_progress")}</span>
          <span className="mt-1 sam-text-hero font-bold tabular-nums text-sam-fg">{b.activeOrders}</span>
          <span className="mt-2 sam-text-xxs font-semibold text-signature">{t("store_history")}</span>
        </Link>
        <Link
          href="/my/store-orders"
          className="flex w-[132px] shrink-0 flex-col rounded-ui-rect bg-sam-app p-3 ring-1 ring-sam-border-soft"
        >
          <span className="sam-text-xxs font-medium text-sam-muted">{t("store_order_chat")}</span>
          <span className="mt-1 sam-text-hero font-bold tabular-nums text-sam-fg">{b.orderChatRooms}</span>
          <span className="mt-2 sam-text-xxs font-semibold text-signature">
            {b.unreadChats > 0 ? `+${b.unreadChats}` : t("store_order_dash_open")}
          </span>
        </Link>
        {recentOrder ?
          <Link
            href={`/orders?expand=${encodeURIComponent(recentOrder.id)}`}
            className="flex w-[148px] shrink-0 flex-col rounded-ui-rect border border-dashed border-signature/30 bg-signature/[0.04] p-3"
          >
            <span className="sam-text-xxs font-medium text-sam-muted">{t("store_recent")}</span>
            <span className="mt-1 line-clamp-2 sam-text-helper font-bold leading-tight text-sam-fg">
              {recentOrder.store_name || t("store_fallback_name")}
            </span>
            <span className="mt-auto pt-2 sam-text-xxs font-semibold text-signature">{t("store_detail_link")}</span>
          </Link>
        : <Link
            href="/stores#store-industry-explore"
            className="flex w-[132px] shrink-0 flex-col rounded-ui-rect border border-sam-border p-3"
          >
            <span className="sam-text-xxs font-medium text-sam-muted">{t("store_recent")}</span>
            <span className="mt-2 sam-text-helper text-sam-muted">{t("store_no_orders")}</span>
            <span className="mt-auto pt-2 sam-text-xxs font-semibold text-signature">{t("store_find_industry")}</span>
          </Link>
        }
      </HorizontalDragScroll>

      <div className="mt-3 border-t border-sam-border-soft pt-2">
        <p className="mb-1.5 px-0.5 sam-text-xxs font-semibold uppercase tracking-wide text-sam-meta">{t("store_status_label")}</p>
        <HorizontalDragScroll className={RAIL} aria-label={t("store_order_status_filter_aria")}>
          {FILTER_CHIP_KEYS.map(({ key, labelKey }) => (
            <Link
              key={key}
              href={ordersHubHref(key)}
              className="shrink-0 rounded-full border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-xxs font-semibold text-sam-fg shadow-sm"
            >
              {t(labelKey)}
            </Link>
          ))}
        </HorizontalDragScroll>
      </div>
    </section>
  );
}
