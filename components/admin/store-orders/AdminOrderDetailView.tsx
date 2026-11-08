"use client";

/**
 * 공통 주문 상세 (모달 · 전체 화면 공용) — 관리자 주문 운영 6개 화면이 같은 상세를 연다.
 * Data: GET /api/admin/store-orders/[orderId]/detail (+ history panel: …/history).
 * Sections A–H (docs/admin-store-order-ops-ssot.md §5). Money comes from the server; the only
 * browser arithmetic is the integrity check (compare only).
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { withAdminReturnTo } from "@/lib/admin/admin-operation-return-context";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminStoreOrderInterventionPanel } from "@/components/admin/delivery-orders/AdminStoreOrderInterventionPanel";
import { AdminStoreOrderHistoryPanel } from "@/components/admin/delivery-orders/AdminStoreOrderHistoryPanel";
import { AdminOrderAuditTable } from "@/components/admin/store-orders/AdminOrderAuditTable";
import { emitAdminQueueChanged } from "@/lib/admin/admin-queue-events";
import { businessCcBackToStoreHref } from "@/lib/admin-business/business-control-center-links";
import { memberOrdersByBuyerHref } from "@/lib/admin-users/member-deep-links";
import {
  ADMIN_CANCEL_REQUEST_STATUS_LABEL,
  ADMIN_ORDER_MONEY_MISMATCH_LABEL,
  ADMIN_ORDER_PAYMENT_METHOD_MISSING,
  ADMIN_ORDER_REQUESTER_LABEL,
  type AdminOrderDetailSection,
} from "@/lib/admin/store-orders/admin-store-order-detail-contract";
import {
  ADMIN_STORE_ORDERS_FULFILLMENT_LABEL,
  ADMIN_STORE_ORDERS_PAYMENT_LABEL,
  adminStoreOrderStatusChipClass,
  type AdminStoreOrdersFulfillment,
  type AdminStoreOrdersPaymentStatus,
} from "@/lib/admin/store-orders/admin-store-orders-contract";
import { ADMIN_STORE_ORDER_STATUS_LABEL_KEYS } from "@/lib/admin/store-orders/admin-store-order-status-labels";
import type { AdminOrderDetail } from "@/lib/admin/store-orders/load-admin-store-order-detail";
import { formatManilaDateTime } from "@/lib/stores/commission/store-commission-ledger-query";
import { formatBuyerPaymentDisplay } from "@/lib/stores/payment-methods-config";
import type { StoreOrderStatus } from "@/lib/stores/order-status-transitions";
import { formatMoneyPhp } from "@/lib/utils/format";
import { catalogPair } from "@/lib/i18n/catalog-pair";

type Props = {
  orderId: string;
  /** Section opened first (entry screen). */
  initialSection?: AdminOrderDetailSection | null;
  /** Called after an admin action changed the order (row refresh on the list). */
  onChanged?: () => void;
  /** Full-page variant hides the 「전체 화면으로 열기」 link. */
  fullPage?: boolean;
  /** Bumped by the page on realtime row changes → reload in place (sections stay as they are). */
  reloadSignal?: number;
};

const SECTION_TITLE: Record<AdminOrderDetailSection, { ko: string; en: string; letter: string }> = {
  basic: { ...catalogPair("admin_delivery_ads_section_basic"), letter: "A" },
  items: { ...catalogPair("admin_items"), letter: "B" },
  payment: { ...catalogPair("admin_payment_refund"), letter: "C" },
  delivery: { ...catalogPair("admin_delivery_2"), letter: "D" },
  requests: { ...catalogPair("admin_do_card_cancel_refund_req"), letter: "E" },
  commission: { ...catalogPair("admin_commission"), letter: "F" },
  admin: { ...catalogPair("admin_admin_actions_exceptions"), letter: "G" },
  history: { ...catalogPair("admin_history"), letter: "H" },
};

/** Sections folded by default (G admin actions stays closed unless the entry screen opens it). */
const FOLDED_BY_DEFAULT = new Set<AdminOrderDetailSection>(["admin"]);

