"use client";

import type { StoreOrderChatCardView } from "@/lib/store-order-chat/build-store-order-chat-card-view";
import { formatStoreOrderSummaryTimelineTime } from "@/lib/store-order-chat/store-order-summary-timeline";
import { formatMoneyPhp } from "@/lib/utils/format";
import { formatPhMobileDisplay, parsePhMobileInput } from "@/lib/utils/ph-mobile";

type Props = {
  view: StoreOrderChatCardView;
  viewer: "buyer" | "owner" | "system";
  compact?: boolean;
};

export function StoreOrderReceiptCard({ view, viewer, compact = false }: Props) {
  const showPrivate = viewer !== "system";
  const showFulfillmentDetails = viewer === "buyer" || viewer === "owner";
  const discountRate =
    view.totals.itemsSubtotal > 0
      ? Math.round((view.totals.discount / view.totals.itemsSubtotal) * 100)
      : 0;
  return (
    <article className="overflow-hidden rounded-ui-rect border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-surface)] text-left">
      <header className="border-b border-[color:var(--cm-room-divider)] bg-[color:var(--messenger-badge-delivery-bg)] px-3 py-2.5">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="rounded-ui-rect bg-white/65 px-2 py-0.5 sam-text-xxs font-bold text-[color:var(--cm-room-text)]">
            {view.fulfillmentLabel}주문
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
            주문 {view.orderNo}
          </p>
        ) : null}
      </header>

      <section className="px-3 py-2.5">
        {viewer === "system" ? (
          <StoreOrderMiniTimeline view={view} />
        ) : (
          <StoreOrderFulfillmentInfo view={view} />
        )}
      </section>

      <section className="border-t border-[color:var(--cm-room-divider)] px-3 py-2.5">
        <p className="mb-2 sam-text-xxs font-bold text-[color:var(--cm-room-text-muted)]">주문 품목</p>
        <div className="space-y-2">
          {view.items.length > 0 ? (
            view.items.map((item, idx) => (
              <div key={`${item.title}-${idx}`} className="rounded-ui-rect bg-[color:var(--cm-room-surface-muted)] px-2.5 py-2">
                <div className="grid grid-cols-[3.25rem_1fr] gap-x-2 gap-y-1 sam-text-xxs leading-relaxed">
                  <span className="font-semibold text-[color:var(--cm-room-text-muted)]">품목</span>
                  <span className="font-semibold text-[color:var(--cm-room-text)]">{item.title}</span>
                  <span className="font-semibold text-[color:var(--cm-room-text-muted)]">옵션</span>
                  <span className="text-[color:var(--cm-room-text)]">{item.options || "없음"}</span>
                  <span className="font-semibold text-[color:var(--cm-room-text-muted)]">수량</span>
                  <span className="text-[color:var(--cm-room-text)]">{item.qty}</span>
                  <span className="font-semibold text-[color:var(--cm-room-text-muted)]">금액</span>
                  <span className="font-semibold text-[color:var(--cm-room-text)]">
                    {formatMoneyPhp(item.unitPrice)} × {item.qty} = {formatMoneyPhp(item.subtotal)}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <p className="sam-text-helper text-[color:var(--cm-room-text-muted)]">품목 정보가 없습니다.</p>
          )}
        </div>
      </section>

      <section className="border-t border-[color:var(--cm-room-divider)] px-3 py-2.5">
        <MoneyRow label="상품금액" value={view.totals.itemsSubtotal} always />
        <MoneyRow label="배달비" value={view.totals.deliveryFee} always />
        <MoneyRow label="할인율" valueLabel={`${discountRate}%`} always />
        <MoneyRow label="할인금액" value={view.totals.discount} discount always />
        <div className="mt-2 border-t border-[color:var(--cm-room-divider)] pt-2">
          <MoneyRow label="결제금액" value={view.totals.paymentTotal} strong />
        </div>
        {view.paymentMethodLabel && !showFulfillmentDetails ? (
          <MoneyRow label="결제방법" valueLabel={view.paymentMethodLabel} always />
        ) : null}
      </section>

      {!compact && !showFulfillmentDetails && (showPrivate || view.buyerNote) ? (
        <section className="border-t border-[color:var(--cm-room-divider)] px-3 py-2.5 sam-text-xxs leading-relaxed text-[color:var(--cm-room-text)]">
          {showPrivate && view.addressLines.length > 0 ? (
            <InfoBlock title={view.isDelivery ? "배달 주소" : "픽업 주소"} lines={view.addressLines} />
          ) : null}
          {showPrivate && view.buyerPhone ? <InfoBlock title="연락처" lines={[view.buyerPhone]} /> : null}
          {view.buyerNote ? <InfoBlock title="요청사항" lines={[view.buyerNote]} /> : null}
          {view.estimatedPrepMinutes ? (
            <InfoBlock title="예상 준비 시간" lines={[`약 ${view.estimatedPrepMinutes}분`]} />
          ) : null}
        </section>
      ) : null}
    </article>
  );
}

function StoreOrderFulfillmentInfo({ view }: { view: StoreOrderChatCardView }) {
  const phone09 =
    view.buyerPhone != null && String(view.buyerPhone).trim()
      ? parsePhMobileInput(String(view.buyerPhone))
      : "";
  const phoneDisplay = phone09 ? formatPhMobileDisplay(phone09) : null;
  const addressTitle = view.isDelivery ? "배달 주소" : "픽업 주소";
  const addressText = view.addressLines.filter(Boolean).join(" ") || "—";
  return (
    <dl className="space-y-2.5 sam-text-xxs leading-relaxed">
      <DetailRow label={addressTitle} value={addressText} />
      <DetailRow label="연락처" value={phoneDisplay ?? "—"} />
      <DetailRow label="결제 방법" value={view.paymentMethodLabel?.trim() || "—"} />
      <DetailRow label="요청 사항" value={view.buyerNote?.trim() || "없음"} />
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

function StoreOrderMiniTimeline({ view }: { view: StoreOrderChatCardView }) {
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
            {formatStoreOrderSummaryTimelineTime(step.at) ?? (step.state === "current" ? "진행중" : "예정")}
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
