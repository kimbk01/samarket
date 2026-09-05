"use client";

import { Filter, Search } from "lucide-react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { OwnerStoreOrderChatSlidePanel } from "@/components/business/owner/OwnerStoreOrderChatSlidePanel";
import { OwnerStoreOrderMockCard } from "@/components/business/owner/OwnerStoreOrderMockCard";
import { useRegisterOwnerMobileAdminHeaderTrailing } from "@/components/business/owner/OwnerMobileAdminHeaderTrailingContext";
import { formatStoreOrderDeliveryAddressPlain } from "@/lib/addresses/store-order-delivery-address-display";
import type {
  OwnerStoreOrderListRow,
} from "@/lib/business/owner-store-order-list-row-bridge";
import type { StoreOrderTabId } from "@/lib/business/store-orders-tab";
import {
  effectiveOwnerMobileOrdersTab,
  orderMatchesOwnerMobileOrdersTab,
  OWNER_MOBILE_ORDER_TAB_IDS,
} from "@/lib/business/owner-mobile-orders-tab";
import { buildOwnerMobileStackedLabelCountAriaLabel } from "@/lib/business/owner-mobile-stacked-label-count";
import { OwnerMobileStackedLabelCount } from "@/components/business/owner/OwnerMobileStackedLabelCount";
import { OWNER_COMPACT_SHELL_BODY_SCROLL_CLASS } from "@/lib/stores/owner-mobile-ui-tokens";
const TABS: Array<{ id: StoreOrderTabId; labelKey: MessageKey }> = OWNER_MOBILE_ORDER_TAB_IDS.map(
  (id) => {
    const labelById: Record<(typeof OWNER_MOBILE_ORDER_TAB_IDS)[number], MessageKey> = {
      new: "store_owner_mobile_tab_new_orders",
      progress: "store_owner_mobile_tab_progress",
      shipping: "store_owner_mobile_tab_shipping",
      done: "store_owner_mobile_tab_done",
      cancelled: "store_owner_mobile_tab_cancelled",
    };
    return { id, labelKey: labelById[id] };
  }
);

