"use client";

import type { CSSProperties } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";

type StoreOrderI18nT = (key: MessageKey, vars?: Record<string, string | number>) => string;
import { OwnerStoreOrderDeliveryActionsAside } from "@/components/business/owner/OwnerStoreOrderDeliveryActions";
import type { OwnerDeliveryOrderRef } from "@/components/business/owner/OwnerStoreOrderDeliveryActions";
import {
  BUYER_ORDER_STATUS_LABEL,
  TIMELINE_DELIVERY_STEPS,
  TIMELINE_PICKUP_STEPS,
  buyerDetailSixStepStates,
} from "@/lib/stores/store-order-process-criteria";
import { ownerOrderHasTransitionButtons } from "@/components/business/owner/OwnerStoreOrderDeliveryActions";
import { isDeliveryFulfillment } from "@/lib/stores/order-status-transitions";
import { resolveOwnerNextOrderAction } from "@/lib/business/owner-order-stepper-transition";

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
  const { t } = useI18n();
  const statusLabel = BUYER_ORDER_STATUS_LABEL[order.order_status] ?? order.order_status;
  const showActions = ownerOrderHasTransitionButtons(order);
  const nextAction = resolveOwnerNextOrderAction(order.order_status, order.fulfillment_type);

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
            {nextAction ? (
              <span className="text-[color:var(--cm-room-text-muted)]">
                {t("store_messenger_owner_next_label", { label: nextAction.label })}
              </span>
            ) : null}
          </p>
        </div>
      </div>

      {showActions ? (
        <div className="space-y-2 px-3 py-2.5">
          <OwnerProgressRail t={t} order={order} />
          <p className="sam-text-xxs font-semibold text-[color:var(--cm-room-text)]">
            {order.order_status === "pending"
              ? t("store_messenger_owner_accept_prompt")
              : t("store_messenger_owner_progress_prompt")}
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
          {t("store_messenger_owner_status_locked")}
        </p>
      )}
    </div>
  );
}

function OwnerProgressRail({ t, order }: { t: StoreOrderI18nT; order: OwnerDeliveryOrderRef }) {
  const deliveryLike = isDeliveryFulfillment(order.fulfillment_type);
  const labels = deliveryLike ? TIMELINE_DELIVERY_STEPS : TIMELINE_PICKUP_STEPS;
  const states = buyerDetailSixStepStates(order.fulfillment_type, order.order_status);
  return (
    <div className="grid grid-cols-4 gap-1.5" aria-label={t("store_order_timeline_aria")}>
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
