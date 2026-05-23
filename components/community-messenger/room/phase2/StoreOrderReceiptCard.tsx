"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { StoreOrderChatCardView } from "@/lib/store-order-chat/build-store-order-chat-card-view";
import { formatStoreOrderSummaryTimelineTime } from "@/lib/store-order-chat/store-order-summary-timeline";
import { formatMoneyPhp } from "@/lib/utils/format";
import { formatPhMobileDisplay, parsePhMobileInput } from "@/lib/utils/ph-mobile";

type StoreOrderI18nT = (key: MessageKey, vars?: Record<string, string | number>) => string;

type Props = {
  view: StoreOrderChatCardView;
  viewer: "buyer" | "owner" | "system";
  compact?: boolean;
};

export function StoreOrderReceiptCard({ view, viewer, compact = false }: Props) {
  const { t } = useI18n();
  const showPrivate = viewer !== "system";
  const showFulfillmentDetails = viewer === "buyer" || viewer === "owner";
  const discountRate =
    view.totals.itemsSubtotal > 0
      ? Math.round((view.totals.discount / view.totals.itemsSubtotal) * 100)
      : 0;
  const fulfillmentOrderLabel = view.isDelivery
    ? t("store_messenger_receipt_order_delivery")
    : t("store_messenger_receipt_order_pickup");
  const deliveryAddressTitle = t("store_delivery_address_heading");
  const pickupAddressTitle = t("store_pickup_address_heading");
  return (
    <article className="overflow-hidden rounded-ui-rect border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-surface)] text-left">
      <header className="border-b border-[color:var(--cm-room-divider)] bg-[color:var(--messenger-badge-delivery-bg)] px-3 py-2.5">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="rounded-ui-rect bg-white/65 px-2 py-0.5 sam-text-xxs font-bold text-[color:var(--cm-room-text)]">
            {fulfillmentOrderLabel}
          </span>
          <span className="shrink-0 sam-text-xxs font-semibold text-[color:var(--cm-room-primary)]">
            {view.statusLabel}
          </span>
        </div>
        <p className="truncate sam-text-body font-bold text-[color:var(--cm-room-text)]">
          {view.storeName}
        </p>
        {view.orderNo && !compact ? (
          <p className="mt-0.5 font-mono sam-text-xxs text-[color:var(--cm-room-text-muted)]">
            {t("store_messenger_receipt_order_line", { orderNo: view.orderNo })}
          </p>
        ) : null}
      </header>

      <section className="px-3 py-2.5">
        {viewer === "system" ? (
          <StoreOrderMiniTimeline view={view} t={t} />
        ) : (
          <StoreOrderFulfillmentInfo
            view={view}
            t={t}
            deliveryAddressTitle={deliveryAddressTitle}
            pickupAddressTitle={pickupAddressTitle}
          />
        )}
      </section>

      <section className="border-t border-[color:var(--cm-room-divider)] px-3 py-2.5">
        <p className="mb-2 sam-text-xxs font-bold text-[color:var(--cm-room-text-muted)]">
          {t("store_messenger_receipt_items_heading")}
        </p>
        <div className="space-y-2">
          {view.items.length > 0 ? (
            view.items.map((item, idx) => (
              <div key={`${item.title}-${idx}`} className="rounded-ui-rect bg-[color:var(--cm-room-surface-muted)] px-2.5 py-2">
                <div className="grid grid-cols-[3.25rem_1fr] gap-x-2 gap-y-1 sam-text-xxs leading-relaxed">
                  <span className="font-semibold text-[color:var(--cm-room-text-muted)]">{t("store_messenger_receipt_col_item")}</span>
                  <span className="font-semibold text-[color:var(--cm-room-text)]">{item.title}</span>
                  <span className="font-semibold text-[color:var(--cm-room-text-muted)]">{t("store_messenger_receipt_col_option")}</span>
                  <span className="text-[color:var(--cm-room-text)]">{item.options || t("store_none")}</span>
                  <span className="font-semibold text-[color:var(--cm-room-text-muted)]">{t("store_messenger_receipt_col_qty")}</span>
                  <span className="text-[color:var(--cm-room-text)]">{item.qty}</span>
                  <span className="font-semibold text-[color:var(--cm-room-text-muted)]">{t("store_messenger_receipt_col_amount")}</span>
                  <span className="font-semibold text-[color:var(--cm-room-text)]">
                    {formatMoneyPhp(item.unitPrice)} × {item.qty} = {formatMoneyPhp(item.subtotal)}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <p className="sam-text-helper text-[color:var(--cm-room-text-muted)]">{t("store_messenger_receipt_no_items")}</p>
          )}
        </div>
      </section>

      <section className="border-t border-[color:var(--cm-room-divider)] px-3 py-2.5">
        <MoneyRow label={t("member_order_product_amount")} value={view.totals.itemsSubtotal} always />
        <MoneyRow label={t("store_delivery_fee")} value={view.totals.deliveryFee} always />
        <MoneyRow label={t("mypage_comp_discount_rate")} valueLabel={`${discountRate}%`} always />
        <MoneyRow label={t("store_discount_amount")} value={view.totals.discount} discount always />
        <div className="mt-2 border-t border-[color:var(--cm-room-divider)] pt-2">
          <MoneyRow label={t("store_messenger_receipt_payment_total")} value={view.totals.paymentTotal} strong />
        </div>
        {view.paymentMethodLabel && !showFulfillmentDetails ? (
          <MoneyRow label={t("store_messenger_receipt_payment_method")} valueLabel={view.paymentMethodLabel} always />
        ) : null}
      </section>

      {!compact && !showFulfillmentDetails && (showPrivate || view.buyerNote) ? (
        <section className="border-t border-[color:var(--cm-room-divider)] px-3 py-2.5 sam-text-xxs leading-relaxed text-[color:var(--cm-room-text)]">
          {showPrivate && view.addressLines.length > 0 ? (
            <InfoBlock
              title={view.isDelivery ? deliveryAddressTitle : pickupAddressTitle}
              lines={view.addressLines}
            />
          ) : null}
          {showPrivate && view.buyerPhone ? (
            <InfoBlock title={t("store_label_contact")} lines={[view.buyerPhone]} />
          ) : null}
          {view.buyerNote ? <InfoBlock title={t("store_request_note")} lines={[view.buyerNote]} /> : null}
          {view.estimatedPrepMinutes ? (
            <InfoBlock
              title={t("store_messenger_receipt_prep_time")}
              lines={[t("store_messenger_receipt_prep_minutes", { minutes: view.estimatedPrepMinutes })]}
            />
          ) : null}
        </section>
      ) : null}
    </article>
  );
}

function StoreOrderFulfillmentInfo({
  view,
  t,
  deliveryAddressTitle,
  pickupAddressTitle,
}: {
  view: StoreOrderChatCardView;
  t: StoreOrderI18nT;
  deliveryAddressTitle: string;
  pickupAddressTitle: string;
}) {
  const phone09 =
    view.buyerPhone != null && String(view.buyerPhone).trim()
      ? parsePhMobileInput(String(view.buyerPhone))
      : "";
  const phoneDisplay = phone09 ? formatPhMobileDisplay(phone09) : null;
  const addressTitle = view.isDelivery ? deliveryAddressTitle : pickupAddressTitle;
  const addressText = view.addressLines.filter(Boolean).join(" ") || "—";
  return (
    <dl className="space-y-2.5 sam-text-xxs leading-relaxed">
      <DetailRow label={addressTitle} value={addressText} />
      <DetailRow label={t("store_label_contact")} value={phoneDisplay ?? "—"} />
      <DetailRow label={t("store_payment_method_required")} value={view.paymentMethodLabel?.trim() || t("store_none")} />
      <DetailRow label={t("store_request_optional_label")} value={view.buyerNote?.trim() || t("store_none")} />
    </dl>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[4.25rem_1fr] gap-x-2 gap-y-0.5">
      <dt className="font-semibold text-[color:var(--cm-room-text-muted)]">{label}</dt>
      <dd className="text-[color:var(--cm-room-text)] [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

function StoreOrderMiniTimeline({
  view,
  t,
}: {
  view: StoreOrderChatCardView;
  t: StoreOrderI18nT;
}) {
  const steps = view.timeline.filter((step) => step.state !== "na");
  return (
    <ol className="space-y-1.5">
      {steps.map((step) => (
        <li
          key={step.key}
          className={`flex items-center justify-between gap-2 rounded-ui-rect px-2 py-1.5 sam-text-xxs ${
            step.state === "current"
              ? "bg-[color:var(--cm-room-primary-soft)] font-bold text-[color:var(--cm-room-text)]"
              : step.state === "done"
                ? "text-[color:var(--cm-room-text-muted)] opacity-75"
                : "text-[color:var(--cm-room-text-muted)] opacity-45"
          }`}
        >
          <span>{step.label}</span>
          <span className="shrink-0 tabular-nums">
            {formatStoreOrderSummaryTimelineTime(step.at) ??
              (step.state === "current" ? t("store_messenger_timeline_in_progress") : t("store_messenger_timeline_scheduled"))}
          </span>
        </li>
      ))}
    </ol>
  );
}

function MoneyRow({
  label,
  value,
  strong = false,
  discount = false,
  always = false,
  valueLabel,
}: {
  label: string;
  value?: number;
  strong?: boolean;
  discount?: boolean;
  always?: boolean;
  valueLabel?: string;
}) {
  const n = value ?? 0;
  if (!always && n <= 0 && !strong) return null;
  return (
    <div className={`flex items-center justify-between gap-3 py-0.5 ${strong ? "sam-text-body font-bold" : "sam-text-xxs"}`}>
      <span className="text-[color:var(--cm-room-text-muted)]">{label}</span>
      <span className={strong ? "text-[color:var(--cm-room-text)]" : "text-[color:var(--cm-room-text)]"}>
        {valueLabel ?? `${discount ? "- " : ""}${formatMoneyPhp(n)}`}
      </span>
    </div>
  );
}

function InfoBlock({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="mb-2 last:mb-0">
      <p className="font-semibold text-[color:var(--cm-room-text-muted)]">{title}</p>
      {lines.map((line, idx) => (
        <p key={idx} className="mt-0.5 text-[color:var(--cm-room-text)]">
          {line}
        </p>
      ))}
    </div>
  );
}