function Section({
  id,
  open,
  onToggle,
  ko,
  children,
}: {
  id: AdminOrderDetailSection;
  open: boolean;
  onToggle: () => void;
  ko: boolean;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const sec = SECTION_TITLE[id];
  return (
    <section className="border-b border-sam-border-soft last:border-b-0" data-order-section={id}>
      <AdminActionButton
        variant="quiet"
        onClick={onToggle}
        aria-expanded={open}
        className="!h-auto w-full !justify-between !whitespace-normal !rounded-none px-4 py-3 text-left hover:bg-sam-surface-muted hover:no-underline"
      >
        <span className="sam-text-body font-semibold text-sam-fg">
          <span className="mr-1.5 text-sam-meta">{sec.letter}</span>
          {ko ? sec.ko : sec.en}
        </span>
        <span className="sam-text-xxs text-sam-muted">{open ? (t("admin_store_orders_hide")) : t("admin_store_orders_show")}</span>
      </AdminActionButton>
      {open ? <div className="px-4 pb-4">{children}</div> : null}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <dt className="shrink-0 text-sam-muted">{label}</dt>
      <dd className="min-w-0 text-right text-sam-fg [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

export function AdminOrderDetailView({ orderId, initialSection = null, onChanged, fullPage = false, reloadSignal = 0 }: Props) {
  const { t, language } = useI18n();
  const ko = language === "ko";
  const [detail, setDetail] = useState<AdminOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyKey, setHistoryKey] = useState(0);
  const [open, setOpen] = useState<Set<AdminOrderDetailSection>>(() => {
    const s = new Set<AdminOrderDetailSection>(Object.keys(SECTION_TITLE) as AdminOrderDetailSection[]);
    for (const f of FOLDED_BY_DEFAULT) s.delete(f);
    if (initialSection) s.add(initialSection);
    return s;
  });
  const abortRef = useRef<AbortController | null>(null);
  /** Current admin URL — used as returnTo for links that leave the order (e.g. member detail). */
  const [currentHref, setCurrentHref] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setCurrentHref(`${window.location.pathname}${window.location.search}`);
  }, [orderId]);

  const statusLabel = useCallback(
    (s: string) => {
      const key = ADMIN_STORE_ORDER_STATUS_LABEL_KEYS[s as StoreOrderStatus];
      return key ? t(key) : s;
    },
    [t]
  );

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/store-orders/${encodeURIComponent(orderId)}/detail`, {
        credentials: "include",
        cache: "no-store",
        signal: ac.signal,
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string } & Partial<AdminOrderDetail>;
      if (ac.signal.aborted) return;
      if (res.status === 401 || res.status === 403) throw new Error("forbidden");
      if (!res.ok || j.ok !== true) throw new Error(typeof j.error === "string" ? j.error : "load_failed");
      setDetail(j as AdminOrderDetail);
    } catch (e) {
      if (ac.signal.aborted) return;
      const msg = e instanceof Error ? e.message : "network_error";
      setError(msg === "Failed to fetch" ? "network_error" : msg);
    } finally {
      if (abortRef.current === ac) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  }, [orderId]);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  const lastSignalRef = useRef(reloadSignal);
  useEffect(() => {
    if (reloadSignal === lastSignalRef.current) return;
    lastSignalRef.current = reloadSignal;
    void load();
    setHistoryKey((k) => k + 1);
  }, [load, reloadSignal]);

  // Scroll the entry section into view once the detail is there.
  const scrolledRef = useRef(false);
  useEffect(() => {
    if (!detail || !initialSection || scrolledRef.current) return;
    scrolledRef.current = true;
    requestAnimationFrame(() => {
      document.querySelector(`[data-order-section="${initialSection}"]`)?.scrollIntoView({ block: "start" });
    });
  }, [detail, initialSection]);

  const afterChange = useCallback(async () => {
    await load();
    setHistoryKey((k) => k + 1);
    onChanged?.();
  }, [load, onChanged]);

  const toggle = (id: AdminOrderDetailSection) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (loading && !detail) {
    return (
      <div className="p-4" data-state="loading">
        <AdminLoadingState ko={ko} />
      </div>
    );
  }
  if (error && !detail) {
    /** 4종 상태 (AdminStateViews) — 주문 없음(빈) · 접근 거부 · 불러오기 실패(+새로고침)를 구분한다. */
    return (
      <div className="p-4" data-state="error">
        {error === "order_not_found" ? (
          <AdminEmptyState ko={ko} message={t("admin_store_orders_order_not_found")} />
        ) : (
          <AdminErrorState ko={ko} code={error} onRetry={error === "forbidden" ? undefined : () => void load()} />
        )}
      </div>
    );
  }
  if (!detail) return null;

  const o = detail.order;
  const m = detail.money;
  const payLabel = ADMIN_STORE_ORDERS_PAYMENT_LABEL[o.paymentStatus as AdminStoreOrdersPaymentStatus]?.[ko ? "ko" : "en"] ?? o.paymentStatus;
  const methodLabel = o.paymentMethod
    ? formatBuyerPaymentDisplay(o.paymentMethod, o.paymentMethodDetail, ko ? "ko" : "en")
    : ko
      ? ADMIN_ORDER_PAYMENT_METHOD_MISSING.ko
      : ADMIN_ORDER_PAYMENT_METHOD_MISSING.en;
  const fulfill =
    ADMIN_STORE_ORDERS_FULFILLMENT_LABEL[o.fulfillmentType as AdminStoreOrdersFulfillment]?.[ko ? "ko" : "en"] ?? o.fulfillmentType;
  const q = encodeURIComponent(o.orderNo);
  const isCancelFamily = o.orderStatus === "cancel_requested" || o.orderStatus === "cancelled" || detail.cancelRequests.length > 0;
  const isRefundFamily = o.orderStatus === "refund_requested" || o.orderStatus === "refunded";

  const related: { href: string; label: string; show: boolean }[] = [
    { href: `/admin/stores/orders/cancellations?q=${q}&order=${o.id}&section=requests`, label: t("admin_store_orders_cancellations"), show: isCancelFamily },
    { href: `/admin/stores/orders/refunds?q=${q}&order=${o.id}&section=payment`, label: t("admin_store_orders_refunds"), show: isRefundFamily },
    { href: `/admin/stores/orders/logs?q=${q}`, label: t("admin_menu_delivery_logs"), show: true },
    {
      href: withAdminReturnTo(`/admin/stores/orders/${encodeURIComponent(o.id)}/chat`, currentHref),
      label: t("admin_store_orders_order_chat"),
      show: o.hasChat,
    },
    { href: `/admin/store-settlements?order_no=${q}`, label: t("admin_store_orders_commission_history"), show: true },
    {
      href: withAdminReturnTo(`/admin/store-payment-events?order_id=${encodeURIComponent(o.id)}`, currentHref),
      label: t("admin_store_orders_payment_events"),
      show: true,
    },
    {
      href: withAdminReturnTo(`/admin/users/${encodeURIComponent(o.buyerUserId)}`, currentHref),
      label: t("admin_store_orders_buyer_member"),
      show: Boolean(o.buyerUserId),
    },
    {
      href: `/admin/stores/orders/by-store/${encodeURIComponent(o.storeId)}`,
      label: t("admin_store_orders_store_orders"),
      show: Boolean(o.storeId),
    },
    {
      href: withAdminReturnTo(`/admin/support?reference_type=STORE_ORDER&reference_id=${encodeURIComponent(o.id)}`, currentHref),
      label: t("admin_store_orders_customer_inquiries"),
      show: true,
    },
    { href: `/admin/stores/orders/${encodeURIComponent(o.id)}`, label: t("admin_store_orders_open_full_page_2"), show: !fullPage },
  ];

  return (
    <div className="text-left" data-admin-order-detail={o.orderNo}>
      {/* 헤더 */}
      <div className="space-y-2 border-b border-sam-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-base font-semibold text-sam-fg">{o.orderNo}</span>
          <AdminActionButton variant="quiet" size="sm" onClick={() => void navigator.clipboard?.writeText(o.orderNo)}>
            {t("common_copy")}
          </AdminActionButton>
          <span className="sam-text-helper text-sam-muted">{formatManilaDateTime(o.createdAt)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2.5 py-0.5 sam-text-xxs font-semibold ${adminStoreOrderStatusChipClass(o.orderStatus)}`}>
            {statusLabel(o.orderStatus)}
          </span>
          <span className="rounded-full bg-sam-surface-muted px-2.5 py-0.5 sam-text-xxs text-sam-fg">{payLabel}</span>
          {o.adminLocked ? (
            <span className="rounded-full bg-sam-danger-soft px-2.5 py-0.5 sam-text-xxs font-semibold text-sam-danger">{t("admin_store_orders_locked")}</span>
          ) : null}
          {o.needsAdminAttention ? (
            <span className="rounded-full bg-sam-warning-soft px-2.5 py-0.5 sam-text-xxs font-semibold text-sam-warning">{t("admin_store_orders_exception")}</span>
          ) : null}
          {m.mismatches.map((x) => (
            <span key={x} className="rounded-full bg-sam-danger-soft px-2.5 py-0.5 sam-text-xxs font-semibold text-sam-danger" data-money-mismatch={x}>
              {ko ? ADMIN_ORDER_MONEY_MISMATCH_LABEL[x].ko : ADMIN_ORDER_MONEY_MISMATCH_LABEL[x].en}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" data-related-links="1">
          {related
            .filter((r) => r.show)
            .map((r) => (
              <AdminActionLink key={r.href} href={r.href} variant="secondary" size="sm">
                {r.label}
              </AdminActionLink>
            ))}
        </div>
        {error ? (
          <p role="alert" className="sam-text-xxs text-sam-danger">
            {t("admin_store_orders_refresh_failed_detail", { detail: adminOperatorErrorMessage(error, ko) })}
          </p>
        ) : null}
      </div>

      <dl className="sam-text-helper">
        <Section id="basic" open={open.has("basic")} onToggle={() => toggle("basic")} ko={ko}>
          <Row label={t("common_store")}>
            <Link href={businessCcBackToStoreHref(o.storeId)} className="underline">
              {o.storeName}
            </Link>
          </Row>
          <Row label={t("admin_store_orders_buyer")}>
            <Link href={memberOrdersByBuyerHref(o.buyerUserId)} className="underline">
              {o.buyerLabel}
            </Link>
          </Row>
          {o.buyerPhone ? <Row label={t("admin_store_orders_phone")}>{o.buyerPhone}</Row> : null}
          <Row label={t("admin_store_orders_fulfillment")}>{fulfill}</Row>
          {o.buyerNote ? <Row label={t("admin_store_orders_note")}>{o.buyerNote}</Row> : null}
        </Section>

        <Section id="items" open={open.has("items")} onToggle={() => toggle("items")} ko={ko}>
          {detail.items.length === 0 ? (
            <p className="text-sam-muted" data-items-empty="1">
              {t("admin_store_orders_no_item_snapshot_recorded_order")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px]">
                <thead className="text-sam-muted">
                  <tr>
                    <th className="py-1 text-left font-medium">{t("admin_store_orders_item")}</th>
                    <th className="py-1 text-left font-medium">{t("admin_store_orders_options")}</th>
                    <th className="py-1 text-right font-medium">{t("admin_store_orders_unit_base_opt")}</th>
                    <th className="py-1 text-right font-medium">{t("admin_store_orders_qty")}</th>
                    <th className="py-1 text-right font-medium">{t("admin_store_orders_total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((it) => (
                    <tr key={it.id} className="border-t border-sam-border-soft align-top">
                      <td className="py-1.5 pr-2 text-sam-fg">{it.title}</td>
                      <td className="py-1.5 pr-2 text-sam-muted">
                        {it.options.length > 0
                          ? it.options.map((op, i) => (
                              <div key={i}>
                                {op.group ? `${op.group}: ` : ""}
                                {op.name}
                                {op.qty > 1 ? ` ×${op.qty}` : ""} (+{formatMoneyPhp(op.unitDelta)})
                              </div>
                            ))
                          : it.optionSummary ?? "—"}
                      </td>
                      <td className="whitespace-nowrap py-1.5 text-right tabular-nums text-sam-fg">
                        {formatMoneyPhp(it.unitPrice)}
                        {it.basePrice != null && it.optionUnitDelta !== 0 ? (
                          <div className="sam-text-xxs text-sam-muted">
                            {formatMoneyPhp(it.basePrice)} + {formatMoneyPhp(it.optionUnitDelta)}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{it.qty}</td>
                      <td className="whitespace-nowrap py-1.5 text-right tabular-nums font-medium">{formatMoneyPhp(it.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-2 border-t border-sam-border-soft pt-2">
            {m.itemsTotal != null ? <Row label={t("admin_store_orders_items_total")}>{formatMoneyPhp(m.itemsTotal)}</Row> : null}
            <Row label={t("admin_store_orders_delivery_fee")}>{formatMoneyPhp(m.deliveryFee)}</Row>
            <Row label={t("admin_store_orders_order_amount")}>
              <span className="font-semibold">{formatMoneyPhp(m.orderAmount)}</span>
            </Row>
          </div>
        </Section>

        <Section id="payment" open={open.has("payment")} onToggle={() => toggle("payment")} ko={ko}>
          <Row label={t("admin_store_orders_method")}>{methodLabel}</Row>
          <Row label={t("admin_store_orders_payment_status")}>{payLabel}</Row>
          <Row label={t("admin_store_orders_order_amount")}>{formatMoneyPhp(m.orderAmount)}</Row>
          {m.couponDiscount > 0 ? (
            <Row label={t("admin_store_orders_coupon")}>
              −{formatMoneyPhp(m.couponDiscount)}
              <div className="sam-text-xxs text-sam-muted">
                {t("admin_store_orders_platform")} {formatMoneyPhp(m.couponPlatformFunded)} · {t("admin_store_orders_store")}{" "}
                {formatMoneyPhp(m.couponStoreFunded)}
                {m.couponTitle ? ` · ${m.couponTitle}` : ""}
              </div>
            </Row>
          ) : null}
          {m.giftAmount > 0 ? (
            <Row label={t("admin_store_orders_gift_certificate")}>
              −{formatMoneyPhp(m.giftAmount)}
              <div className="sam-text-xxs text-sam-muted">
                {m.giftSource === "ledger" ? t("admin_r4b_gift_source_record") : t("admin_r4b_gift_source_order")}
                {m.giftReversed ? (t("admin_store_orders_reversed")) : ""}
              </div>
            </Row>
          ) : null}
          <Row label={t("admin_store_orders_customer_paid")}>
            <span className="font-semibold">{formatMoneyPhp(m.customerPaid)}</span>
            <div className={`sam-text-xxs ${m.consistent ? "text-sam-success" : "text-sam-danger"}`} data-money-consistent={m.consistent ? "1" : "0"}>
              {m.consistent
                ? t("admin_store_orders_check_amounts_reconcile")
                : t("admin_store_orders_check_amounts_do_not_reconcile")}
            </div>
          </Row>
          {o.orderStatus === "refunded" || o.refundedAt ? (
            <Row label={t("admin_store_orders_refund")}>
              {t("admin_store_orders_full_refund")} {formatMoneyPhp(m.customerPaid)}
              {o.refundedAt ? <div className="sam-text-xxs text-sam-muted">{formatManilaDateTime(o.refundedAt)}</div> : null}
            </Row>
          ) : null}
          {o.orderStatus === "cancelled" ? (
            <Row label={t("admin_store_orders_cancelled")}>
              <span className="sam-text-xxs text-sam-muted">
                {t("admin_store_orders_paid_directly_store_no_platform")}
              </span>
            </Row>
          ) : null}
        </Section>

        <Section id="delivery" open={open.has("delivery")} onToggle={() => toggle("delivery")} ko={ko}>
          <Row label={t("admin_store_orders_fulfillment")}>{fulfill}</Row>
          {o.deliveryAddress ? <Row label={t("admin_store_orders_address")}>{o.deliveryAddress}</Row> : null}
          {o.deliveryNote ? <Row label={t("admin_store_orders_delivery_note")}>{o.deliveryNote}</Row> : null}
          {o.acceptedAt ? <Row label={t("admin_store_orders_accepted")}>{formatManilaDateTime(o.acceptedAt)}</Row> : null}
          {o.estimatedReadyAt ? <Row label={t("admin_store_orders_ready")}>{formatManilaDateTime(o.estimatedReadyAt)}</Row> : null}
          {detail.riderFailureReportedAt ? (
            <Row label={t("admin_store_orders_rider_failure_report")}>{formatManilaDateTime(detail.riderFailureReportedAt)}</Row>
          ) : null}
          {detail.checkoutJudgement ? (
            <div className="mt-2 border-t border-sam-border pt-2" data-admin-checkout-judgement>
              <p className="mb-1 sam-text-xxs font-semibold text-sam-fg">
                {t("admin_store_orders_judgement_at_order_time_stored")}
              </p>
              {detail.checkoutJudgement.eligible !== null ? (
                <Row label={t("admin_store_orders_deliverable")}>
                  {detail.checkoutJudgement.eligible ? (t("admin_store_orders_yes")) : t("admin_store_orders_no")}
                </Row>
              ) : null}
              {detail.checkoutJudgement.reason ? (
                <Row label={t("admin_store_orders_reason_code")}>{detail.checkoutJudgement.reason}</Row>
              ) : null}
              {detail.checkoutJudgement.maxKm !== null ? (
                <Row label={t("admin_store_orders_max_radius")}>{`${detail.checkoutJudgement.maxKm} km`}</Row>
              ) : null}
              {detail.checkoutJudgement.straightDistanceMeters !== null ? (
                <Row label={t("admin_store_orders_straight_distance")}>
                  {`${(detail.checkoutJudgement.straightDistanceMeters / 1000).toFixed(2)} km`}
                </Row>
              ) : null}
              {detail.checkoutJudgement.storeLatitude !== null && detail.checkoutJudgement.storeLongitude !== null ? (
                <Row label={t("admin_store_orders_store_coords_then")}>
                  {`${detail.checkoutJudgement.storeLatitude}, ${detail.checkoutJudgement.storeLongitude}`}
                </Row>
              ) : null}
            </div>
          ) : null}
          <p className="mt-1 sam-text-xxs text-sam-muted">
            {t("admin_store_orders_delivery_milestones_history_below")}
          </p>
        </Section>

        <Section id="requests" open={open.has("requests")} onToggle={() => toggle("requests")} ko={ko}>
          <p className="mb-2 sam-text-xxs text-sam-muted">
            {t("admin_store_orders_store_decides_requests_admins_only")}
          </p>
          {detail.cancelRequests.length === 0 ? (
            <p className="text-sam-muted">{t("admin_store_orders_no_cancel_request_records")}</p>
          ) : (
            <ul className="space-y-2">
              {detail.cancelRequests.map((r) => {
                const st = ADMIN_CANCEL_REQUEST_STATUS_LABEL[r.status];
                return (
                  <li key={r.id} className="rounded-ui-rect border border-sam-border-soft p-2" data-cancel-request={r.status}>
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="font-medium text-sam-fg">
                        {t("admin_store_orders_cancel_request")} · {ko ? ADMIN_ORDER_REQUESTER_LABEL[r.requester].ko : ADMIN_ORDER_REQUESTER_LABEL[r.requester].en}
                      </span>
                      <span className="text-sam-muted">{st ? (ko ? st.ko : st.en) : r.status}</span>
                    </div>
                    <div className="sam-text-xxs text-sam-muted">
                      {t("admin_store_orders_requested")} {formatManilaDateTime(r.requestedAt)}
                      {r.previousStatus ? ` · ${t("admin_store_orders_from")} ${statusLabel(r.previousStatus)}` : ""}
                    </div>
                    <div className="mt-1 text-sam-fg">{r.reason || (t("admin_store_orders_no_reason"))}</div>
                    {r.decidedAt ? (
                      <div className="mt-1 sam-text-xxs text-sam-muted">
                        {t("admin_store_orders_decided")} {formatManilaDateTime(r.decidedAt)}
                        {r.decidedBy ? ` · ${r.decidedBy}` : ""}
                        {r.rejectedReason ? ` · ${t("admin_store_orders_reason_2")}: ${r.rejectedReason}` : ""}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {o.orderStatus === "refund_requested" || o.orderStatus === "refunded" ? (
            <p className="mt-2 sam-text-xxs text-sam-muted">
              {t("admin_store_orders_refund_requests_have_no_separate")}
            </p>
          ) : null}
        </Section>

        <Section id="commission" open={open.has("commission")} onToggle={() => toggle("commission")} ko={ko}>
          <Row label={t("admin_store_orders_commission_base")}>{formatMoneyPhp(m.commissionBase)}</Row>
          <p className="sam-text-xxs text-sam-muted">
            {t("admin_store_orders_base_paid_gift_platform_funded")}
          </p>
        </Section>

        <Section id="admin" open={open.has("admin")} onToggle={() => toggle("admin")} ko={ko}>
          <AdminOrderMetaControls detail={detail} ko={ko} onChanged={afterChange} />
          <div className="mt-3">
            <AdminStoreOrderInterventionPanel
              orderId={o.id}
              orderNo={o.orderNo}
              orderStatus={o.orderStatus}
              paymentStatus={o.paymentStatus}
              statusLabel={statusLabel}
              onChanged={afterChange}
            />
          </div>
        </Section>

        <Section id="history" open={open.has("history")} onToggle={() => toggle("history")} ko={ko}>
          <AdminOrderAuditTable rows={detail.audit} statusLabel={statusLabel} compact />
          <div className="mt-3">
            <AdminStoreOrderHistoryPanel orderId={o.id} orderNo={o.orderNo} statusLabel={statusLabel} reloadKey={historyKey} />
          </div>
        </Section>
      </dl>
    </div>
  );
}

/**
 * Lock / flag / urgent / memo — PATCH /api/admin/store-orders/[id] meta fields.
 * Every write carries `expected_updated_at` (the row version this screen shows); a 409
 * `stale_updated_at` means another admin changed the order first → conflict notice + reload.
 */
function AdminOrderMetaControls({
  detail,
  ko,
  onChanged,
}: {
  detail: AdminOrderDetail;
  ko: boolean;
  onChanged: () => Promise<void>;
}) {
  const { t } = useI18n();
  const o = detail.order;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(o.adminNote ?? "");
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  useEffect(() => setNote(o.adminNote ?? ""), [o.id, o.adminNote]);

  const patch = async (body: Record<string, unknown>, okText: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/store-orders/${encodeURIComponent(o.id)}`, {
        method: "PATCH",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, expected_updated_at: o.updatedAt ?? "" }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.status === 409 || j.error === "stale_updated_at" || j.error === "expected_updated_at_required") {
        setNotice({ tone: "error", text: t("admin_r4b_meta_conflict") });
        await onChanged();
        return;
      }
      if (!res.ok || j.ok !== true) {
        const code = typeof j.error === "string" ? j.error : res.status === 403 ? "forbidden" : "update_failed";
        throw new Error(adminOperatorErrorMessage(code, ko));
      }
      emitAdminQueueChanged("orders_attention");
      setNotice({ tone: "ok", text: okText });
      await onChanged();
    } catch (e) {
      setNotice({ tone: "error", text: e instanceof Error ? e.message : adminOperatorErrorMessage("network_error", ko) });
    } finally {
      setBusy(false);
    }
  };

  const toggleLock = async () => {
    const locking = !o.adminLocked;
    const c = await confirmAdminAction({
      level: adminActionLevel(locking ? "hold" : "resume"),
      ko,
      title: locking ? (t("admin_store_orders_lock_order")) : t("admin_store_orders_unlock_order"),
      description: locking
        ? t("admin_store_orders_locking_blocks_store_buyer_status")
        : t("admin_store_orders_unlocking_lets_store_buyer_change"),
      confirmLabel: locking ? (t("admin_store_orders_lock")) : t("admin_store_orders_unlock"),
      destructive: locking,
    });
    if (!c.ok) return;
    await patch({ admin_locked: locking }, locking ? (t("admin_store_orders_locked_2")) : t("admin_store_orders_unlocked"));
  };

  const toggleFlag = async () => {
    const flagging = !o.adminFlagged;
    const c = await confirmAdminAction({
      level: adminActionLevel("hold"),
      ko,
      title: flagging ? (t("admin_store_orders_mark_review")) : t("admin_store_orders_clear_review_mark"),
      description: flagging
        ? t("admin_store_orders_marks_order_as_needing_admin")
        : t("admin_store_orders_clears_review_mark"),
      confirmLabel: flagging ? (t("admin_store_orders_mark")) : t("admin_store_orders_clear"),
    });
    if (!c.ok) return;
    await patch({ admin_flagged: flagging }, t("admin_store_orders_review_mark_updated"));
  };

  /** 처리 필요 주문(운영 예외) 큐에서 내린다 — 서버 PATCH needs_admin_attention=false (CAS·감사). */
  const clearAttention = async () => {
    const c = await confirmAdminAction({
      level: adminActionLevel("approve"),
      ko,
      title: t("admin_store_orders_resolve_order_exception"),
      description: t("admin_store_orders_removes_order_from_exceptions_queue"),
      confirmLabel: t("admin_store_orders_resolve"),
    });
    if (!c.ok) return;
    await patch(
      { needs_admin_attention: false, reason: c.reason ?? "" },
      t("admin_store_orders_exception_resolved")
    );
  };

  const toggleUrgent = async () => {
    const urgent = o.disputeStatus !== "urgent";
    const c = await confirmAdminAction({
      level: adminActionLevel("hold"),
      ko,
      title: urgent ? (t("admin_store_orders_mark_urgent")) : t("admin_store_orders_clear_urgent"),
      description: urgent
        ? t("admin_store_orders_marks_order_as_urgent")
        : t("admin_store_orders_clears_urgent_mark"),
      confirmLabel: urgent ? (t("admin_store_orders_mark")) : t("admin_store_orders_clear"),
    });
    if (!c.ok) return;
    await patch({ dispute_status: urgent ? "urgent" : "" }, t("admin_store_orders_urgent_updated"));
  };

  return (
    <div className="space-y-2" data-admin-order-meta="1">
      <div className="flex flex-wrap gap-2">
        <AdminActionButton variant="secondary" size="sm" disabled={busy} onClick={() => void toggleLock()}>
          {o.adminLocked ? (t("admin_store_orders_unlock_2")) : t("admin_store_orders_lock_order")}
        </AdminActionButton>
        <AdminActionButton variant="secondary" size="sm"
          disabled={busy}
          onClick={() => void toggleFlag()}
        >
          {o.adminFlagged ? (t("admin_store_orders_clear_review_mark_2")) : t("admin_store_orders_mark_review")}
        </AdminActionButton>
        {o.needsAdminAttention ? (
          <AdminActionButton variant="secondary" size="sm" disabled={busy} onClick={() => void clearAttention()}>
            {t("admin_store_orders_resolve_exception")}
          </AdminActionButton>
        ) : null}
        <AdminActionButton variant="secondary" size="sm"
          disabled={busy}
          onClick={() => void toggleUrgent()}
        >
          {o.disputeStatus === "urgent" ? (t("admin_store_orders_clear_urgent")) : t("admin_store_orders_mark_urgent")}
        </AdminActionButton>
      </div>
      <label className="block">
        <span className="sam-text-xxs text-sam-muted">{t("admin_store_orders_ops_note_admins_only")}</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          disabled={busy}
          className="mt-1 w-full rounded-ui-rect border border-sam-border-soft bg-sam-app px-3 py-2 sam-text-helper text-sam-fg"
        />
      </label>
      <AdminActionButton variant="secondary" size="sm"
        disabled={busy || note === (o.adminNote ?? "")}
        onClick={() => void patch({ admin_note: note }, t("admin_store_orders_note_saved"))}
      >
        {t("admin_store_orders_save_note")}
      </AdminActionButton>
      {notice ? (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={`rounded-ui-rect px-3 py-2 sam-text-helper ${notice.tone === "error" ? "bg-sam-danger-soft text-sam-danger" : "bg-sam-success-soft text-sam-success"}`}
        >
          {notice.text}
        </p>
      ) : null}
    </div>
  );
}
