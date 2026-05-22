"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type {
  StoreOrderBuyerItemPayload,
  StoreOrderBuyerOrderPayload,
} from "@/components/chats/StoreOrderBuyerChatTop";
import { formatMoneyPhp } from "@/lib/utils/format";
import {
  formatPhMobileDisplay,
  parsePhMobileInput,
  telHrefFromPhDb09,
} from "@/lib/utils/ph-mobile";
import { BUYER_ORDER_STATUS_LABEL } from "@/lib/stores/store-order-process-criteria";
import { orderLineOptionsSummary } from "@/lib/stores/product-line-options";
import { isDeliveryFulfillment } from "@/lib/stores/order-status-transitions";
import type { StoreOrderChatCardView } from "@/lib/store-order-chat/build-store-order-chat-card-view";
import { StoreOrderDeliveryAddressDisplay } from "@/components/addresses/StoreOrderDeliveryAddressDisplay";
import { StoreOrderReceiptCard } from "@/components/community-messenger/room/phase2/StoreOrderReceiptCard";
import { VoiceCallIcon } from "@/components/community-messenger/room/community-messenger-room-helpers";
import {
  STORE_ORDER_DELIVERY_DETAIL_DRAWER_BACKDROP_TRANSITION_CLASS,
  STORE_ORDER_DELIVERY_DETAIL_DRAWER_TRANSFORM_CLASS,
  STORE_ORDER_DELIVERY_DETAIL_DRAWER_WIDTH_CLASS,
} from "@/lib/store-order-chat/store-order-delivery-detail-drawer-layout";

export type StoreOrderBuyerRoomSheetVariant = "bottom_sheet" | "peek";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  order: StoreOrderBuyerOrderPayload | null;
  items: StoreOrderBuyerItemPayload[];
  orderCard: StoreOrderChatCardView | null;
  orderLoading: boolean;
  orderError: string | null;
  canCancel: boolean;
  cancelBusy: boolean;
  onCancel: () => void;
  chatRoomId: string;
  onSendOrderMatchAck: () => Promise<boolean>;
  onVoiceCall: () => void;
  voiceCallDisabled?: boolean;
  /** 메신저 방 — 우→좌 75vw peek (기본 bottom_sheet) */
  sheetVariant?: StoreOrderBuyerRoomSheetVariant;
};

