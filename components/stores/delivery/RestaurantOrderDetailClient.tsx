"use client";

import Link from "next/link";
import { StoreCommerceOrderDetailClient } from "@/components/stores/StoreCommerceOrderDetailClient";
import { loadSimulatedOrder } from "@/lib/stores/delivery-mock/simulated-order-storage";
import { isLikelyUuid } from "@/lib/stores/is-likely-uuid";
import { OrderTimeline } from "./OrderTimeline";
import { formatMoneyPhp } from "@/lib/utils/format";
import {
  formatPhMobileDisplay,
  parsePhMobileInput,
  telHrefFromPhDb09,
} from "@/lib/utils/ph-mobile";

export function RestaurantOrderDetailClient({
  storeSlug,
  orderId,
}: {
  storeSlug: string;
  orderId: string;
}) {
  if (isLikelyUuid(orderId)) {
    return <StoreCommerceOrderDetailClient storeSlug={storeSlug} orderId={orderId} />;
  }

  const order = loadSimulatedOrder(orderId);

  if (!order || order.storeSlug !== storeSlug) {
    const maybeReal = isLikelyUuid(orderId);
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-sm text-gray-600">샘플 배달 주문을 찾을 수 없습니다.</p>
        {maybeReal ? (
          <p className="mt-2 text-sm text-gray-600">
            실제 매장에서 주문하셨다면 마이페이지의 주문 상세에서 확인해 주세요.
          </p>
        ) : null}
        {maybeReal ? (
          <Link
            href={`/my/store-orders/${encodeURIComponent(orderId)}`}
            className="mt-4 inline-block text-sm font-medium text-signature underline"
          >
            내 매장 주문 상세
          </Link>
        ) : null}
        <Link href="/stores" className="mt-4 block text-sm text-signature">
          매장 홈
        </Link>
      </div>
    );
  }

  const ti = order.timelineIndex ?? 2;

  return (
    <div className="min-h-screen bg-[#f3f4f6] px-4 py-4 pb-12">
      <div className="mb-4">
        <Link href={`/stores/${encodeURIComponent(storeSlug)}`} className="text-sm text-signature">
          ← 매장
        </Link>
      </div>
      <h1 className="text-lg font-bold text-gray-900">주문 상세</h1>
      <p className="mt-1 font-mono text-sm text-gray-600">{order.orderNo}</p>

      <section className="mt-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900">진행 상태 (시뮬)</h2>
        <p className="mt-1 text-xs text-gray-500">
          실서비스에서는 store_orders.status 와 푸시 알림으로 갱신됩니다.
        </p>
        <div className="mt-4">
          <OrderTimeline mode={order.mode} timelineIndex={ti} />
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900">주문 정보</h2>
        <dl className="mt-2 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">업체</dt>
            <dd>{order.storeNameKo}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">방식</dt>
            <dd>{order.mode === "delivery" ? "배달" : "포장"}</dd>
          </div>
          {order.addressLine ? (
            <div>
              <dt className="text-gray-500">주소</dt>
              <dd className="mt-0.5 text-gray-800">{order.addressLine}</dd>
            </div>
          ) : null}
          {order.handoffNote ? (
            <div className="flex justify-between">
              <dt className="text-gray-500">전달</dt>
              <dd>{order.handoffNote}</dd>
            </div>
          ) : null}
          {order.pickupTimeNote ? (
            <div className="flex justify-between">
              <dt className="text-gray-500">픽업</dt>
              <dd>{order.pickupTimeNote}</dd>
            </div>
          ) : null}
          {order.requestNote ? (
            <div>
              <dt className="text-gray-500">요청</dt>
              <dd className="text-gray-800">{order.requestNote}</dd>
            </div>
          ) : null}
          {order.contactPhone ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-gray-500">연락처</dt>
              <dd>
                {(() => {
                  const d = parsePhMobileInput(order.contactPhone ?? "");
                  const href = d.length === 11 ? telHrefFromPhDb09(d) : null;
                  const label = d.length === 11 ? formatPhMobileDisplay(d) : order.contactPhone;
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
          {order.lines.map((l) => (
            <li key={`${l.menuName}-${l.optionSummary}`} className="border-b border-gray-50 pb-2 last:border-0">
              <div className="flex justify-between font-medium">
                <span>
                  {l.menuName} ×{l.quantity}
                </span>
                <span>{formatMoneyPhp(l.lineTotal)}</span>
              </div>
              <p className="mt-0.5 text-xs text-gray-500">{l.optionSummary}</p>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">상품</span>
            <span>{formatMoneyPhp(order.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">배달비</span>
            <span>{formatMoneyPhp(order.deliveryFee)}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span>합계</span>
            <span>{formatMoneyPhp(order.total)}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
