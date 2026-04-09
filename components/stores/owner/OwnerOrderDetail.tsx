"use client";

import Link from "next/link";
import { HistoryBackTextLink } from "@/components/navigation/HistoryBackTextLink";
import type { OwnerOrder } from "@/lib/store-owner/types";
import { OwnerOrderActionPanel } from "./OwnerOrderActionPanel";
import { OwnerOrderChatShortcut } from "./OwnerOrderChatShortcut";
import { OwnerOrderItems } from "./OwnerOrderItems";
import { OwnerOrderStatusBadge } from "./OwnerOrderStatusBadge";
import { OwnerOrderTimeline } from "./OwnerOrderTimeline";
import { formatBuyerPaymentDisplay } from "@/lib/stores/payment-methods-config";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { formatMoneyPhp } from "@/lib/utils/format";

function fulfillmentLabel(t: OwnerOrder["order_type"]) {
  if (t === "delivery" || t === "shipping") {
    return { cls: "bg-signature/5 text-gray-900", text: "배달" };
  }
  return { cls: "bg-teal-50 text-teal-900", text: "포장 픽업" };
}

export function OwnerOrderDetail({
  storeId,
  slug,
  order,
  onActionDone,
}: {
  storeId: string;
  slug: string;
  order: OwnerOrder;
  onActionDone?: () => void | Promise<void>;
}) {
  const listHref = buildStoreOrdersHref({ storeId });
  const fl = fulfillmentLabel(order.order_type);

  const terminal = ["completed", "cancelled", "refunded", "refund_requested"].includes(order.order_status);

  return (
    <div className="min-h-screen bg-[#f3f4f6] pb-44">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white px-3 py-3">
        <div className="mx-auto flex max-w-lg items-center gap-2">
          <HistoryBackTextLink
            fallbackHref={listHref}
            className="text-sm font-semibold text-gray-600"
            aria-label="목록으로"
          >
            ← 목록
          </HistoryBackTextLink>
          <h1 className="min-w-0 flex-1 truncate text-center text-[15px] font-bold text-gray-900">
            {order.order_no}
          </h1>
          <OwnerOrderChatShortcut />
        </div>
      </header>

      <div className="mx-auto max-w-lg space-y-3 px-3 py-4">
        <section className="rounded-ui-rect bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <OwnerOrderStatusBadge status={order.order_status} />
            <span className={`rounded-ui-rect px-2 py-0.5 text-xs font-bold ${fl.cls}`}>{fl.text}</span>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            주문시각 {new Date(order.created_at).toLocaleString("ko-KR")}
          </p>
        </section>

        {order.buyer_cancel_request ? (
          <section className="rounded-ui-rect border border-amber-200 bg-amber-50 p-4 text-sm">
            <p className="font-bold text-amber-950">고객 취소 요청</p>
            <p className="mt-1 text-amber-900">{order.buyer_cancel_request.reason}</p>
          </section>
        ) : null}

        {order.order_status === "refund_requested" ? (
          <section className="rounded-ui-rect border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-bold">환불 요청 접수됨</p>
            <p className="mt-1 text-xs">비즈니스 콘솔·관리자 절차에 따라 처리해 주세요.</p>
          </section>
        ) : null}

        {order.cancel_reason ? (
          <section className="rounded-ui-rect border border-gray-200 bg-gray-100 p-4 text-sm text-gray-800">
            <p className="font-bold">거절·취소 사유</p>
            <p className="mt-1">{order.cancel_reason}</p>
          </section>
        ) : null}

        {order.problem_memo ? (
          <section className="rounded-ui-rect border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <p className="font-bold">문제 접수 메모</p>
            <p className="mt-1">{order.problem_memo}</p>
          </section>
        ) : null}

        <section className="rounded-ui-rect bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <h2 className="text-sm font-bold text-gray-900">기본 정보</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">주문자</dt>
              <dd className="font-medium text-gray-900">{order.buyer_name}</dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-gray-500">연락처</dt>
              <dd className="flex flex-wrap items-center justify-end gap-2 font-mono text-gray-900">
                <span>{order.buyer_phone}</span>
                {order.buyer_phone_tel_href ? (
                  <a
                    href={order.buyer_phone_tel_href}
                    className="rounded-full border border-signature/30 bg-signature/10 px-3 py-1 text-[12px] font-semibold text-signature no-underline"
                  >
                    전화 문의
                  </a>
                ) : null}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">결제 방법</dt>
              <dd className="text-right font-medium text-gray-900">
                {formatBuyerPaymentDisplay(order.buyer_payment_method, order.buyer_payment_method_detail)}
              </dd>
            </div>
            {order.order_type === "delivery" ? (
              <div>
                <dt className="text-gray-500">배달 주소</dt>
                <dd className="mt-1 text-gray-900">{order.delivery_address ?? "—"}</dd>
                {order.delivery_courier_label?.trim() ? (
                  <div className="mt-3">
                    <dt className="text-gray-500">배달 업체(안내)</dt>
                    <dd className="mt-1 text-gray-900">{order.delivery_courier_label.trim()}</dd>
                    <p className="mt-1 text-[11px] text-gray-500">
                      안내 문구이며, 상품·배달비 합계와 별도로 청구되지 않습니다.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : order.order_type === "shipping" ? (
              <div>
                <dt className="text-gray-500">배송</dt>
                <dd className="mt-1 text-gray-900">배송지·운송장은 주문 데이터 연동 후 표시됩니다.</dd>
              </div>
            ) : (
              <div>
                <dt className="text-gray-500">픽업 안내</dt>
                <dd className="mt-1 text-gray-900">{order.pickup_note ?? "—"}</dd>
              </div>
            )}
            <div>
              <dt className="text-gray-500">고객 요청 사항</dt>
              <dd className="mt-1 whitespace-pre-wrap text-gray-900">
                {order.request_message?.trim() || "—"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-ui-rect bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <h2 className="text-sm font-bold text-gray-900">주문 항목</h2>
          <div className="mt-3">
            <OwnerOrderItems items={order.items} />
          </div>
        </section>

        <section className="rounded-ui-rect bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <h2 className="text-sm font-bold text-gray-900">금액</h2>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">상품금액</dt>
              <dd>{formatMoneyPhp(order.product_amount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">옵션금액</dt>
              <dd>{formatMoneyPhp(order.option_amount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">
                {order.order_type === "delivery" ? "배달비" : order.order_type === "shipping" ? "배송비" : "기타"}
              </dt>
              <dd>{formatMoneyPhp(order.delivery_fee)}</dd>
            </div>
            <div className="flex justify-between border-t border-gray-100 pt-2 text-base font-bold">
              <dt>주문 합계</dt>
              <dd>{formatMoneyPhp(order.total_amount)}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-ui-rect bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <h2 className="text-sm font-bold text-gray-900">상태 변경 이력</h2>
          <div className="mt-4">
            <OwnerOrderTimeline logs={order.logs} />
          </div>
        </section>

      </div>

      {!terminal ? (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.06)] backdrop-blur md:hidden">
          <div className="mx-auto max-w-lg">
            <OwnerOrderActionPanel
              storeId={storeId}
              order={order}
              layout="detail"
              onAfterAction={onActionDone}
            />
          </div>
        </div>
      ) : null}

      {!terminal ? (
        <div className="mx-auto hidden max-w-lg px-3 pb-8 md:block">
          <section className="rounded-ui-rect border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-bold text-gray-900">주문 처리</h2>
            <div className="mt-3">
              <OwnerOrderActionPanel
              storeId={storeId}
              order={order}
              layout="detail"
              onAfterAction={onActionDone}
            />
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