export function StoreOrderBuyerRoomSheet({
  open,
  onOpenChange,
  orderId,
  order,
  items,
  orderCard,
  orderLoading,
  orderError,
  canCancel,
  cancelBusy,
  onCancel,
  chatRoomId,
  onSendOrderMatchAck,
  onVoiceCall,
  voiceCallDisabled = false,
  sheetVariant = "bottom_sheet",
}: Props) {
  const peekDrawer = sheetVariant === "peek";
  const [mounted, setMounted] = useState(false);
  const [statusBannerVisible, setStatusBannerVisible] = useState(true);
  const ackDoneRef = useRef(false);
  const ackSendingRef = useRef(false);
  const matchAckStorageKey = `kasama.storeOrder.matchAck.v1:${chatRoomId}`;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(matchAckStorageKey)) ackDoneRef.current = true;
    } catch {
      /* ignore */
    }
  }, [matchAckStorageKey]);

  const runMatchAckIfNeeded = useCallback(async () => {
    if (ackDoneRef.current || ackSendingRef.current) return;
    ackSendingRef.current = true;
    const ok = await onSendOrderMatchAck();
    ackSendingRef.current = false;
    if (ok) {
      ackDoneRef.current = true;
      try {
        sessionStorage.setItem(matchAckStorageKey, "1");
      } catch {
        /* ignore */
      }
    }
  }, [matchAckStorageKey, onSendOrderMatchAck]);

  useEffect(() => {
    if (!open) return;
    void runMatchAckIfNeeded();
  }, [open, runMatchAckIfNeeded]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const statusLabel =
    order != null ? BUYER_ORDER_STATUS_LABEL[order.order_status] ?? order.order_status : "";

  const phone09 =
    order?.buyer_phone != null && String(order.buyer_phone).trim()
      ? parsePhMobileInput(String(order.buyer_phone))
      : "";
  const phoneDisplay = phone09 ? formatPhMobileDisplay(phone09) : "";
  const phoneHref = phone09 ? telHrefFromPhDb09(phone09) : null;

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        role="presentation"
        className={`fixed inset-0 z-[260] bg-black/40 ${
          peekDrawer
            ? STORE_ORDER_DELIVERY_DETAIL_DRAWER_BACKDROP_TRANSITION_CLASS
            : "transition-opacity duration-300 ease-out"
        } ${open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={() => onOpenChange(false)}
        aria-hidden={!open}
      />
      <BuyerOrderDrawerShell
        open={open}
        peekDrawer={peekDrawer}
        onClose={() => onOpenChange(false)}
        onVoiceCall={onVoiceCall}
        voiceCallDisabled={voiceCallDisabled}
      >
        <div className="shrink-0 border-b border-[color:var(--cm-room-divider)] px-3 py-2.5">
          <BuyerOrderDrawerActions
            peekDrawer={peekDrawer}
            canCancel={canCancel}
            cancelBusy={cancelBusy}
            onCancel={onCancel}
            orderId={orderId}
            onNavigate={() => onOpenChange(false)}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          <BuyerOrderDetailBody
            orderLoading={orderLoading}
            orderError={orderError}
            order={order}
            items={items}
            orderCard={orderCard}
            statusLabel={statusLabel}
            statusBannerVisible={statusBannerVisible}
            onDismissBanner={() => setStatusBannerVisible(false)}
            phoneDisplay={phoneDisplay}
            phoneHref={phoneHref}
          />
        </div>
      </BuyerOrderDrawerShell>
    </>,
    document.body
  );
}

function BuyerOrderDrawerShell({
  open,
  peekDrawer,
  onClose,
  onVoiceCall,
  voiceCallDisabled,
  children,
}: {
  open: boolean;
  peekDrawer: boolean;
  onClose: () => void;
  onVoiceCall: () => void;
  voiceCallDisabled: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={
        peekDrawer
          ? `fixed top-0 right-0 z-[270] flex h-[100dvh] ${STORE_ORDER_DELIVERY_DETAIL_DRAWER_WIDTH_CLASS} flex-col overflow-hidden border-l border-sam-border bg-sam-surface shadow-none ${STORE_ORDER_DELIVERY_DETAIL_DRAWER_TRANSFORM_CLASS} ${
              open ? "translate-x-0" : "pointer-events-none translate-x-full"
            }`
          : `delivery-ui fixed inset-x-0 bottom-0 z-[270] mx-auto flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[var(--delivery-radius)] border border-[color:var(--delivery-border)] bg-white shadow-none transition-transform duration-300 ease-out sm:inset-y-4 sm:right-4 sm:left-auto sm:max-h-none sm:w-[24rem] sm:rounded-[var(--delivery-radius)] ${
              open
                ? "translate-y-0 sm:translate-x-0"
                : "pointer-events-none invisible translate-y-full sm:translate-x-full sm:translate-y-0"
            }`
      }
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="store-order-phase2-drawer-title"
    >
      <BuyerOrderDrawerHeader
        onClose={onClose}
        onVoiceCall={onVoiceCall}
        voiceCallDisabled={voiceCallDisabled}
        peekDrawer={peekDrawer}
      />
      {children}
    </div>
  );
}

function BuyerOrderDrawerHeader({
  onClose,
  onVoiceCall,
  voiceCallDisabled,
  peekDrawer,
}: {
  onClose: () => void;
  onVoiceCall: () => void;
  voiceCallDisabled: boolean;
  peekDrawer: boolean;
}) {
  return (
    <div
      className={`relative flex shrink-0 items-center gap-2 border-b border-[color:var(--delivery-border)] bg-white px-4 py-3 ${peekDrawer ? "" : "pt-4"}`}
    >
      {!peekDrawer ? (
        <div className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-[color:var(--delivery-border)] sm:hidden" aria-hidden />
      ) : null}
      <h2
        id="store-order-phase2-drawer-title"
        className="min-w-0 flex-1 text-[17px] font-bold leading-[var(--delivery-lh-card-title)] text-[color:var(--delivery-dark)]"
      >
        주문 진행 상황
      </h2>
      <button
        type="button"
        onClick={onVoiceCall}
        disabled={voiceCallDisabled}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--delivery-radius)] text-[color:var(--delivery-primary)] transition hover:bg-[color:var(--delivery-primary-soft)] disabled:opacity-35"
        aria-label="음성 통화"
      >
        <VoiceCallIcon className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={onClose}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--delivery-radius)] text-[color:var(--delivery-dark)] hover:bg-[color:var(--delivery-primary-soft)]"
        aria-label="닫기"
      >
        ×
      </button>
    </div>
  );
}

function BuyerOrderDrawerActions({
  peekDrawer,
  canCancel,
  cancelBusy,
  onCancel,
  orderId,
  onNavigate,
}: {
  peekDrawer: boolean;
  canCancel: boolean;
  cancelBusy: boolean;
  onCancel: () => void;
  orderId: string;
  onNavigate: () => void;
}) {
  if (peekDrawer) {
    return (
      <div>
        <button
          type="button"
          disabled={!canCancel || cancelBusy}
          onClick={onCancel}
          className="inline-flex h-10 w-full items-center justify-center rounded-[4px] border border-red-200/90 px-3 sam-text-body font-bold text-red-600 transition active:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {cancelBusy ? "처리 중…" : "주문취소"}
        </button>
        {!canCancel ? (
          <p className="mt-1.5 sam-text-xxs leading-snug text-[#6B7280]">
            매장이 주문을 접수한 뒤에는 여기서 취소할 수 없습니다.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={!canCancel || cancelBusy}
        onClick={onCancel}
        className="inline-flex h-9 shrink-0 items-center justify-center rounded-[4px] border border-red-200/90 px-3.5 sam-text-body text-red-600 disabled:opacity-40"
      >
        주문취소
      </button>
      <Link
        href={`/mypage/store-orders/${encodeURIComponent(orderId)}`}
        onClick={onNavigate}
        className="inline-flex h-9 shrink-0 items-center justify-center rounded-[var(--delivery-radius)] border border-[color:var(--delivery-border)] px-3.5 text-[14px] font-semibold text-[color:var(--delivery-primary)]"
      >
        주문상세
      </Link>
    </div>
  );
}

function BuyerOrderDetailBody({
  orderLoading,
  orderError,
  order,
  items,
  orderCard,
  statusLabel,
  statusBannerVisible,
  onDismissBanner,
  phoneDisplay,
  phoneHref,
}: {
  orderLoading: boolean;
  orderError: string | null;
  order: StoreOrderBuyerOrderPayload | null;
  items: StoreOrderBuyerItemPayload[];
  orderCard: StoreOrderChatCardView | null;
  statusLabel: string;
  statusBannerVisible: boolean;
  onDismissBanner: () => void;
  phoneDisplay: string;
  phoneHref: string | null;
}) {
  if (orderLoading) {
    return <p className="text-center sam-text-body text-[color:var(--cm-room-text-muted)]">주문 정보 불러오는 중…</p>;
  }
  if (orderError) {
    return <p className="text-center sam-text-body text-red-600">{orderError}</p>;
  }
  if (!order) {
    return (
      <p className="text-center sam-text-body text-[color:var(--cm-room-text-muted)]">
        주문 정보를 불러올 수 없습니다.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <BuyerOpsStatusCard
        order={order}
        statusLabel={statusLabel}
        visible={statusBannerVisible}
        onDismiss={onDismissBanner}
      />
      {orderCard ? <StoreOrderReceiptCard view={orderCard} viewer="buyer" /> : null}
      {!orderCard ? (
        <div className="relative overflow-hidden rounded-[4px] border border-[#DDE5E0] bg-white px-3.5 py-3.5">
          <ul className="space-y-2.5 sam-text-body text-[#123B4A]">
        {order.fulfillment_type === "pickup" &&
        order.store_pickup_address_lines &&
        order.store_pickup_address_lines.length > 0 ? (
          <li className="flex gap-2">
            <span className="shrink-0 rounded-[var(--delivery-radius)] bg-[color:var(--delivery-primary-soft)] px-1.5 py-0.5 text-[11px] font-bold text-[color:var(--delivery-primary)]">
              픽업
            </span>
            <span className="min-w-0">
              <span className="block sam-text-helper font-bold text-[#6B7280]">
                매장 주소
              </span>
              {order.store_pickup_address_lines.map((line, i) => (
                <span key={i} className="mt-0.5 block">
                  {line}
                </span>
              ))}
            </span>
          </li>
        ) : null}
        {order.fulfillment_type !== "pickup" &&
        (order.delivery_address_summary?.trim() || order.delivery_address_detail?.trim()) ? (
          <li className="flex gap-2">
            <span className="shrink-0 rounded-[var(--delivery-radius)] bg-[color:var(--delivery-primary-soft)] px-1.5 py-0.5 text-[11px] font-bold text-[color:var(--delivery-primary)]">
              배달
            </span>
            <span className="min-w-0">
              <span className="block sam-text-helper font-bold text-[#6B7280]">
                배달 주소
              </span>
              <StoreOrderDeliveryAddressDisplay
                className="mt-0.5"
                summary={order.delivery_address_summary}
                detail={order.delivery_address_detail}
                showDetailLabel={false}
              />
            </span>
          </li>
        ) : null}
        {phoneDisplay ? (
          <li className="flex gap-2">
            <span className="shrink-0 rounded-[var(--delivery-radius)] bg-[color:var(--delivery-primary-soft)] px-1.5 py-0.5 text-[11px] font-bold text-[color:var(--delivery-primary)]">
              전화
            </span>
            {phoneHref != null ? (
              <a href={phoneHref} className="min-w-0 font-bold text-[color:var(--delivery-primary)] underline">
                {phoneDisplay}
              </a>
            ) : (
              <span className="min-w-0">{phoneDisplay}</span>
            )}
          </li>
        ) : null}
        {items.map((it, idx) => {
          const opt = orderLineOptionsSummary(it.options_snapshot_json);
          const titleLine = [it.product_title_snapshot, opt].filter(Boolean).join(" · ");
          return (
            <li key={idx} className="flex gap-2">
              <span className="shrink-0 rounded-[var(--delivery-radius)] bg-[color:var(--delivery-primary-soft)] px-1.5 py-0.5 text-[11px] font-bold text-[color:var(--delivery-primary)]">
                메뉴
              </span>
              <span className="min-w-0">
                {titleLine} {formatMoneyPhp(it.price_snapshot)} × {it.qty}
              </span>
            </li>
          );
        })}
        {order.fulfillment_type !== "pickup" &&
        order.delivery_fee_amount != null &&
        Number(order.delivery_fee_amount) > 0 ? (
          <li className="pl-7 sam-text-body-secondary text-[#6B7280]">
            배달비 : {formatMoneyPhp(order.delivery_fee_amount)}
          </li>
        ) : null}
        <li className="pl-7 font-semibold">주문 금액 합계 : {formatMoneyPhp(order.payment_amount)}</li>
        {order.buyer_note?.trim() ? (
          <li className="flex gap-2 border-t border-[#DDE5E0] pt-2.5">
            <span className="shrink-0 text-[12px] font-bold text-[color:var(--delivery-primary)]">요청</span>
            <span className="min-w-0">{order.buyer_note.trim()}</span>
          </li>
        ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function BuyerOpsStatusCard({
  order,
  statusLabel,
  visible,
  onDismiss,
}: {
  order: StoreOrderBuyerOrderPayload;
  statusLabel: string;
  visible: boolean;
  onDismiss: () => void;
}) {
  const steps = buyerChatFlowSteps(order.fulfillment_type ?? "pickup");
  const current = buyerChatCurrentStep(order.order_status, order.fulfillment_type ?? "pickup");
  return (
    <section className="rounded-[var(--delivery-radius)] border border-[color:var(--delivery-border)] bg-[color:var(--delivery-primary)] p-3 text-white">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold leading-[1.35] text-white/75">{order.order_no ?? "주문"}</p>
          <p className="mt-0.5 text-[15px] font-bold leading-[1.35]">{statusLabel || "주문 진행중"}</p>
          <p className="mt-1 text-[12px] leading-[1.35] text-white/75">
            {order.fulfillment_type === "pickup" ? "픽업 주문" : "배달 주문"} · {formatMoneyPhp(order.payment_amount)}
          </p>
        </div>
        {visible ? (
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-[4px] px-2 py-1 text-[12px] font-bold text-white/80 hover:bg-white/10"
          aria-label="주문 상태 요약 접기"
        >
          ×
        </button>
        ) : null}
      </div>
      {visible ? (
        <div
          className="mt-3 grid gap-1"
          style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
        >
          {steps.map((step, idx) => {
            const active = idx === current;
            const done = idx < current;
            return (
              <div key={step} className="min-w-0">
                <div className={`h-1.5 rounded-full ${done || active ? "bg-white" : "bg-white/25"}`} />
                <p className={`mt-1 truncate text-center text-[10px] font-bold leading-[1.25] ${done || active ? "text-white" : "text-white/45"}`}>
                  {step}
                </p>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function buyerChatFlowSteps(fulfillmentType: string): string[] {
  return isDeliveryFulfillment(fulfillmentType)
    ? ["신규", "접수", "조리", "배달준비", "배달중", "주소근처", "완료"]
    : ["신규", "접수", "조리", "픽업준비", "수령완료"];
}

function buyerChatCurrentStep(status: string, fulfillmentType: string): number {
  if (isDeliveryFulfillment(fulfillmentType)) {
    if (status === "accepted") return 1;
    if (status === "preparing") return 2;
    if (status === "ready_for_pickup") return 3;
    if (status === "delivering") return 4;
    if (status === "arrived") return 5;
    if (status === "completed") return 6;
    return 0;
  }
  if (status === "accepted") return 1;
  if (status === "preparing") return 2;
  if (status === "ready_for_pickup") return 3;
  if (status === "completed") return 4;
  return 0;
}
