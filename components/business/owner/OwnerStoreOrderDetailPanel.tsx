"use client";

import { type ReactNode } from "react";
import { X, MapPin } from "lucide-react";
import { BodyPortal } from "@/components/layout/BodyPortal";
import { OwnerOrderCardProgressSteps } from "@/components/business/owner/OwnerOrderCardProgressSteps";
import { OwnerStoreOrderDeliveryActionsAside } from "@/components/business/owner/OwnerStoreOrderDeliveryActions";
import type { OwnerStoreOrderListRow } from "@/lib/business/owner-store-order-list-row-bridge";
import { formatOwnerOrderElapsedKo } from "@/components/business/owner/owner-order-elapsed";
import {
  OWNER_MOBILE_ORDER_DETAIL_FOOTER_PAD_CLASS,
  OWNER_MOBILE_ORDER_DETAIL_OVERLAY_SHELL_CLASS,
  ownerOrderStatusLabelKo,
  ownerOrderStatusTone,
} from "@/lib/stores/owner-mobile-ui-tokens";
import { formatMoneyPhp } from "@/lib/utils/format";
import { formatBuyerPaymentDisplay } from "@/lib/stores/payment-methods-config";
import { orderLineOptionsSummary } from "@/lib/stores/product-line-options";
import { BUYER_PUBLIC_LABEL_FALLBACK } from "@/lib/stores/buyer-public-label";

/** `order_id` 딥링크·목록 로딩 중 — 상세 본문 대신 동일 오버레이 셸 */
export function OwnerStoreOrderDetailLoadingPanel({ onClose }: { onClose: () => void }) {
  return (
    <OwnerStoreOrderDetailOverlay onClose={onClose}>
      <div className="flex min-h-0 flex-1 items-center justify-center px-4">
        <p className="text-[14px] text-[#8C8C8C]">주문 정보를 불러오는 중…</p>
      </div>
    </OwnerStoreOrderDetailOverlay>
  );
}

