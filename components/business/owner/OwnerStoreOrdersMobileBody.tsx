"use client";

import Link from "next/link";
import { Filter, Search } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
  OwnerStoreOrderDetailLoadingPanel,
  OwnerStoreOrderDetailPanel,
} from "@/components/business/owner/OwnerStoreOrderDetailPanel";
import { OwnerStoreOrderMockCard } from "@/components/business/owner/OwnerStoreOrderMockCard";
import { useRegisterOwnerMobileAdminHeaderTrailing } from "@/components/business/owner/OwnerMobileAdminHeaderTrailingContext";
import { OWNER_MOBILE_BOTTOM_NAV_PAD_CLASS } from "@/lib/stores/owner-mobile-ui-tokens";
import type { OwnerStoreOrderListRow } from "@/lib/business/owner-store-order-list-row-bridge";
import {
  orderMatchesStoreTab,
  type StoreOrderTabId,
} from "@/lib/business/store-orders-tab";
const TABS: Array<{ id: StoreOrderTabId; label: string }> = [
  { id: "all", label: "전체" },
  { id: "new", label: "신규" },
  { id: "progress", label: "진행중" },
  { id: "done", label: "완료" },
  { id: "cancelled", label: "취소" },
];

export function OwnerStoreOrdersMobileBody({
  storeId,
  orders,
  tab,
  highlightOrderId,
  summaryCounts,
  onTabHref,
  onUpdated,
  onOpenDetail,
  onCloseDetail,
}: {
  storeId: string;
  orders: OwnerStoreOrderListRow[];
  tab: StoreOrderTabId;
  highlightOrderId: string;
  summaryCounts: { pending: number; preparing: number; delivering: number; doneToday: number };
  onTabHref: (tabId: StoreOrderTabId) => string;
  onUpdated: () => void;
  onOpenDetail: (orderId: string) => void;
  onCloseDetail: () => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterFulfillment, setFilterFulfillment] = useState<"all" | "local_delivery" | "pickup">("all");
  const [sortNewestFirst, setSortNewestFirst] = useState(true);

  const tabCounts = useMemo(() => {
    const m = new Map<StoreOrderTabId, number>();
    for (const t of TABS) {
      m.set(
        t.id,
        orders.filter((o) => orderMatchesStoreTab(o, t.id)).length
      );
    }
    return m;
  }, [orders]);

  const displayOrders = useMemo(() => {
    let list = orders.filter((o) => orderMatchesStoreTab(o, tab));
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((o) => {
        const hay = [
          o.order_no,
          o.buyer_public_label,
          o.buyer_phone,
          o.delivery_address_summary,
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
  }, [orders, tab, searchQuery, filterFulfillment, sortNewestFirst]);

  const detailOrder = highlightOrderId
    ? orders.find((o) => o.id === highlightOrderId) ?? null
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
    <div className="flex h-full min-h-0 w-full flex-col bg-[#F3F4F6]">
      <div className="shrink-0 border-b border-[#E5E7EB] bg-[#F3F4F6] px-3 pb-2 pt-2">
        <div className="flex border-b border-[#E5E7EB] bg-white">
          {TABS.map((t) => {
              const active = tab === t.id;
              const count = tabCounts.get(t.id) ?? 0;
              return (
                <Link
                  key={t.id}
                  href={onTabHref(t.id)}
                  scroll={false}
                  className={`relative flex min-h-11 flex-1 flex-col items-center justify-center px-1 py-2 text-[13px] font-medium ${
                    active ? "font-bold text-[#2D7FF9]" : "text-[#595959]"
                  }`}
                >
                  <span>
                    {t.label}
                    {count > 0 ? ` ${count}` : ""}
                  </span>
                  {active ? (
                    <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#2D7FF9]" />
                  ) : null}
                </Link>
              );
            })}
          </div>

          <div className="mt-2 grid grid-cols-4 gap-1.5">
            <KpiCard
              label="신규 주문"
              value={summaryCounts.pending}
              tone="text-[#FF4D4F]"
              href={onTabHref("new")}
            />
            <KpiCard
              label="준비(조리)중"
              value={summaryCounts.preparing}
              tone="text-[#FA8C16]"
              href={onTabHref("preparing")}
            />
            <KpiCard
              label="배달중"
              value={summaryCounts.delivering}
              tone="text-[#1890FF]"
              href={onTabHref("shipping")}
            />
            <KpiCard
              label="오늘 완료"
              value={summaryCounts.doneToday}
              tone="text-[#52C41A]"
              href={onTabHref("done")}
            />
          </div>

          {searchOpen ? (
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="주문번호·구매자·전화번호 검색"
              className="mt-2 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2.5 text-[14px] outline-none focus:border-[#2D7FF9]"
            />
          ) : null}

          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[12px] text-[#8C8C8C]">{filterLabel}</span>
            <button
              type="button"
              onClick={() => setSortNewestFirst((v) => !v)}
              className="rounded-md border border-[#E5E7EB] bg-white px-2.5 py-1 text-[12px] font-medium text-[#595959]"
            >
              {sortNewestFirst ? "최신순 ▾" : "오래된순 ▾"}
            </button>
          </div>
      </div>

      <main
        className={`min-h-0 flex-1 overflow-y-auto overscroll-y-contain ${OWNER_MOBILE_BOTTOM_NAV_PAD_CLASS}`}
      >
        <div className="space-y-3 px-3 py-3">
          {displayOrders.length === 0 ? (
            <div className="rounded-lg border border-[#E8E8E8] bg-white p-6 text-center text-[14px] text-[#8C8C8C]">
              <p className="font-semibold text-[#262626]">표시할 주문이 없습니다</p>
              <p className="mt-1">다른 탭을 선택하거나 필터를 바꿔 보세요.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {displayOrders.map((o) => (
                <OwnerStoreOrderMockCard
                  key={o.id}
                  storeId={storeId}
                  order={o}
                  onUpdated={onUpdated}
                  isHighlight={highlightOrderId === o.id}
                  onViewDetail={() => onOpenDetail(o.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </main>

      {highlightOrderId ?
        detailOrder ?
          <OwnerStoreOrderDetailPanel
            order={detailOrder}
            storeId={storeId}
            onClose={onCloseDetail}
            onUpdated={onUpdated}
          />
        : <OwnerStoreOrderDetailLoadingPanel onClose={onCloseDetail} />
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
      className="rounded-lg border border-[#E8E8E8] bg-white px-2 py-2 text-center shadow-sm active:bg-[#FAFAFA]"
    >
      <p className="text-[10px] font-medium text-[#8C8C8C]">{label}</p>
      <p className={`mt-0.5 text-[17px] font-bold tabular-nums ${tone}`}>{value}</p>
    </Link>
  );
}
