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
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
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
  basic: { ko: "기본 정보", en: "Basics", letter: "A" },
  items: { ko: "주문 상품", en: "Items", letter: "B" },
  payment: { ko: "결제·환불", en: "Payment & refund", letter: "C" },
  delivery: { ko: "배달·픽업", en: "Delivery", letter: "D" },
  requests: { ko: "취소·환불 요청", en: "Cancel / refund requests", letter: "E" },
  commission: { ko: "수수료", en: "Commission", letter: "F" },
  admin: { ko: "관리자 작업 (예외 개입)", en: "Admin actions (exceptions)", letter: "G" },
  history: { ko: "처리 이력", en: "History", letter: "H" },
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
  const t = SECTION_TITLE[id];
  return (
    <section className="border-b border-sam-border-soft last:border-b-0" data-order-section={id}>
      <AdminActionButton
        variant="quiet"
        onClick={onToggle}
        aria-expanded={open}
        className="!h-auto w-full !justify-between !whitespace-normal !rounded-none px-4 py-3 text-left hover:bg-sam-surface-muted hover:no-underline"
      >
        <span className="sam-text-body font-semibold text-sam-fg">
          <span className="mr-1.5 text-sam-meta">{t.letter}</span>
          {ko ? t.ko : t.en}
        </span>
        <span className="sam-text-xxs text-sam-muted">{open ? (ko ? "접기" : "Hide") : ko ? "펼치기" : "Show"}</span>
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
      <div className="space-y-2 p-4" data-state="loading">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-ui-rect bg-sam-surface-muted" />
        ))}
      </div>
    );
  }
  if (error && !detail) {
    const text =
      error === "forbidden"
        ? ko
          ? "이 주문을 볼 권한이 없습니다."
          : "You do not have permission to view this order."
        : error === "order_not_found"
          ? ko
            ? "주문을 찾을 수 없습니다."
            : "Order not found."
          : error === "load_failed"
            ? ko
              ? "주문 정보를 불러오지 못했습니다."
              : "Failed to load the order."
            : ko
            ? `주문 정보를 불러오지 못했습니다. ${adminOperatorErrorMessage(error, true)}`
            : `Failed to load the order. ${adminOperatorErrorMessage(error, false)}`;
    return (
      <div className="space-y-3 p-4" data-state="error">
        <p role="alert" className="rounded-ui-rect bg-sam-danger-soft px-3 py-2 sam-text-helper text-sam-danger">
          {text}
        </p>
        {error !== "forbidden" && error !== "order_not_found" ? (
          <AdminActionButton variant="secondary" size="sm" onClick={() => void load()}>
            {adminCta("refresh", ko)}
          </AdminActionButton>
        ) : null}
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
    { href: `/admin/stores/orders/cancellations?q=${q}&order=${o.id}&section=requests`, label: ko ? "취소 요청에서 보기" : "In cancellations", show: isCancelFamily },
    { href: `/admin/stores/orders/refunds?q=${q}&order=${o.id}&section=payment`, label: ko ? "환불 요청에서 보기" : "In refunds", show: isRefundFamily },
    { href: `/admin/stores/orders/logs?q=${q}`, label: t("admin_menu_delivery_logs"), show: true },
    {
      href: withAdminReturnTo(`/admin/stores/orders/${encodeURIComponent(o.id)}/chat`, currentHref),
      label: ko ? "주문 채팅" : "Order chat",
      show: o.hasChat,
    },
    { href: `/admin/store-settlements?order_no=${q}`, label: ko ? "수수료 내역" : "Commission history", show: true },
    {
      href: withAdminReturnTo(`/admin/store-payment-events?order_id=${encodeURIComponent(o.id)}`, currentHref),
      label: ko ? "결제 수신 기록" : "Payment events",
      show: true,
    },
    {
      href: withAdminReturnTo(`/admin/users/${encodeURIComponent(o.buyerUserId)}`, currentHref),
      label: ko ? "구매자 회원" : "Buyer member",
      show: Boolean(o.buyerUserId),
    },
    {
      href: `/admin/stores/orders/by-store/${encodeURIComponent(o.storeId)}`,
      label: ko ? "매장 주문 목록" : "Store orders",
      show: Boolean(o.storeId),
    },
    {
      href: withAdminReturnTo(`/admin/support?reference_type=STORE_ORDER&reference_id=${encodeURIComponent(o.id)}`, currentHref),
      label: ko ? "고객 문의" : "Customer inquiries",
      show: true,
    },
    { href: `/admin/stores/orders/${encodeURIComponent(o.id)}`, label: ko ? "전체 화면으로 열기" : "Open full page", show: !fullPage },
  ];

  return (
    <div className="text-left" data-admin-order-detail={o.orderNo}>
      {/* 헤더 */}
      <div className="space-y-2 border-b border-sam-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-base font-semibold text-sam-fg">{o.orderNo}</span>
          <AdminActionButton variant="quiet" size="sm" onClick={() => void navigator.clipboard?.writeText(o.orderNo)}>
            {ko ? "복사" : "Copy"}
          </AdminActionButton>
          <span className="sam-text-helper text-sam-muted">{formatManilaDateTime(o.createdAt)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2.5 py-0.5 sam-text-xxs font-semibold ${adminStoreOrderStatusChipClass(o.orderStatus)}`}>
            {statusLabel(o.orderStatus)}
          </span>
          <span className="rounded-full bg-sam-surface-muted px-2.5 py-0.5 sam-text-xxs text-sam-fg">{payLabel}</span>
          {o.adminLocked ? (
            <span className="rounded-full bg-sam-danger-soft px-2.5 py-0.5 sam-text-xxs font-semibold text-sam-danger">{ko ? "관리자 잠금" : "Locked"}</span>
          ) : null}
          {o.needsAdminAttention ? (
            <span className="rounded-full bg-sam-warning-soft px-2.5 py-0.5 sam-text-xxs font-semibold text-sam-warning">{ko ? "운영 예외" : "Exception"}</span>
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
            {ko
              ? `최신 정보를 다시 불러오지 못했습니다. ${adminOperatorErrorMessage(error, true)}`
              : `Could not refresh. ${adminOperatorErrorMessage(error, false)}`}
          </p>
        ) : null}
      </div>

      <dl className="sam-text-helper">
        <Section id="basic" open={open.has("basic")} onToggle={() => toggle("basic")} ko={ko}>
          <Row label={ko ? "매장" : "Store"}>
            <Link href={businessCcBackToStoreHref(o.storeId)} className="underline">
              {o.storeName}
            </Link>
          </Row>
          <Row label={ko ? "구매자" : "Buyer"}>
            <Link href={memberOrdersByBuyerHref(o.buyerUserId)} className="underline">
              {o.buyerLabel}
            </Link>
          </Row>
          {o.buyerPhone ? <Row label={ko ? "연락처" : "Phone"}>{o.buyerPhone}</Row> : null}
          <Row label={ko ? "수령 방식" : "Fulfillment"}>{fulfill}</Row>
          {o.buyerNote ? <Row label={ko ? "요청사항" : "Note"}>{o.buyerNote}</Row> : null}
        </Section>

        <Section id="items" open={open.has("items")} onToggle={() => toggle("items")} ko={ko}>
          {detail.items.length === 0 ? (
            <p className="text-sam-muted" data-items-empty="1">
              {ko ? "상품 내역 없음 (상품 스냅샷이 기록되지 않은 주문)" : "No item snapshot recorded for this order"}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px]">
                <thead className="text-sam-muted">
                  <tr>
                    <th className="py-1 text-left font-medium">{ko ? "상품" : "Item"}</th>
                    <th className="py-1 text-left font-medium">{ko ? "옵션" : "Options"}</th>
                    <th className="py-1 text-right font-medium">{ko ? "단가 (기본+옵션)" : "Unit (base+opt)"}</th>
                    <th className="py-1 text-right font-medium">{ko ? "수량" : "Qty"}</th>
                    <th className="py-1 text-right font-medium">{ko ? "합계" : "Total"}</th>
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
            {m.itemsTotal != null ? <Row label={ko ? "상품 합계" : "Items total"}>{formatMoneyPhp(m.itemsTotal)}</Row> : null}
            <Row label={ko ? "배달비" : "Delivery fee"}>{formatMoneyPhp(m.deliveryFee)}</Row>
            <Row label={ko ? "주문금액" : "Order amount"}>
              <span className="font-semibold">{formatMoneyPhp(m.orderAmount)}</span>
            </Row>
          </div>
        </Section>

        <Section id="payment" open={open.has("payment")} onToggle={() => toggle("payment")} ko={ko}>
          <Row label={ko ? "결제수단" : "Method"}>{methodLabel}</Row>
          <Row label={ko ? "결제 상태" : "Payment status"}>{payLabel}</Row>
          <Row label={ko ? "주문금액" : "Order amount"}>{formatMoneyPhp(m.orderAmount)}</Row>
          {m.couponDiscount > 0 ? (
            <Row label={ko ? "쿠폰 할인" : "Coupon"}>
              −{formatMoneyPhp(m.couponDiscount)}
              <div className="sam-text-xxs text-sam-muted">
                {ko ? "플랫폼 부담" : "Platform"} {formatMoneyPhp(m.couponPlatformFunded)} · {ko ? "매장 부담" : "Store"}{" "}
                {formatMoneyPhp(m.couponStoreFunded)}
                {m.couponTitle ? ` · ${m.couponTitle}` : ""}
              </div>
            </Row>
          ) : null}
          {m.giftAmount > 0 ? (
            <Row label={ko ? "상품권" : "Gift certificate"}>
              −{formatMoneyPhp(m.giftAmount)}
              <div className="sam-text-xxs text-sam-muted">
                {m.giftSource === "ledger" ? t("admin_r4b_gift_source_record") : t("admin_r4b_gift_source_order")}
                {m.giftReversed ? (ko ? " · 복원됨" : " · reversed") : ""}
              </div>
            </Row>
          ) : null}
          <Row label={ko ? "고객 결제액" : "Customer paid"}>
            <span className="font-semibold">{formatMoneyPhp(m.customerPaid)}</span>
            <div className={`sam-text-xxs ${m.consistent ? "text-sam-success" : "text-sam-danger"}`} data-money-consistent={m.consistent ? "1" : "0"}>
              {m.consistent
                ? ko
                  ? "검증: 주문금액 − 할인 − 상품권 = 결제액 일치"
                  : "Check: amounts reconcile"
                : ko
                  ? "검증: 금액 불일치 — 기록된 값을 그대로 표시합니다 (보정하지 않음)"
                  : "Check: amounts do not reconcile — values shown as recorded"}
            </div>
          </Row>
          {o.orderStatus === "refunded" || o.refundedAt ? (
            <Row label={ko ? "환불" : "Refund"}>
              {ko ? "전액 환불" : "Full refund"} {formatMoneyPhp(m.customerPaid)}
              {o.refundedAt ? <div className="sam-text-xxs text-sam-muted">{formatManilaDateTime(o.refundedAt)}</div> : null}
            </Row>
          ) : null}
          {o.orderStatus === "cancelled" ? (
            <Row label={ko ? "취소" : "Cancelled"}>
              <span className="sam-text-xxs text-sam-muted">
                {ko ? "고객이 매장에 직접 결제하는 주문 — 플랫폼에는 반환 기록이 없습니다." : "Paid directly to the store — no platform refund record."}
              </span>
            </Row>
          ) : null}
        </Section>

        <Section id="delivery" open={open.has("delivery")} onToggle={() => toggle("delivery")} ko={ko}>
          <Row label={ko ? "수령 방식" : "Fulfillment"}>{fulfill}</Row>
          {o.deliveryAddress ? <Row label={ko ? "주소" : "Address"}>{o.deliveryAddress}</Row> : null}
          {o.deliveryNote ? <Row label={ko ? "배달 요청" : "Delivery note"}>{o.deliveryNote}</Row> : null}
          {o.acceptedAt ? <Row label={ko ? "접수" : "Accepted"}>{formatManilaDateTime(o.acceptedAt)}</Row> : null}
          {o.estimatedReadyAt ? <Row label={ko ? "준비 예정" : "Ready by"}>{formatManilaDateTime(o.estimatedReadyAt)}</Row> : null}
          {detail.riderFailureReportedAt ? (
            <Row label={ko ? "라이더 실패 신고" : "Rider failure report"}>{formatManilaDateTime(detail.riderFailureReportedAt)}</Row>
          ) : null}
          {detail.checkoutJudgement ? (
            <div className="mt-2 border-t border-sam-border pt-2" data-admin-checkout-judgement>
              <p className="mb-1 sam-text-xxs font-semibold text-sam-fg">
                {ko ? "주문 당시 판정 (주문 생성 시 저장값)" : "Judgement at order time (stored)"}
              </p>
              {detail.checkoutJudgement.eligible !== null ? (
                <Row label={ko ? "배달 가능" : "Deliverable"}>
                  {detail.checkoutJudgement.eligible ? (ko ? "예" : "Yes") : ko ? "아니오" : "No"}
                </Row>
              ) : null}
              {detail.checkoutJudgement.reason ? (
                <Row label={ko ? "판정 코드" : "Reason code"}>{detail.checkoutJudgement.reason}</Row>
              ) : null}
              {detail.checkoutJudgement.maxKm !== null ? (
                <Row label={ko ? "배달 반경" : "Max radius"}>{`${detail.checkoutJudgement.maxKm} km`}</Row>
              ) : null}
              {detail.checkoutJudgement.straightDistanceMeters !== null ? (
                <Row label={ko ? "직선거리" : "Straight distance"}>
                  {`${(detail.checkoutJudgement.straightDistanceMeters / 1000).toFixed(2)} km`}
                </Row>
              ) : null}
              {detail.checkoutJudgement.storeLatitude !== null && detail.checkoutJudgement.storeLongitude !== null ? (
                <Row label={ko ? "매장 좌표(당시)" : "Store coords (then)"}>
                  {`${detail.checkoutJudgement.storeLatitude}, ${detail.checkoutJudgement.storeLongitude}`}
                </Row>
              ) : null}
            </div>
          ) : null}
          <p className="mt-1 sam-text-xxs text-sam-muted">
            {ko ? "배달 진행 시각은 아래 「처리 이력」의 배달 진행에 있습니다." : "Delivery milestones are in History below."}
          </p>
        </Section>

        <Section id="requests" open={open.has("requests")} onToggle={() => toggle("requests")} ko={ko}>
          <p className="mb-2 sam-text-xxs text-sam-muted">
            {ko ? "취소·환불 요청은 매장이 결정합니다. 관리자는 예외 개입(G)만 합니다." : "The store decides requests; admins only intervene (G)."}
          </p>
          {detail.cancelRequests.length === 0 ? (
            <p className="text-sam-muted">{ko ? "취소 요청 기록이 없습니다." : "No cancel request records."}</p>
          ) : (
            <ul className="space-y-2">
              {detail.cancelRequests.map((r) => {
                const st = ADMIN_CANCEL_REQUEST_STATUS_LABEL[r.status];
                return (
                  <li key={r.id} className="rounded-ui-rect border border-sam-border-soft p-2" data-cancel-request={r.status}>
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="font-medium text-sam-fg">
                        {ko ? "취소 요청" : "Cancel request"} · {ko ? ADMIN_ORDER_REQUESTER_LABEL[r.requester].ko : ADMIN_ORDER_REQUESTER_LABEL[r.requester].en}
                      </span>
                      <span className="text-sam-muted">{st ? (ko ? st.ko : st.en) : r.status}</span>
                    </div>
                    <div className="sam-text-xxs text-sam-muted">
                      {ko ? "요청" : "Requested"} {formatManilaDateTime(r.requestedAt)}
                      {r.previousStatus ? ` · ${ko ? "요청 직전" : "From"} ${statusLabel(r.previousStatus)}` : ""}
                    </div>
                    <div className="mt-1 text-sam-fg">{r.reason || (ko ? "사유 없음" : "No reason")}</div>
                    {r.decidedAt ? (
                      <div className="mt-1 sam-text-xxs text-sam-muted">
                        {ko ? "처리" : "Decided"} {formatManilaDateTime(r.decidedAt)}
                        {r.decidedBy ? ` · ${r.decidedBy}` : ""}
                        {r.rejectedReason ? ` · ${ko ? "반려 사유" : "Reason"}: ${r.rejectedReason}` : ""}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {o.orderStatus === "refund_requested" || o.orderStatus === "refunded" ? (
            <p className="mt-2 sam-text-xxs text-sam-muted">
              {ko
                ? "환불 요청은 별도 기록이 없어 요청자·사유는 아래 처리 이력(감사 로그)에서 확인합니다."
                : "Refund requests have no separate ledger — see History for requester and reason."}
            </p>
          ) : null}
        </Section>

        <Section id="commission" open={open.has("commission")} onToggle={() => toggle("commission")} ko={ko}>
          <Row label={ko ? "수수료 부과 기준액" : "Commission base"}>{formatMoneyPhp(m.commissionBase)}</Row>
          <p className="sam-text-xxs text-sam-muted">
            {ko
              ? "기준액 = 고객 결제 + 상품권 + 플랫폼 쿠폰 부담. 부과 수수료와 상태는 아래 처리 이력과 「수수료 내역」에서 확인합니다. 고객은 매장에 직접 결제하므로 주문별 지급은 없습니다."
              : "Base = paid + gift + platform-funded coupon. Fee and state are under History and Commission history. Customers pay the store directly — there is no per-order payout."}
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
      title: locking ? (ko ? "주문 잠금" : "Lock order") : ko ? "잠금 해제" : "Unlock order",
      description: locking
        ? ko
          ? "잠그면 매장·구매자의 상태 변경이 막힙니다. 예외 처리 중에만 사용하세요."
          : "Locking blocks store and buyer status changes."
        : ko
          ? "잠금을 풀면 매장·구매자가 다시 상태를 바꿀 수 있습니다."
          : "Unlocking lets the store and buyer change status again.",
      confirmLabel: locking ? (ko ? "잠금" : "Lock") : ko ? "해제" : "Unlock",
      destructive: locking,
    });
    if (!c.ok) return;
    await patch({ admin_locked: locking }, locking ? (ko ? "잠금했습니다." : "Locked.") : ko ? "잠금을 해제했습니다." : "Unlocked.");
  };

  const toggleFlag = async () => {
    const flagging = !o.adminFlagged;
    const c = await confirmAdminAction({
      level: adminActionLevel("hold"),
      ko,
      title: flagging ? (ko ? "확인 필요 표시" : "Mark for review") : ko ? "확인 필요 표시 해제" : "Clear review mark",
      description: flagging
        ? ko
          ? "관리자 확인이 필요한 주문으로 표시합니다. 매장·구매자에게는 보이지 않습니다."
          : "Marks the order as needing admin review. Not visible to the store or buyer."
        : ko
          ? "확인 필요 표시를 해제합니다."
          : "Clears the review mark.",
      confirmLabel: flagging ? (ko ? "표시" : "Mark") : ko ? "해제" : "Clear",
    });
    if (!c.ok) return;
    await patch({ admin_flagged: flagging }, ko ? "확인 필요 표시를 변경했습니다." : "Review mark updated.");
  };

  /** 처리 필요 주문(운영 예외) 큐에서 내린다 — 서버 PATCH needs_admin_attention=false (CAS·감사). */
  const clearAttention = async () => {
    const c = await confirmAdminAction({
      level: adminActionLevel("approve"),
      ko,
      title: ko ? "운영 예외 해제" : "Resolve order exception",
      description: ko
        ? "처리 필요 주문 목록에서 이 주문을 내립니다. 주문 상태는 바뀌지 않으며, 매장·구매자에게는 보이지 않습니다."
        : "Removes this order from the exceptions queue. Order status does not change; not visible to the store or buyer.",
      confirmLabel: ko ? "해제" : "Resolve",
    });
    if (!c.ok) return;
    await patch(
      { needs_admin_attention: false, reason: c.reason ?? "" },
      ko ? "운영 예외를 해제했습니다." : "Exception resolved."
    );
  };

  const toggleUrgent = async () => {
    const urgent = o.disputeStatus !== "urgent";
    const c = await confirmAdminAction({
      level: adminActionLevel("hold"),
      ko,
      title: urgent ? (ko ? "긴급 표시" : "Mark urgent") : ko ? "긴급 해제" : "Clear urgent",
      description: urgent
        ? ko
          ? "이 주문을 긴급 처리 대상으로 표시합니다."
          : "Marks this order as urgent."
        : ko
          ? "긴급 표시를 해제합니다."
          : "Clears the urgent mark.",
      confirmLabel: urgent ? (ko ? "표시" : "Mark") : ko ? "해제" : "Clear",
    });
    if (!c.ok) return;
    await patch({ dispute_status: urgent ? "urgent" : "" }, ko ? "긴급 표시를 변경했습니다." : "Urgent updated.");
  };

  return (
    <div className="space-y-2" data-admin-order-meta="1">
      <div className="flex flex-wrap gap-2">
        <AdminActionButton variant="secondary" size="sm" disabled={busy} onClick={() => void toggleLock()}>
          {o.adminLocked ? (ko ? "잠금 해제" : "Unlock") : ko ? "주문 잠금" : "Lock order"}
        </AdminActionButton>
        <AdminActionButton variant="secondary" size="sm"
          disabled={busy}
          onClick={() => void toggleFlag()}
        >
          {o.adminFlagged ? (ko ? "확인 필요 해제" : "Clear review mark") : ko ? "확인 필요 표시" : "Mark for review"}
        </AdminActionButton>
        {o.needsAdminAttention ? (
          <AdminActionButton variant="secondary" size="sm" disabled={busy} onClick={() => void clearAttention()}>
            {ko ? "운영 예외 해제" : "Resolve exception"}
          </AdminActionButton>
        ) : null}
        <AdminActionButton variant="secondary" size="sm"
          disabled={busy}
          onClick={() => void toggleUrgent()}
        >
          {o.disputeStatus === "urgent" ? (ko ? "긴급 해제" : "Clear urgent") : ko ? "긴급 표시" : "Mark urgent"}
        </AdminActionButton>
      </div>
      <label className="block">
        <span className="sam-text-xxs text-sam-muted">{ko ? "운영 메모 (관리자만 봅니다)" : "Ops note (admins only)"}</span>
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
        onClick={() => void patch({ admin_note: note }, ko ? "메모를 저장했습니다." : "Note saved.")}
      >
        {ko ? "메모 저장" : "Save note"}
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
