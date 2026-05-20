"use client";

import type { CSSProperties } from "react";
import { OwnerStoreOrderDeliveryActionsAside } from "@/components/business/owner/OwnerStoreOrderDeliveryActions";
import type { OwnerDeliveryOrderRef } from "@/components/business/owner/OwnerStoreOrderDeliveryActions";
import {
  BUYER_ORDER_STATUS_LABEL,
  TIMELINE_DELIVERY_STEPS,
  TIMELINE_PICKUP_STEPS,
  buyerDetailSixStepStates,
  labelForOwnerTransition,
} from "@/lib/stores/store-order-process-criteria";
import { ownerOrderHasTransitionButtons } from "@/components/business/owner/OwnerStoreOrderDeliveryActions";
import { allowedOrderTransitions, isDeliveryFulfillment } from "@/lib/stores/order-status-transitions";

type Props = {
  storeId: string;
  order: OwnerDeliveryOrderRef;
  onUpdated: () => void;
  onOpenOrderPanel: () => void;
};

/**
 * 메신저 배달 방 — 사장님 접수·진행 CTA (주문 목록과 동일 PATCH).
 * `OwnerStoreOrderDeliveryActionsChatToolbar` 중복 헤더 없이 버튼만 크게 노출.
 */
export function StoreOrderOwnerMessengerActionBar({
  storeId,
  order,
  onUpdated,
  onOpenOrderPanel,
}: Props) {
  const statusLabel = BUYER_ORDER_STATUS_LABEL[order.order_status] ?? order.order_status;
  const showActions = ownerOrderHasTransitionButtons(order);
  const next = allowedOrderTransitions(order.order_status, order.fulfillment_type);
  const nextLabel = next
    .filter((s) => s !== "cancelled")
    .map((s) => labelForOwnerTransition(order.order_status, s, order.fulfillment_type))
    .join(" · ");

  return (
    <div
      className="shrink-0 border-t border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-surface)]"
      data-store-order-owner-actions
      style={
        {
          "--biz-primary": "var(--cm-room-primary)",
          "--biz-primary-hover": "var(--cm-room-primary)",
          "--biz-primary-active": "var(--cm-room-primary)",
          "--biz-primary-soft": "var(--cm-room-primary-soft)",
          "--biz-card-bg": "var(--cm-room-surface)",
          "--biz-card-border": "var(--cm-room-divider)",
        } as CSSProperties
      }
    >
      <div className="flex items-center justify-between gap-2 border-b border-[color:var(--cm-room-divider)]/80 px-3 py-2">
        <div className="min-w-0">
          <p className="sam-text-xxs text-[color:var(--cm-room-primary)]">
            {statusLabel}
            {nextLabel ? <span className="text-[color:var(--cm-room-text-muted)]"> → 다음: {nextLabel}</span> : null}
          </p>
        </div>
      </div>

      {showActions ? (
        <div className="space-y-2 px-3 py-2.5">
          <OwnerProgressRail order={order} />
          <p className="sam-text-xxs font-semibold text-[color:var(--cm-room-text)]">
            {order.order_status === "pending"
              ? "주문 접수 여부를 선택하세요."
              : "아래 버튼으로 다음 진행 상황을 입력하세요."}
          </p>
          <div className="[&_[data-owner-delivery-actions]_button]:min-h-[48px] [&_[data-owner-delivery-actions]_button]:flex-1 [&_[data-owner-delivery-actions]_button]:text-[15px]">
          <div data-owner-delivery-actions>
            <OwnerStoreOrderDeliveryActionsAside
              storeId={storeId}
              order={order}
              onUpdated={onUpdated}
              variant="rowBelow"
              rowBelowButtonLayout="row"
              acceptSheetOverlayClassName="z-[420]"
            />
          </div>
          </div>
        </div>
      ) : (
        <p className="px-3 py-2.5 sam-text-xxs text-[color:var(--cm-room-text-muted)]">
          이 단계에서는 채팅에서 상태를 바꿀 수 없습니다.
        </p>
      )}
    </div>
  );
}

function OwnerProgressRail({ order }: { order: OwnerDeliveryOrderRef }) {
  const deliveryLike = isDeliveryFulfillment(order.fulfillment_type);
  const labels = deliveryLike ? TIMELINE_DELIVERY_STEPS : TIMELINE_PICKUP_STEPS;
  const states = buyerDetailSixStepStates(order.fulfillment_type, order.order_status);
  return (
    <div className="grid grid-cols-4 gap-1.5" aria-label="주문 진행 단계">
      {labels.map((label, idx) => {
        const state = states[idx] ?? "upcoming";
        return (
          <span
            key={label}
            className={`rounded-full px-2 py-1 text-center sam-text-xxs ${
              state === "current"
                ? "bg-[color:var(--cm-room-primary-soft)] font-bold text-[color:var(--cm-room-primary)]"
                : state === "done"
                  ? "bg-[color:var(--cm-room-surface-muted)] text-[color:var(--cm-room-text)]"
                  : "bg-[color:var(--cm-room-surface-muted)] text-[color:var(--cm-room-text-muted)] opacity-55"
            }`}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}
