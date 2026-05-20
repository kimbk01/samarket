"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStoreOrderCardStepperWithActions } from "@/components/business/owner/OwnerStoreOrderCardStepperWithActions";
import { OwnerStoreOrderCardFooterActions } from "@/components/business/owner/OwnerStoreOrderCardFooterActions";
import {
  OwnerStoreOrderDeliveryActionsAside,
  ownerOrderHasTransitionButtons,
} from "@/components/business/owner/OwnerStoreOrderDeliveryActions";
import type { OwnerStoreOrderListRow } from "@/lib/business/owner-store-order-list-row-bridge";
import { formatOwnerOrderElapsed } from "@/components/business/owner/owner-order-elapsed";
import { ownerOrderStatusTone } from "@/lib/stores/owner-mobile-ui-tokens";
import { ownerOrderStatusLabel } from "@/lib/stores/owner-order-ui-labels";
import type { OwnerOrderStatus } from "@/lib/store-owner/types";
import { formatMoneyPhp } from "@/lib/utils/format";
import { formatPhMobileDisplay, parsePhMobileInput, telHrefFromLoosePhPhone } from "@/lib/utils/ph-mobile";
import { BUYER_PUBLIC_LABEL_FALLBACK } from "@/lib/stores/buyer-public-label";
import { formatBuyerPaymentDisplay } from "@/lib/stores/payment-methods-config";
import { orderLineOptionsSummary } from "@/lib/stores/product-line-options";

export function OwnerStoreOrderMockCard({
  storeId,
  order,
  onUpdated,
  onOrderStatusPatched,
  isHighlight,
  onViewDetail,
  onOpenChat,
}: {
  storeId: string;
  order: OwnerStoreOrderListRow;
  onUpdated: () => void | Promise<void>;
  onOrderStatusPatched?: (orderId: string) => void;
  isHighlight: boolean;
  onViewDetail: () => void;
  onOpenChat: () => void;
}) {
  const { t, language } = useI18n();
  const tone = ownerOrderStatusTone(order.order_status);
  const statusLabel = ownerOrderStatusLabel(order.order_status as OwnerOrderStatus, language);
  const elapsed = formatOwnerOrderElapsed(order.created_at, language);
  const fulfillLabel =
    order.fulfillment_type === "pickup"
      ? t("store_owner_fulfillment_pickup_short")
      : t("store_owner_fulfillment_delivery_short");
  const buyerLabel =
    typeof order.buyer_public_label === "string" && order.buyer_public_label.trim()
      ? order.buyer_public_label.trim()
      : BUYER_PUBLIC_LABEL_FALLBACK;
  const phoneRaw = typeof order.buyer_phone === "string" ? order.buyer_phone.trim() : "";
  const phoneDigits = phoneRaw ? parsePhMobileInput(phoneRaw) : "";
  const phoneDisplay =
    phoneRaw && phoneDigits.length === 11 ? formatPhMobileDisplay(phoneDigits) : phoneRaw;
  const phoneTel = phoneRaw ? telHrefFromLoosePhPhone(phoneRaw) : null;
  const address = [order.delivery_address_summary?.trim(), order.delivery_address_detail?.trim()]
    .filter(Boolean)
    .join(" ");
  const isPending = order.order_status === "pending";
  const hasActions = ownerOrderHasTransitionButtons({
    id: order.id,
    order_status: order.order_status,
    fulfillment_type: order.fulfillment_type,
  });

  return (
    <li
      id={`owner-order-${order.id}`}
      className={`scroll-mt-48 rounded-lg border border-[#E8E8E8] bg-white p-3.5 shadow-sm ${
        isHighlight ? "ring-2 ring-[#2D7FF9] ring-offset-2" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex rounded px-2 py-0.5 text-[12px] font-bold ${tone.badgeBg} ${tone.badgeText}`}
        >
          {statusLabel}
        </span>
        {elapsed ? <span className="text-[12px] font-medium text-[#8C8C8C]">{elapsed}</span> : null}
      </div>

      <p className="mt-2 text-[12px] font-medium text-[#595959]">{order.order_no}</p>
      <p className="mt-1 text-[14px] font-semibold text-[#262626]">{buyerLabel}</p>
      {phoneDisplay && phoneTel ? (
        <p className="mt-0.5 text-[13px] text-[#595959]">
          <a href={phoneTel} className="text-[#2D7FF9] underline underline-offset-2">
            {phoneDisplay}
          </a>
        </p>
      ) : null}
      {address ? (
        <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-[#595959]">{address}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[20px] font-bold tabular-nums text-[#262626]">
          {formatMoneyPhp(order.payment_amount)}
        </p>
        <p className="text-[12px] text-[#8C8C8C]">
          <span className="mr-1.5 inline-flex rounded bg-[#F5F5F5] px-1.5 py-0.5 font-medium text-[#595959]">
            {fulfillLabel}
          </span>
          {new Date(order.created_at).toLocaleString("ko-KR", {
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit",
            hour12: true,
          })}
        </p>
      </div>

      <OwnerStoreOrderCardStepperWithActions
        storeId={storeId}
        orderId={order.id}
        orderStatus={order.order_status}
        fulfillmentType={order.fulfillment_type}
        buyerPublicLabel={order.buyer_public_label}
        onUpdated={onUpdated}
        onOrderStatusPatched={onOrderStatusPatched}
      />

      {isPending && hasActions ? (
        <div className="mt-3">
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
        </div>
      ) : null}
      <OwnerStoreOrderCardFooterActions onViewDetail={onViewDetail} onOpenChat={onOpenChat} />
    </li>
  );
}
