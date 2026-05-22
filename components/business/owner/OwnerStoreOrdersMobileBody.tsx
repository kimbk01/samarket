"use client";

import Link from "next/link";
import { Filter, Search } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { OwnerStoreOrderChatSlidePanel } from "@/components/business/owner/OwnerStoreOrderChatSlidePanel";
import { OwnerStoreOrderMockCard } from "@/components/business/owner/OwnerStoreOrderMockCard";
import { useRegisterOwnerMobileAdminHeaderTrailing } from "@/components/business/owner/OwnerMobileAdminHeaderTrailingContext";
import { OWNER_MOBILE_BOTTOM_NAV_PAD_CLASS } from "@/lib/stores/owner-mobile-ui-tokens";
import { formatStoreOrderDeliveryAddressPlain } from "@/lib/addresses/store-order-delivery-address-display";
import type { OwnerStoreOrderListRow } from "@/lib/business/owner-store-order-list-row-bridge";
import {
  orderMatchesStoreTab,
  type StoreOrderTabId,
} from "@/lib/business/store-orders-tab";
const TABS: Array<{ id: StoreOrderTabId; label: string }> = [
  { id: "new", label: "신규주문" },
  { id: "progress", label: "진행중" },
  { id: "shipping", label: "배달중" },
  { id: "done", label: "완료" },
  { id: "cancelled", label: "취소" },
];

function orderMatchesOwnerOpsTab(order: { order_status: string }, tab: StoreOrderTabId): boolean {
  const s = order.order_status;
  switch (tab) {
    case "new":
      return s === "pending";
    case "progress":
      return s === "accepted" || s === "preparing" || s === "ready_for_pickup";
    case "shipping":
      return s === "delivering" || s === "arrived";
    case "done":
      return s === "completed";
    case "cancelled":
      return s === "cancelled" || s === "refunded" || s === "refund_requested";
    default:
      return orderMatchesStoreTab(order, tab);
  }
}