export function OwnerStoreOrderDetailPanel({
  order,
  storeId,
  onClose,
  onUpdated,
}: {
  order: OwnerStoreOrderListRow;
  storeId: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const tone = ownerOrderStatusTone(order.order_status);
  const statusLabel = ownerOrderStatusLabelKo(order.order_status);
  const elapsed = formatOwnerOrderElapsedKo(order.created_at);
  const buyerLabel =
    typeof order.buyer_public_label === "string" && order.buyer_public_label.trim()
      ? order.buyer_public_label.trim()
      : BUYER_PUBLIC_LABEL_FALLBACK;
  const address = [order.delivery_address_summary?.trim(), order.delivery_address_detail?.trim()]
    .filter(Boolean)
    .join("\n");
  const prepMin =
    order.estimated_prep_minutes != null && Number(order.estimated_prep_minutes) > 0
      ? `약 ${Math.floor(Number(order.estimated_prep_minutes))}분`
      : "—";

  return (
    <OwnerStoreOrderDetailOverlay onClose={onClose}>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-3">
        <section className="rounded-lg border border-[#E8E8E8] bg-white p-3.5">
          <OrderDetailStatusHeader tone={tone} statusLabel={statusLabel} elapsed={elapsed} />
          <p className="mt-2 text-[12px] text-[#595959]">{order.order_no}</p>
          <p className="mt-1 text-[15px] font-semibold text-[#262626]">{buyerLabel}</p>
          <OwnerOrderCardProgressSteps
            orderStatus={order.order_status}
            fulfillmentType={order.fulfillment_type}
          />
        </section>

        <section className="mt-3 rounded-lg border border-[#E8E8E8] bg-white p-3.5">
          <h2 className="text-[14px] font-bold text-[#262626]">주문 정보</h2>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-[13px]">
            <dt className="text-[#8C8C8C]">주문 유형</dt>
            <dd className="font-medium text-[#262626]">
              {order.fulfillment_type === "local_delivery" ? "배달 주문" : "포장 주문"}
            </dd>
            <dt className="text-[#8C8C8C]">결제 방법</dt>
            <dd className="font-medium text-[#262626]">
              {formatBuyerPaymentDisplay(order.buyer_payment_method, order.buyer_payment_method_detail)}
            </dd>
            <dt className="text-[#8C8C8C]">결제 금액</dt>
            <dd className="font-bold text-[#262626]">{formatMoneyPhp(order.payment_amount)}</dd>
            <dt className="text-[#8C8C8C]">주문 시간</dt>
            <dd className="font-medium text-[#262626]">
              {new Date(order.created_at).toLocaleString("ko-KR")}
            </dd>
            <dt className="text-[#8C8C8C]">예상 조리</dt>
            <dd className="font-medium text-[#262626]">{prepMin}</dd>
          </dl>
        </section>

        {address ? (
          <section className="mt-3 rounded-lg border border-[#E8E8E8] bg-white p-3.5">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-[14px] font-bold text-[#262626]">배송지</h2>
              <MapPin className="h-5 w-5 shrink-0 text-[#2D7FF9]" aria-hidden />
            </div>
            <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-[#595959]">{address}</p>
          </section>
        ) : null}

        <section className="mt-3 rounded-lg border border-[#E8E8E8] bg-white p-3.5">
          <h2 className="text-[14px] font-bold text-[#262626]">주문 메뉴</h2>
          <ul className="mt-2 space-y-2">
            {(order.items ?? []).map((it) => (
              <li key={it.id} className="flex justify-between gap-2 text-[13px]">
                <span className="min-w-0 text-[#262626]">
                  {it.product_title_snapshot} × {it.qty}
                  {orderLineOptionsSummary(it.options_snapshot_json) ? (
                    <span className="mt-0.5 block text-[12px] text-[#8C8C8C]">
                      {orderLineOptionsSummary(it.options_snapshot_json)}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-[#262626]">
                  {formatMoneyPhp(it.subtotal)}
                </span>
              </li>
            ))}
          </ul>
          {order.buyer_note?.trim() ? (
            <BuyerNoteBlock note={order.buyer_note.trim()} />
          ) : null}
        </section>
      </div>

      <footer
        className={`shrink-0 border-t border-[#E5E7EB] bg-white px-3 pt-3 ${OWNER_MOBILE_ORDER_DETAIL_FOOTER_PAD_CLASS}`}
      >
        <OwnerStoreOrderDeliveryActionsAside
          storeId={storeId}
          order={{
            id: order.id,
            order_status: order.order_status,
            fulfillment_type: order.fulfillment_type,
          }}
          onUpdated={onUpdated}
          variant="rowBelow"
          rowBelowButtonLayout="row"
        />
      </footer>
    </OwnerStoreOrderDetailOverlay>
  );
}

function OwnerStoreOrderDetailOverlay({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <BodyPortal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="주문 상세"
        className={OWNER_MOBILE_ORDER_DETAIL_OVERLAY_SHELL_CLASS}
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#E5E7EB] bg-white px-3">
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-[#F5F5F5]"
            aria-label="닫기"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
          <p className="text-[16px] font-bold text-[#262626]">주문 상세</p>
          <span className="h-10 w-10" aria-hidden />
        </div>
        {children}
      </div>
    </BodyPortal>
  );
}

function OrderDetailStatusHeader({
  tone,
  statusLabel,
  elapsed,
}: {
  tone: ReturnType<typeof ownerOrderStatusTone>;
  statusLabel: string;
  elapsed: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={`inline-flex rounded px-2 py-0.5 text-[12px] font-bold ${tone.badgeBg} ${tone.badgeText}`}
      >
        {statusLabel}
      </span>
      {elapsed ? <span className="text-[12px] text-[#8C8C8C]">{elapsed}</span> : null}
    </div>
  );
}

function BuyerNoteBlock({ note }: { note: string }) {
  return (
    <div className="mt-3 rounded-md border border-[#FFE58F] bg-[#FFFBE6] px-3 py-2">
      <p className="text-[12px] font-semibold text-[#AD6800]">특이사항</p>
      <p className="mt-1 text-[13px] text-[#614700]">{note}</p>
    </div>
  );
}
