"use client";

import Link from "next/link";
import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";
import {
  type StoreOrdersHubFilter,
  ordersHubHref,
} from "@/lib/stores/store-orders-hub-filter";

const FILTER_CHIPS: { key: StoreOrdersHubFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "receiving", label: "접수" },
  { key: "preparing", label: "준비" },
  { key: "delivering", label: "배달" },
  { key: "done", label: "완료" },
  { key: "issue", label: "취소" },
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
  const shell = embedded ? "rounded-xl bg-neutral-50/90 p-2" : "rounded-2xl border border-neutral-100 bg-white p-3 shadow-sm";
  const shellReady = embedded ?
    "space-y-2 p-0"
  : "rounded-2xl border border-neutral-100 bg-white p-3 shadow-sm ring-1 ring-black/[0.03]";

  if (buyerState.kind === "loading") {
    return (
      <section className={shell}>
        <div className="mb-2 h-4 w-24 animate-pulse rounded bg-neutral-100" />
        <div className={RAIL}>
          {[1, 2, 3].map((k) => (
            <div key={k} className="h-[100px] w-[132px] shrink-0 animate-pulse rounded-2xl bg-neutral-100" />
          ))}
        </div>
      </section>
    );
  }

  if (buyerState.kind !== "ready") {
    return (
      <section className={shell}>
        {!embedded ?
          <h2 className="text-[14px] font-bold text-neutral-900">내 주문</h2>
        : null}
        <p className="mt-1 text-[11px] text-neutral-500">로그인 후 주문·채팅을 가로로 빠르게 열 수 있어요.</p>
        <div className={`mt-3 ${RAIL}`}>
          <Link
            href="/login"
            className="flex w-[120px] shrink-0 flex-col justify-center rounded-2xl bg-neutral-900 px-3 py-3 text-center text-[12px] font-bold text-white"
          >
            로그인
          </Link>
          <Link
            href="/orders"
            className="flex w-[120px] shrink-0 flex-col justify-center rounded-2xl border border-neutral-200 bg-white px-3 py-3 text-center text-[12px] font-semibold text-neutral-800"
          >
            주문 허브
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
          <h2 className="text-[15px] font-bold tracking-tight text-neutral-900">내 주문</h2>
          <div className="flex items-center gap-2">
            {b.unreadChats > 0 ?
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {b.unreadChats > 99 ? "99+" : b.unreadChats}
              </span>
            : null}
            <Link href="/orders" className="text-[12px] font-semibold text-signature">
              전체 {b.totalOrders}
            </Link>
          </div>
        </div>
      : <div className="mb-1 flex items-center justify-end gap-2 px-0.5">
          {b.unreadChats > 0 ?
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {b.unreadChats > 99 ? "99+" : b.unreadChats}
            </span>
          : null}
          <Link href="/orders" className="text-[12px] font-semibold text-signature">
            전체 {b.totalOrders}
          </Link>
        </div>
      }

      <HorizontalDragScroll className={RAIL} aria-label="주문 바로가기">
        <Link
          href={ordersHubHref("receiving")}
          className="flex w-[132px] shrink-0 flex-col rounded-2xl bg-neutral-50 p-3 ring-1 ring-neutral-100"
        >
          <span className="text-[10px] font-medium text-neutral-500">진행 중</span>
          <span className="mt-1 text-[22px] font-bold tabular-nums text-neutral-900">{b.activeOrders}</span>
          <span className="mt-2 text-[11px] font-semibold text-signature">내역</span>
        </Link>
        <Link
          href="/my/store-orders"
          className="flex w-[132px] shrink-0 flex-col rounded-2xl bg-neutral-50 p-3 ring-1 ring-neutral-100"
        >
          <span className="text-[10px] font-medium text-neutral-500">주문 채팅</span>
          <span className="mt-1 text-[22px] font-bold tabular-nums text-neutral-900">{b.orderChatRooms}</span>
          <span className="mt-2 text-[11px] font-semibold text-signature">
            {b.unreadChats > 0 ? `+${b.unreadChats}` : "열기"}
          </span>
        </Link>
        {recentOrder ?
          <Link
            href={`/orders/store/${encodeURIComponent(recentOrder.id)}`}
            className="flex w-[148px] shrink-0 flex-col rounded-2xl border border-dashed border-signature/30 bg-signature/[0.04] p-3"
          >
            <span className="text-[10px] font-medium text-neutral-500">최근</span>
            <span className="mt-1 line-clamp-2 text-[12px] font-bold leading-tight text-neutral-900">
              {recentOrder.store_name || "매장"}
            </span>
            <span className="mt-auto pt-2 text-[11px] font-semibold text-signature">상세</span>
          </Link>
        : <Link
            href="/stores#store-industry-explore"
            className="flex w-[132px] shrink-0 flex-col rounded-2xl border border-neutral-200 p-3"
          >
            <span className="text-[10px] font-medium text-neutral-500">최근</span>
            <span className="mt-2 text-[12px] text-neutral-600">주문 없음</span>
            <span className="mt-auto pt-2 text-[11px] font-semibold text-signature">업종 찾기</span>
          </Link>
        }
      </HorizontalDragScroll>

      <div className="mt-3 border-t border-neutral-100 pt-2">
        <p className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">상태</p>
        <HorizontalDragScroll className={RAIL} aria-label="주문 상태 필터">
          {FILTER_CHIPS.map(({ key, label }) => (
            <Link
              key={key}
              href={ordersHubHref(key)}
              className="shrink-0 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-neutral-700 shadow-sm"
            >
              {label}
            </Link>
          ))}
        </HorizontalDragScroll>
      </div>
    </section>
  );
}