export function OwnerStoreOrdersMobileBody({
  storeId,
  storeName,
  orders,
  tab,
  highlightOrderId,
  highlightChatOrderId,
  summaryCounts,
  onTabHref,
  onUpdated,
  onOrderStatusPatched,
  onOpenDetail,
  onCloseDetail,
  onOpenChat,
  onCloseChat,
}: {
  storeId: string;
  storeName: string;
  orders: OwnerStoreOrderListRow[];
  tab: StoreOrderTabId;
  highlightOrderId: string;
  highlightChatOrderId: string;
  summaryCounts: { pending: number; preparing: number; delivering: number; doneToday: number };
  onTabHref: (tabId: StoreOrderTabId) => string;
  onUpdated: () => void | Promise<void>;
  onOrderStatusPatched?: (orderId: string) => void;
  onOpenDetail: (orderId: string) => void;
  onCloseDetail: () => void;
  onOpenChat: (orderId: string) => void;
  onCloseChat: () => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterFulfillment, setFilterFulfillment] = useState<"all" | "local_delivery" | "pickup">("all");
  const [sortNewestFirst, setSortNewestFirst] = useState(true);
  const effectiveTab: StoreOrderTabId = tab === "all" ? "new" : tab;

  const tabCounts = useMemo(() => {
    const m = new Map<StoreOrderTabId, number>();
    for (const t of TABS) {
      m.set(
        t.id,
        orders.filter((o) => orderMatchesOwnerOpsTab(o, t.id)).length
      );
    }
    return m;
  }, [orders]);

  const displayOrders = useMemo(() => {
    let list = orders.filter((o) => orderMatchesOwnerOpsTab(o, effectiveTab));
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

  const chatOrder = highlightChatOrderId
    ? orders.find((o) => o.id === highlightChatOrderId) ?? null
    : null;

  const filterLabel =
    filterFulfillment === "all"
      ? "전체 유형"
      : filterFulfillment === "local_delivery"
        ? "배달만"
        : "포장만";

  const onOpenSearch = useCallback(() => setSearchOpen((v) => !v), []);
  const onOpenFilter = useCallback(
    () =>
      setFilterFulfillment((f) =>
        f === "all" ? "local_delivery" : f === "local_delivery" ? "pickup" : "all"
      ),
    []
  );

  const headerTrailing = useMemo(
    () => (
      <div className="flex shrink-0 items-center justify-end gap-0">
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#262626] hover:bg-[#F5F5F5]"
          aria-label="주문 검색"
        >
          <Search className="h-[18px] w-[18px]" aria-hidden />
        </button>
        <button
          type="button"
          onClick={onOpenFilter}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#262626] hover:bg-[#F5F5F5]"
          aria-label="주문 필터"
        >
          <Filter className="h-[18px] w-[18px]" aria-hidden />
        </button>
      </div>
    ),
    [onOpenFilter, onOpenSearch]
  );
  useRegisterOwnerMobileAdminHeaderTrailing(headerTrailing);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-[#f6f6f6]">
      <div className="shrink-0 border-b border-[#DDE5E0] bg-[#f6f6f6] px-3 pb-2 pt-2">
        <div className="flex rounded-[4px] border border-[#DDE5E0] bg-white p-1">
          {TABS.map((t) => {
              const active = effectiveTab === t.id;
              const count = tabCounts.get(t.id) ?? 0;
              return (
                <Link
                  key={t.id}
                  href={onTabHref(t.id)}
                  scroll={false}
                  className={`relative flex min-h-10 flex-1 flex-col items-center justify-center rounded-[4px] px-1 py-1.5 text-[12px] font-bold leading-[1.35] ${
                    active ? "bg-[#1C8DB8] text-white" : "text-[#123B4A]"
                  }`}
                >
                  <span>
                    {t.label}
                    {count > 0 ? ` ${count}` : ""}
                  </span>
                </Link>
              );
            })}
          </div>

          <div className="mt-2 grid grid-cols-4 gap-1.5">
            <KpiCard
              label="신규 주문"
              value={summaryCounts.pending}
              tone="text-[#B42318]"
              href={onTabHref("new")}
            />
            <KpiCard
              label="준비(조리)중"
              value={summaryCounts.preparing}
              tone="text-[#B45309]"
              href={onTabHref("preparing")}
            />
            <KpiCard
              label="배달중"
              value={summaryCounts.delivering}
              tone="text-[#1C8DB8]"
              href={onTabHref("shipping")}
            />
            <KpiCard
              label="오늘 완료"
              value={summaryCounts.doneToday}
              tone="text-[#123B4A]"
              href={onTabHref("done")}
            />
          </div>

          {searchOpen ? (
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="주문번호·구매자·전화번호 검색"
              className="mt-2 w-full rounded-[4px] border border-[#DDE5E0] bg-white px-3 py-2.5 text-[14px] leading-[1.35] outline-none placeholder:text-[#9CA3AF] focus:border-[#1C8DB8]"
            />
          ) : null}

          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[12px] leading-[1.35] text-[#6B7280]">{filterLabel}</span>
            <button
              type="button"
              onClick={() => setSortNewestFirst((v) => !v)}
              className="rounded-[4px] border border-[#DDE5E0] bg-white px-2.5 py-1 text-[12px] font-bold leading-[1.35] text-[#123B4A]"
            >
              {sortNewestFirst ? "최신순 ▾" : "오래된순 ▾"}
            </button>
          </div>
      </div>

      <main
        className={`min-h-0 flex-1 overflow-y-auto overscroll-y-contain ${OWNER_MOBILE_BOTTOM_NAV_PAD_CLASS}`}
      >
        <div className="space-y-2.5 px-3 py-3">
          {displayOrders.length === 0 ? (
            <div className="rounded-[4px] border border-[#DDE5E0] bg-white p-6 text-center text-[14px] leading-[1.35] text-[#6B7280]">
              <p className="font-bold text-[#123B4A]">표시할 주문이 없습니다</p>
              <p className="mt-1">다른 탭을 선택하거나 필터를 바꿔 보세요.</p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {displayOrders.map((o) => (
                <OwnerStoreOrderMockCard
                  key={o.id}
                  storeId={storeId}
                  order={o}
                  onUpdated={onUpdated}
                  onOrderStatusPatched={onOrderStatusPatched}
                  isHighlight={highlightOrderId === o.id || highlightChatOrderId === o.id}
                  isExpanded={highlightOrderId === o.id && !highlightChatOrderId}
                  onToggleExpanded={() => {
                    if (highlightOrderId === o.id && !highlightChatOrderId) {
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

      {highlightChatOrderId ?
        <OwnerStoreOrderChatSlidePanel
          orderId={highlightChatOrderId}
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
}: {
  label: string;
  value: number;
  tone: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className="rounded-[4px] border border-[#DDE5E0] bg-white px-2 py-2 text-center shadow-sm active:bg-[#EEF6F2]"
    >
      <p className="text-[10px] font-semibold leading-[1.35] text-[#6B7280]">{label}</p>
      <p className={`mt-0.5 text-[17px] font-bold tabular-nums ${tone}`}>{value}</p>
    </Link>
  );
}
