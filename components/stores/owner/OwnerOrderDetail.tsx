"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
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
import { StoreOrderMessengerDeepLink } from "@/components/stores/StoreOrderMessengerDeepLink";
import { buildMessengerContextInputFromOwnerOrder } from "@/lib/community-messenger/store-order-messenger-context";

function fulfillmentLabel(
  orderType: OwnerOrder["order_type"],
  t: (key: MessageKey) => string
) {
  if (orderType === "delivery" || orderType === "shipping") {
    return { cls: "bg-signature/5 text-sam-fg", text: t("common_delivery") };
  }
  return { cls: "bg-teal-50 text-teal-900", text: t("common_pickup_label") };
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
  const { t, language } = useI18n();
  const listHref = buildStoreOrdersHref({ storeId });
  const fl = fulfillmentLabel(order.order_type, t);
  const dateLocale = language === "ko" ? "ko-KR" : "en-US";

  const terminal = ["completed", "cancelled", "refunded", "refund_requested"].includes(order.order_status);

  return (
    <div className="min-h-screen bg-sam-app pb-44">
      <header className="sticky top-0 z-20 border-b border-sam-border bg-sam-surface px-3 py-3">
        <div className="mx-auto flex max-w-lg items-center gap-2">
          <HistoryBackTextLink
            fallbackHref={listHref}
            className="text-sm font-semibold text-sam-muted"
            aria-label={t("common_to_list")}
          >
            ← {t("common_to_list")}
          </HistoryBackTextLink>
          <h1 className="min-w-0 flex-1 truncate text-center sam-text-body font-bold text-sam-fg">
            {order.order_no}
          </h1>
          <OwnerOrderChatShortcut />
        </div>
      </header>

      <div className="mx-auto max-w-lg space-y-3 px-3 py-4">
        <section className="rounded-ui-rect bg-sam-surface p-4 shadow-sm ring-1 ring-sam-border-soft">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <OwnerOrderStatusBadge status={order.order_status} />
            <span className={`rounded-ui-rect px-2 py-0.5 text-xs font-bold ${fl.cls}`}>{fl.text}</span>
          </div>
          <p className="mt-2 text-xs text-sam-muted">
            {t("store_owner_order_placed_at")}{" "}
            {new Date(order.created_at).toLocaleString(dateLocale)}
          </p>
        </section>

        {order.community_messenger_room_id ? (
          <section className="rounded-ui-rect bg-sam-surface p-4 shadow-sm ring-1 ring-sam-border-soft">
            <h2 className="text-sm font-bold text-sam-fg">{t("nav_store_order_messenger_section_title")}</h2>
            <p className="mt-1 sam-text-xxs leading-relaxed text-sam-muted">{t("nav_store_order_messenger_section_hint")}</p>
            <div className="mt-3">
              <StoreOrderMessengerDeepLink
                roomId={order.community_messenger_room_id}
                context={buildMessengerContextInputFromOwnerOrder(order)}
              />
            </div>
          </section>
        ) : null}

        {order.buyer_cancel_request ? (
          <section className="rounded-ui-rect border border-amber-200 bg-amber-50 p-4 text-sm">
            <p className="font-bold text-amber-950">{t("business_phase7_022")}</p>
            <p className="mt-1 text-amber-900">{order.buyer_cancel_request.reason}</p>
          </section>
        ) : null}

        {order.order_status === "refund_requested" ? (
          <section className="rounded-ui-rect border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-bold">{t("business_phase7_329")}</p>
            <p className="mt-1 text-xs">{t("business_phase7_134")}</p>
          </section>
        ) : null}

        {order.cancel_reason ? (
          <section className="rounded-ui-rect border border-sam-border bg-sam-surface-muted p-4 text-sm text-sam-fg">
            <p className="font-bold">{t("business_phase7_009")}</p>
            <p className="mt-1">{order.cancel_reason}</p>
          </section>
        ) : null}

        {order.problem_memo ? (
          <section className="rounded-ui-rect border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <p className="font-bold">{t("business_phase7_098")}</p>
            <p className="mt-1">{order.problem_memo}</p>
          </section>
        ) : null}

        <section className="rounded-ui-rect bg-sam-surface p-4 shadow-sm ring-1 ring-sam-border-soft">
          <h2 className="text-sm font-bold text-sam-fg">{t("business_phase7_038")}</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-sam-muted">{t("business_phase7_275")}</dt>
              <dd className="font-medium text-sam-fg">{order.buyer_name}</dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-sam-muted">{t("business_phase7_194")}</dt>
              <dd className="flex flex-wrap items-center justify-end gap-2 font-mono text-sam-fg">
                <span>{order.buyer_phone}</span>
                {order.buyer_phone_tel_href ? (
                  <a
                    href={order.buyer_phone_tel_href}
                    className="rounded-full border border-signature/30 bg-signature/10 px-3 py-1 sam-text-helper font-semibold text-signature no-underline"
                  >
                    {t("store_phone_inquiry")}
                  </a>
                ) : null}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-sam-muted">{t("business_phase7_010")}</dt>
              <dd className="text-right font-medium text-sam-fg">
                {formatBuyerPaymentDisplay(
                  order.buyer_payment_method,
                  order.buyer_payment_method_detail,
                  language
                )}
              </dd>
            </div>
            {order.order_type === "delivery" ? (
              <div>
                <dt className="text-sam-muted">{t("business_phase7_115")}</dt>
                <dd className="mt-1 text-sam-fg">{order.delivery_address ?? "—"}</dd>
                {order.checkout_eta_summary?.trim() ? (
                  <div className="mt-3 space-y-1">
                    <p className="text-sam-muted">{t("business_phase7_107")}</p>
                    <p className="text-sam-fg">{order.checkout_eta_summary.trim()}</p>
                    <p className="sam-text-xxs text-sam-muted">
                      {t("store_owner_eta_recalc_hint")}
                    </p>
                  </div>
                ) : null}
                {order.delivery_courier_label?.trim() ? (
                  <div className="mt-3">
                    <dt className="text-sam-muted">{t("business_phase7_111")}</dt>
                    <dd className="mt-1 text-sam-fg">{order.delivery_courier_label.trim()}</dd>
                    <p className="mt-1 sam-text-xxs text-sam-muted">
                      {t("store_owner_courier_fee_notice")}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : order.order_type === "shipping" ? (
              <div>
                <dt className="text-sam-muted">{t("business_phase7_120")}</dt>
                <dd className="mt-1 text-sam-fg">{t("business_phase7_123")}</dd>
              </div>
            ) : (
              <div>
                <dt className="text-sam-muted">{t("business_phase7_321")}</dt>
                <dd className="mt-1 text-sam-fg">{order.pickup_note ?? "—"}</dd>
              </div>
            )}
            <div>
              <dt className="text-sam-muted">{t("business_phase7_020")}</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sam-fg">
                {order.request_message?.trim() || "—"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-ui-rect bg-sam-surface p-4 shadow-sm ring-1 ring-sam-border-soft">
          <h2 className="text-sm font-bold text-sam-fg">{t("business_phase7_272")}</h2>
          <div className="mt-3">
            <OwnerOrderItems items={order.items} />
          </div>
        </section>

        <section className="rounded-ui-rect bg-sam-surface p-4 shadow-sm ring-1 ring-sam-border-soft">
          <h2 className="text-sm font-bold text-sam-fg">{t("business_phase7_037")}</h2>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-sam-muted">{t("business_phase7_155")}</dt>
              <dd>{formatMoneyPhp(order.product_amount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sam-muted">{t("business_phase7_221")}</dt>
              <dd>{formatMoneyPhp(order.option_amount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sam-muted">
                {order.order_type === "delivery"
                  ? t("store_delivery_fee")
                  : order.order_type === "shipping"
                    ? t("store_shipping_fee")
                    : t("store_fee_other")}
              </dt>
              <dd>{formatMoneyPhp(order.delivery_fee)}</dd>
            </div>
            <div className="flex justify-between border-t border-sam-border-soft pt-2 text-base font-bold">
              <dt>{t("business_phase7_271")}</dt>
              <dd>{formatMoneyPhp(order.total_amount)}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-ui-rect bg-sam-surface p-4 shadow-sm ring-1 ring-sam-border-soft">
          <h2 className="text-sm font-bold text-sam-fg">{t("business_phase7_147")}</h2>
          <div className="mt-4">
            <OwnerOrderTimeline logs={order.logs} />
          </div>
        </section>

      </div>

      {!terminal ? (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-sam-border bg-sam-surface/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.06)] backdrop-blur md:hidden">
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
          <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <h2 className="text-sm font-bold text-sam-fg">{t("business_phase7_270")}</h2>
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