export function OwnerStoreOrdersMobileBody({
  storeId,
  storeName,
  orders,
  tab,
  expandedOrderId,
  chatOrderId,
  summaryCounts,
  onTabHref,
  onSelectTab,
  onUpdated,
  onPatchOrderRow,
  onReconcileOrder,
  onOrderStatusPatched,
  onOpenDetail,
  onCloseDetail,
  onOpenChat,
  onCloseChat,
  onCollapseTransient,
  deepLinkMissBanner = null,
  scrollToHighlightOrderId = "",
}: {
  storeId: string;
  storeName: string;
  orders: OwnerStoreOrderListRow[];
  tab: StoreOrderTabId;
  expandedOrderId: string;
  chatOrderId: string;
  summaryCounts: { pending: number; preparing: number; delivering: number; doneToday: number };
  deepLinkMissBanner?: ReactNode;
  /** 알림·대시보드 딥링크 — 목록 스크롤 영역에서 카드로 이동 */
  scrollToHighlightOrderId?: string;
  onTabHref: (tabId: StoreOrderTabId) => string;
  onSelectTab: (tabId: StoreOrderTabId) => void;
  onUpdated: () => void | Promise<void>;
  onPatchOrderRow: (orderId: string, patch: Partial<OwnerStoreOrderListRow>) => void;
  onReconcileOrder?: (orderId: string) => void | Promise<void>;
  onOrderStatusPatched?: (orderId: string) => void;
  onOpenDetail: (orderId: string) => void;
  onCloseDetail: () => void;
  onOpenChat: (orderId: string) => void;
  onCloseChat: () => void;
  onCollapseTransient: () => void;
}) {
  const { t } = useI18n();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterFulfillment, setFilterFulfillment] = useState<"all" | "local_delivery" | "pickup">("all");
  const [sortNewestFirst, setSortNewestFirst] = useState(true);
  const effectiveTab = effectiveOwnerMobileOrdersTab(tab);
  const listScrollRef = useRef<HTMLElement | null>(null);
  const scrolledHighlightRef = useRef<string | null>(null);

  const tabCounts = useMemo(() => {
    const m = new Map<StoreOrderTabId, number>();
    for (const t of TABS) {
      m.set(
        t.id,
        orders.filter((o) => orderMatchesOwnerMobileOrdersTab(o, t.id)).length
      );
    }
    return m;
  }, [orders]);

  const displayOrders = useMemo(() => {
    let list = orders.filter((o) => orderMatchesOwnerMobileOrdersTab(o, effectiveTab));
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((o) => {
        const hay = [
          o.order_no,
          o.buyer_public_label,
          o.buyer_phone,
          formatStoreOrderDeliveryAddressPlain({
            summary: o.delivery_address_summary,
            detail: o.delivery_address_detail,
          }),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    if (filterFulfillment !== "all") {
      list = list.filter((o) => o.fulfillment_type === filterFulfillment);
    }
    list = [...list].sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return sortNewestFirst ? tb - ta : ta - tb;
    });
    return list;
  }, [orders, effectiveTab, searchQuery, filterFulfillment, sortNewestFirst]);

  const scrollHighlightId = (scrollToHighlightOrderId || expandedOrderId).trim();

  useLayoutEffect(() => {
    const oid = scrollHighlightId;
    if (!oid) {
      scrolledHighlightRef.current = null;
      return;
    }
    if (scrolledHighlightRef.current !== null && scrolledHighlightRef.current !== oid) {
      scrolledHighlightRef.current = null;
    }
    if (!displayOrders.some((o) => o.id === oid)) return;
    if (scrolledHighlightRef.current === oid) return;
    scrolledHighlightRef.current = oid;
    const el = document.getElementById(`owner-order-${oid}`);
    if (!el) return;
    const host = listScrollRef.current;
    if (host && typeof host.scrollTo === "function") {
      const top =
        el.getBoundingClientRect().top -
        host.getBoundingClientRect().top +
        host.scrollTop;
      host.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      return;
    }
    el.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [scrollHighlightId, displayOrders, expandedOrderId, effectiveTab]);

  const chatOrder = chatOrderId ? orders.find((o) => o.id === chatOrderId) ?? null : null;

  const filterLabel =
    filterFulfillment === "all"
      ? t("store_owner_mobile_filter_all_types")
      : filterFulfillment === "local_delivery"
        ? t("store_owner_mobile_filter_delivery_only")
        : t("store_owner_mobile_filter_pickup_only");

  const onOpenSearch = useCallback(() => {
    onCollapseTransient();
    setSearchOpen((v) => !v);
  }, [onCollapseTransient]);
  const onOpenFilter = useCallback(
    () => {
      onCollapseTransient();
      setFilterFulfillment((f) =>
        f === "all" ? "local_delivery" : f === "local_delivery" ? "pickup" : "all"
      );
    },
    [onCollapseTransient]
  );

  const headerTrailing = useMemo(
    () => (
      <div className="flex shrink-0 items-center justify-end gap-0">
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#262626] hover:bg-[#F5F5F5]"
          aria-label={t("store_owner_mobile_aria_search")}
        >
          <Search className="h-[18px] w-[18px]" aria-hidden />
        </button>
        <button
          type="button"
          onClick={onOpenFilter}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#262626] hover:bg-[#F5F5F5]"
          aria-label={t("store_owner_mobile_aria_filter")}
        >
          <Filter className="h-[18px] w-[18px]" aria-hidden />
        </button>
      </div>
    ),
    [onOpenFilter, onOpenSearch, t]
  );
  useRegisterOwnerMobileAdminHeaderTrailing(headerTrailing);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-[#f6f6f6]">
      <div className="shrink-0 border-b border-[#DDE5E0] bg-[#f6f6f6] pb-2 pt-2">
        <div className="flex rounded-[4px] border border-[#DDE5E0] bg-white p-1">
          {TABS.map((tabDef) => {
              const active = effectiveTab === tabDef.id;
              const count = tabCounts.get(tabDef.id) ?? 0;
              return (
                <a
                  key={tabDef.id}
                  href={onTabHref(tabDef.id)}
                  aria-current={active ? "page" : undefined}
                  aria-label={buildOwnerMobileStackedLabelCountAriaLabel(t(tabDef.labelKey), count)}
                  onClick={(e) => {
                    e.preventDefault();
                    onSelectTab(tabDef.id);
                  }}
                  className={`relative flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center rounded-[4px] px-0.5 py-1.5 ${
                    active ? "bg-[var(--biz-primary)] text-white" : "text-[var(--biz-text)]"
                  }`}
                >
                  <OwnerMobileStackedLabelCount
                    variant="tab"
                    label={t(tabDef.labelKey)}
                    count={count}
                    active={active}
                  />
                </a>
              );
            })}
          </div>

          <div className="mt-2 grid grid-cols-4 gap-1">
            <KpiCard
              label={t("store_owner_mobile_kpi_new")}
              value={summaryCounts.pending}
              tone="text-[#B42318]"
              href={onTabHref("new")}
              onSelect={() => onSelectTab("new")}
              compact
            />
            <KpiCard
              label={t("store_owner_mobile_kpi_preparing")}
              value={summaryCounts.preparing}
              tone="text-[#B45309]"
              href={onTabHref("preparing")}
              onSelect={() => onSelectTab("preparing")}
              compact
            />
            <KpiCard
              label={t("store_owner_mobile_kpi_delivering")}
              value={summaryCounts.delivering}
              tone="text-[var(--biz-primary)]"
              href={onTabHref("shipping")}
              onSelect={() => onSelectTab("shipping")}
              compact
            />
            <KpiCard
              label={t("store_owner_mobile_kpi_done_today")}
              value={summaryCounts.doneToday}
              tone="text-[var(--biz-text)]"
              href={onTabHref("done")}
              onSelect={() => onSelectTab("done")}
              compact
            />
          </div>

          {summaryCounts.pending > 0 ? (
            <a
              href={onTabHref("new")}
              onClick={(e) => {
                e.preventDefault();
                onSelectTab("new");
              }}
              className="mt-2 flex min-h-11 w-full items-center justify-center whitespace-nowrap rounded-ui-rect bg-[#DC2626] px-3 text-sm font-bold text-white active:bg-red-700"
              data-owner-orders-action-required="1"
              data-owner-cta="danger"
            >
              {t("store_owner_dash_review_orders_btn")}
              {` · ${summaryCounts.pending}`}
            </a>
          ) : null}

          {searchOpen ? (
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("store_owner_mobile_search_placeholder")}
              className="mt-2 w-full rounded-[4px] border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] px-3 py-2.5 text-[14px] leading-[1.35] outline-none placeholder:text-[var(--biz-text-muted)] focus:border-[var(--biz-primary)]"
            />
          ) : null}

          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[12px] leading-[1.35] text-[#6B7280]">{filterLabel}</span>
            <button
              type="button"
              onClick={() => {
                onCollapseTransient();
                setSortNewestFirst((v) => !v);
              }}
              className="rounded-[4px] border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] px-2.5 py-1 text-[12px] font-bold leading-[1.35] text-[var(--biz-text)]"
            >
              {sortNewestFirst ? t("store_owner_mobile_sort_newest") : t("store_owner_mobile_sort_oldest")}
            </button>
          </div>
      </div>

      <main
        ref={(el) => {
          listScrollRef.current = el;
        }}
        className={`${OWNER_COMPACT_SHELL_BODY_SCROLL_CLASS} min-h-0 flex-1 pb-[max(0.5rem,var(--safe-bottom))]`}
        data-owner-scroll-host="orders-list"
      >
        <div className="space-y-2.5 py-3">
          {deepLinkMissBanner}
          {displayOrders.length === 0 ? (
            <div className="rounded-[4px] border border-[#DDE5E0] bg-white p-6 text-center text-[14px] leading-[1.35] text-[#6B7280]">
              <p className="font-bold text-[var(--biz-text)]">{t("store_owner_mobile_empty_title")}</p>
              <p className="mt-1">{t("store_owner_mobile_empty_hint")}</p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {displayOrders.map((o) => (
                <OwnerStoreOrderMockCard
                  key={o.id}
                  storeId={storeId}
                  order={o}
                  onUpdated={onUpdated}
                  onPatchOrderRow={onPatchOrderRow}
                  onReconcileOrder={onReconcileOrder}
                  onOrderStatusPatched={onOrderStatusPatched}
                  isHighlight={expandedOrderId === o.id || chatOrderId === o.id}
                  isExpanded={expandedOrderId === o.id && !chatOrderId}
                  onToggleExpanded={() => {
                    if (expandedOrderId === o.id && !chatOrderId) {
                      onCloseDetail();
                    } else {
                      onOpenDetail(o.id);
                    }
                  }}
                  onOpenChat={() => onOpenChat(o.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </main>

      {chatOrderId ?
        <OwnerStoreOrderChatSlidePanel
          orderId={chatOrderId}
          order={chatOrder}
          storeId={storeId}
          storeName={storeName}
          onClose={onCloseChat}
        />
      : null}
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone,
  href,
  onSelect,
  compact = false,
}: {
  label: string;
  value: number;
  tone: string;
  href: string;
  onSelect: () => void;
  compact?: boolean;
}) {
  return (
    <a
      href={href}
      aria-label={buildOwnerMobileStackedLabelCountAriaLabel(label, value)}
      onClick={(e) => {
        e.preventDefault();
        onSelect();
      }}
      className={
        compact
          ? "rounded-[4px] border border-[#DDE5E0] bg-white px-1.5 py-1 text-center shadow-sm active:bg-[#EEF6F2]"
          : "rounded-[4px] border border-[#DDE5E0] bg-white px-2 py-2 text-center shadow-sm active:bg-[#EEF6F2]"
      }
      data-owner-orders-kpi={compact ? "compact" : "default"}
    >
      <OwnerMobileStackedLabelCount
        variant="kpi"
        label={label}
        count={value}
        countClassName={tone}
      />
    </a>
  );
}
