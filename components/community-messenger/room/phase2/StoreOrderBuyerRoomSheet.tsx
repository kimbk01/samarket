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
import type { StoreOrderChatCardView } from "@/lib/store-order-chat/build-store-order-chat-card-view";
import { StoreOrderReceiptCard } from "@/components/community-messenger/room/phase2/StoreOrderReceiptCard";

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
}: Props) {
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
        className={`fixed inset-0 z-[260] bg-black/65 transition-opacity duration-300 ease-out ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => onOpenChange(false)}
        aria-hidden={!open}
      />
      <BuyerOrderDrawerShell open={open} onClose={() => onOpenChange(false)}>
        <div className="shrink-0 border-b border-[color:var(--cm-room-divider)] px-3 py-2.5">
          <BuyerOrderDrawerActions
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
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-[270] mx-auto flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[18px] border border-sam-border bg-sam-surface shadow-[0_-10px_32px_rgba(0,0,0,0.22)] transition-transform duration-300 ease-out sm:inset-y-4 sm:right-4 sm:left-auto sm:max-h-none sm:w-[24rem] sm:rounded-ui-rect ${
        open
          ? "translate-y-0 sm:translate-x-0"
          : "translate-y-full pointer-events-none sm:translate-x-full sm:translate-y-0"
      }`}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="store-order-phase2-drawer-title"
    >
      <BuyerOrderDrawerHeader onClose={onClose} />
      {children}
    </div>
  );
}

function BuyerOrderDrawerHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="relative flex shrink-0 items-center gap-2 border-b border-[color:var(--cm-room-divider)] px-3 py-3 pt-4">
      <div className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-[color:var(--cm-room-divider)] sm:hidden" aria-hidden />
      <h2
        id="store-order-phase2-drawer-title"
        className="min-w-0 flex-1 sam-text-body-lg font-semibold text-[color:var(--cm-room-text)]"
      >
        주문 내역
      </h2>
      <button
        type="button"
        onClick={onClose}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[color:var(--cm-room-text)] hover:bg-black/[0.05]"
        aria-label="닫기"
      >
        ×
      </button>
    </div>
  );
}

function BuyerOrderDrawerActions({
  canCancel,
  cancelBusy,
  onCancel,
  orderId,
  onNavigate,
}: {
  canCancel: boolean;
  cancelBusy: boolean;
  onCancel: () => void;
  orderId: string;
  onNavigate: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={!canCancel || cancelBusy}
        onClick={onCancel}
        className="inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-red-200/90 px-3.5 sam-text-body text-red-600 disabled:opacity-40"
      >
        주문취소
      </button>
      <Link
        href={`/mypage/store-orders/${encodeURIComponent(orderId)}`}
        onClick={onNavigate}
        className="inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-[color:var(--cm-room-divider)] px-3.5 sam-text-body text-[color:var(--cm-room-primary)]"
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
      {statusBannerVisible && statusLabel ? (
        <StatusBanner statusLabel={statusLabel} onDismiss={onDismissBanner} />
      ) : null}
      {orderCard ? <StoreOrderReceiptCard view={orderCard} viewer="buyer" /> : null}
      {!orderCard ? (
        <div className="relative overflow-hidden rounded-ui-rect bg-[color:var(--cm-room-surface-muted)] px-3.5 py-3.5 ring-1 ring-[color:var(--cm-room-divider)]">
          <ul className="space-y-2.5 sam-text-body text-[color:var(--cm-room-text)]">
        {order.fulfillment_type === "pickup" &&
        order.store_pickup_address_lines &&
        order.store_pickup_address_lines.length > 0 ? (
          <li className="flex gap-2">
            <span className="shrink-0" aria-hidden>
              🏪
            </span>
            <span className="min-w-0">
              <span className="block sam-text-helper font-semibold text-[color:var(--cm-room-text-muted)]">
                픽업 (매장 주소)
              </span>
              {order.store_pickup_address_lines.map((line, i) => (
                <span key={i} className="mt-0.5 block">
                  {line}
                </span>
              ))}
            </span>
          </li>
        ) : null}
        {order.fulfillment_type !== "pickup" && order.delivery_address_summary ? (
          <li className="flex gap-2">
            <span className="shrink-0" aria-hidden>
              🗺️
            </span>
            <span className="min-w-0">
              <span className="block sam-text-helper font-semibold text-[color:var(--cm-room-text-muted)]">
                배달 주소
              </span>
              <span className="mt-0.5 block">{order.delivery_address_summary}</span>
            </span>
          </li>
        ) : null}
        {order.fulfillment_type !== "pickup" && order.delivery_address_detail ? (
          <li className="flex gap-2">
            <span className="shrink-0" aria-hidden>
              ✏️
            </span>
            <span className="min-w-0">상세 : {order.delivery_address_detail}</span>
          </li>
        ) : null}
        {phoneDisplay ? (
          <li className="flex gap-2">
            <span className="shrink-0" aria-hidden>
              📞
            </span>
            {phoneHref != null ? (
              <a href={phoneHref} className="min-w-0 font-medium text-[color:var(--cm-room-primary)] underline">
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
              <span className="shrink-0" aria-hidden>
                🍲
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
          <li className="pl-7 sam-text-body-secondary text-[color:var(--cm-room-text-muted)]">
            배달비 : {formatMoneyPhp(order.delivery_fee_amount)}
          </li>
        ) : null}
        <li className="pl-7 font-semibold">주문 금액 합계 : {formatMoneyPhp(order.payment_amount)}</li>
        {order.buyer_note?.trim() ? (
          <li className="flex gap-2 border-t border-[color:var(--cm-room-divider)] pt-2.5">
            <span className="shrink-0 sam-text-helper font-semibold text-[color:var(--cm-room-text-muted)]">요청</span>
            <span className="min-w-0">{order.buyer_note.trim()}</span>
          </li>
        ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function StatusBanner({ statusLabel, onDismiss }: { statusLabel: string; onDismiss: () => void }) {
  return (
    <div className="mb-3 flex items-start justify-end gap-1">
      <span className="inline-flex max-w-[85%] items-center gap-1 rounded-full bg-amber-100 px-3 py-1.5 sam-text-helper font-semibold text-amber-900 ring-1 ring-amber-200/80">
        {statusLabel}
        <button
          type="button"
          onClick={onDismiss}
          className="rounded p-0.5 text-amber-800 hover:bg-amber-200/50"
          aria-label="상태 배너 닫기"
        >
          ×
        </button>
      </span>
    </div>
  );
}
