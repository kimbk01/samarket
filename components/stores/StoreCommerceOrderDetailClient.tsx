"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { StoreCommerceOrderTimeline } from "@/components/stores/StoreCommerceOrderTimeline";
import { formatMoneyPhp } from "@/lib/utils/format";
import {
  formatPhMobileDisplay,
  parsePhMobileInput,
  telHrefFromPhDb09,
} from "@/lib/utils/ph-mobile";
import { BUYER_ORDER_STATUS_LABEL } from "@/lib/stores/store-order-process-criteria";
import { isStoreOrderChatDisabledForBuyer } from "@/lib/stores/order-status-transitions";

type ItemRow = {
  id: string;
  product_title_snapshot: string;
  price_snapshot: number;
  qty: number;
  subtotal: number;
  options_snapshot_json?: unknown;
};

type OrderDetail = {
  id: string;
  order_no: string;
  store_id: string;
  store_name: string;
  store_slug: string;
  owner_user_id: string;
  buyer_user_id: string;
  total_amount: number;
  payment_amount: number;
  delivery_fee_amount?: number | null;
  payment_status: string;
  order_status: string;
  fulfillment_type: string;
  buyer_note: string | null;
  buyer_phone?: string | null;
  created_at: string;
  updated_at?: string;
};

const ORDER_LABEL: Record<string, string> = { ...BUYER_ORDER_STATUS_LABEL };

const FULFILL_LABEL: Record<string, string> = {
  pickup: "포장 픽업",
  local_delivery: "배달",
  shipping: "배달",
};

export function StoreCommerceOrderDetailClient({
  storeSlug,
  orderId,
}: {
  storeSlug: string;
  orderId: string;
}) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "ok"; order: OrderDetail; items: ItemRow[] }
  >({ kind: "loading" });

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/me/store-orders/${encodeURIComponent(orderId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (res.status === 401) {
        if (!silent) setState({ kind: "error", message: "로그인이 필요합니다." });
        return;
      }
      if (res.status === 404) {
        if (!silent) setState({ kind: "error", message: "주문을 찾을 수 없습니다." });
        return;
      }
      const json = await res.json();
      if (!json?.ok || !json.order) {
        if (!silent) setState({ kind: "error", message: "주문을 불러올 수 없습니다." });
        return;
      }
      const ord = json.order as OrderDetail;
      if (ord.store_slug && ord.store_slug !== storeSlug) {
        if (!silent) setState({ kind: "error", message: "이 매장의 주문이 아닙니다." });
        return;
      }
      setState({ kind: "ok", order: ord, items: json.items ?? [] });
    } catch {
      if (!silent) setState({ kind: "error", message: "네트워크 오류가 발생했습니다." });
    }
  }, [orderId, storeSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  useRefetchOnPageShowRestore(() => void load({ silent: true }));

  if (state.kind === "loading") {
    return <p className="px-4 py-8 text-center text-sm text-gray-500">불러오는 중…</p>;
  }
  if (state.kind === "error") {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-sm text-gray-600">{state.message}</p>
        <Link href={`/stores/${encodeURIComponent(storeSlug)}`} className="mt-4 inline-block text-sm text-signature">
          매장으로
        </Link>
      </div>
    );
  }

  const { order, items } = state;
  const df = Number(order.delivery_fee_amount) || 0;
  const sub = Math.max(0, order.payment_amount - df);
  const orderChatDisabled = isStoreOrderChatDisabledForBuyer(order.order_status);

  return (
    <div className="min-h-screen bg-[#f3f4f6] px-4 py-4 pb-12">
      <div className="mb-4">
        <Link href={`/stores/${encodeURIComponent(storeSlug)}`} className="text-sm text-signature">
          ← 매장
        </Link>
      </div>
      <h1 className="text-lg font-bold text-gray-900">주문 상세</h1>
      <p className="mt-1 font-mono text-sm text-gray-600">{order.order_no}</p>
      <p className="mt-1 text-xs text-gray-500">
        상태: {ORDER_LABEL[order.order_status] ?? order.order_status} ·{" "}
        {FULFILL_LABEL[order.fulfillment_type] ?? order.fulfillment_type}
      </p>

      <section className="mt-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900">진행 상태</h2>
        <p className="mt-1 text-xs text-gray-500">
          주문확인부터 주문완료까지 6단계로 보여 드립니다. 포장 픽업은 배송 단계가 생략 표시됩니다. 매장에서
          상태를 바꾸면 갱신되고 채팅에도 안내가 올라갑니다.
        </p>
        <div className="mt-4">
          <StoreCommerceOrderTimeline
            variant="buyer_detail"
            fulfillmentType={order.fulfillment_type}
            orderStatus={order.order_status}
          />
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900">매장과 채팅</h2>
        <p className="mt-1 text-xs text-gray-500">샘플 배달 주문과 같은 형식의 주문 채팅입니다.</p>
        {orderChatDisabled ? (
          <span
            className="mt-3 block w-full cursor-not-allowed rounded-xl border border-gray-200 bg-gray-100 py-3 text-center text-sm font-semibold text-gray-400"
            aria-disabled
          >
            채팅방 열기
          </span>
        ) : (
          <Link
            href={`/my/store-orders/${encodeURIComponent(order.id)}/chat`}
            className="mt-3 block w-full rounded-xl border border-signature bg-signature/5 py-3 text-center text-sm font-semibold text-signature"
          >
            채팅방 열기
          </Link>
        )}
      </section>

      <section className="mt-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900">주문 정보</h2>
        <dl className="mt-2 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">업체</dt>
            <dd>{order.store_name}</dd>
          </div>
          {order.buyer_note ? (
            <div>
              <dt className="text-gray-500">요청</dt>
              <dd className="text-gray-800">{order.buyer_note}</dd>
            </div>
          ) : null}
          {order.buyer_phone ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-gray-500">연락처</dt>
              <dd>
                {(() => {
                  const d = parsePhMobileInput(order.buyer_phone ?? "");
                  const href = d.length === 11 ? telHrefFromPhDb09(d) : null;
                  const label = d.length === 11 ? formatPhMobileDisplay(d) : order.buyer_phone;
                  return href ? (
                    <a href={href} className="font-medium text-signature">
                      {label}
                    </a>
                  ) : (
                    <span className="text-gray-800">{label}</span>
                  );
                })()}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="mt-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900">메뉴</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {items.map((it) => (
            <li key={it.id} className="border-b border-gray-50 pb-2 last:border-0">
              <div className="flex justify-between font-medium">
                <span>
                  {it.product_title_snapshot} ×{it.qty}
                </span>
                <span>{formatMoneyPhp(it.subtotal)}</span>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">상품</span>
            <span>{formatMoneyPhp(sub)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">배달비</span>
            <span>{formatMoneyPhp(df)}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span>합계</span>
            <span>{formatMoneyPhp(order.payment_amount)}</span>
          </div>
        </div>
      </section>

      <Link
        href={`/my/store-orders/${encodeURIComponent(order.id)}`}
        className="mt-4 block text-center text-sm text-signature underline"
      >
        마이페이지 주문 상세
      </Link>
    </div>
  );
}
