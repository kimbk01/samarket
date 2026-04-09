"use client";

import Link from "next/link";
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { formatMoneyPhp } from "@/lib/utils/format";
import {
  formatPhMobileDisplay,
  parsePhMobileInput,
  telHrefFromPhDb09,
} from "@/lib/utils/ph-mobile";
import { BUYER_ORDER_STATUS_LABEL } from "@/lib/stores/store-order-process-criteria";
import { orderLineOptionsSummary } from "@/lib/stores/product-line-options";

export type StoreOrderBuyerOrderPayload = {
  order_no?: string;
  order_status: string;
  payment_status: string;
  store_name: string;
  fulfillment_type?: string;
  /** 픽업 시 매장 등록 주소 */
  store_pickup_address_lines?: string[];
  delivery_address_summary?: string | null;
  delivery_address_detail?: string | null;
  buyer_phone?: string | null;
  buyer_note?: string | null;
  payment_amount: number;
  delivery_fee_amount?: number | null;
};

export type StoreOrderBuyerItemPayload = {
  product_title_snapshot: string;
  price_snapshot: number;
  qty: number;
  options_snapshot_json?: unknown;
};

type Props = {
  backHref: string;
  title: string;
  orderId: string;
  order: StoreOrderBuyerOrderPayload | null;
  items: StoreOrderBuyerItemPayload[];
  orderLoading: boolean;
  orderError: string | null;
  canCancel: boolean;
  cancelBusy: boolean;
  onCancel: () => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
  moreMenuPanel: React.ReactNode;
  onMoreMenuClick: () => void;
  chatRoomId: string;
  /** 패널을 열 때 아직 미전송이면 매장으로 확인 문구 자동 전송, 성공 시 true */
  onSendOrderMatchAck: () => Promise<boolean>;
  buyerChatSoundOn: boolean;
  onBuyerChatSoundOnChange: (on: boolean) => void;
};

export function StoreOrderBuyerChatTop({
  backHref,
  title,
  orderId,
  order,
  items,
  orderLoading,
  orderError,
  canCancel,
  cancelBusy,
  onCancel,
  menuRef,
  moreMenuPanel,
  onMoreMenuClick,
  chatRoomId,
  onSendOrderMatchAck,
  buyerChatSoundOn,
  onBuyerChatSoundOnChange,
}: Props) {
  const [statusBannerVisible, setStatusBannerVisible] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [matchAcked, setMatchAcked] = useState(false);
  const ackDoneRef = useRef(false);
  const ackSendingRef = useRef(false);
  const matchAckStorageKey = `kasama.storeOrder.matchAck.v1:${chatRoomId}`;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(matchAckStorageKey)) {
        ackDoneRef.current = true;
        setMatchAcked(true);
      }
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
      setMatchAcked(true);
    }
  }, [matchAckStorageKey, onSendOrderMatchAck]);

  useEffect(() => {
    if (!drawerOpen) return;
    void runMatchAckIfNeeded();
  }, [drawerOpen, runMatchAckIfNeeded]);

  useEffect(() => {
    if (!drawerOpen || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen || typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const statusLabel =
    order != null
      ? BUYER_ORDER_STATUS_LABEL[order.order_status] ?? order.order_status
      : "";

  const phone09 =
    order?.buyer_phone != null && String(order.buyer_phone).trim()
      ? parsePhMobileInput(String(order.buyer_phone))
      : "";
  const phoneDisplay = phone09 ? formatPhMobileDisplay(phone09) : "";
  const phoneHref = phone09 ? telHrefFromPhDb09(phone09) : null;

  const orderBody = (
    <>
      {orderLoading ? (
        <p className="text-center text-[14px] font-normal leading-[1.34] tracking-[-0.01em] text-muted">
          주문 정보 불러오는 중…
        </p>
      ) : orderError ? (
        <p className="text-center text-[14px] font-normal leading-[1.34] text-red-600">{orderError}</p>
      ) : order == null ? (
        <p className="text-center text-[14px] font-normal leading-[1.34] tracking-[-0.01em] text-muted">
          주문 정보를 불러올 수 없습니다.
        </p>
      ) : (
        <div className="relative overflow-hidden rounded-ui-rect bg-[var(--sub-bg)] px-3.5 py-3.5 shadow-none ring-1 ring-ig-border">
          {statusBannerVisible && statusLabel ? (
            <div className="mb-3 flex items-start justify-end gap-1">
              <span className="inline-flex max-w-[85%] items-center gap-1 rounded-full bg-amber-100 px-3 py-1.5 text-[12px] font-semibold leading-tight text-amber-900 ring-1 ring-amber-200/80">
                {statusLabel}
                <button
                  type="button"
                  onClick={() => setStatusBannerVisible(false)}
                  className="rounded p-0.5 text-amber-800 hover:bg-amber-200/50"
                  aria-label="상태 배너 닫기"
                >
                  ×
                </button>
              </span>
            </div>
          ) : null}

          <ul className="space-y-2.5 text-[14px] font-normal leading-[1.34] tracking-[-0.01em] text-foreground">
            {order.fulfillment_type === "pickup" &&
            order.store_pickup_address_lines &&
            order.store_pickup_address_lines.length > 0 ?
              <li className="flex gap-2">
                <span className="shrink-0" aria-hidden>
                  🏪
                </span>
                <span className="min-w-0">
                  <span className="block text-[12px] font-semibold text-muted">픽업 (매장 주소)</span>
                  {order.store_pickup_address_lines.map((line, i) => (
                    <span key={i} className="mt-0.5 block">
                      {line}
                    </span>
                  ))}
                </span>
              </li>
            : null}
            {order.fulfillment_type !== "pickup" && order.delivery_address_summary ?
              <li className="flex gap-2">
                <span className="shrink-0" aria-hidden>
                  🗺️
                </span>
                <span className="min-w-0">
                  <span className="block text-[12px] font-semibold text-muted">배달 주소</span>
                  <span className="mt-0.5 block">{order.delivery_address_summary}</span>
                </span>
              </li>
            : null}
            {order.fulfillment_type !== "pickup" && order.delivery_address_detail ?
              <li className="flex gap-2">
                <span className="shrink-0" aria-hidden>
                  ✏️
                </span>
                <span className="min-w-0">상세 : {order.delivery_address_detail}</span>
              </li>
            : null}
            {phoneDisplay ? (
              <li className="flex gap-2">
                <span className="shrink-0" aria-hidden>
                  📞
                </span>
                {phoneHref != null ? (
                  <a href={phoneHref} className="min-w-0 font-medium text-signature underline">
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
            Number(order.delivery_fee_amount) > 0 ?
              <li className="pl-7 text-[13px] text-muted">
                배달비 : {formatMoneyPhp(order.delivery_fee_amount)}
              </li>
            : null}
            <li className="pl-7 text-[15px] font-semibold leading-[1.34] tracking-[-0.02em] text-foreground">
              주문 금액 합계 : {formatMoneyPhp(order.payment_amount)}
            </li>
            {order.buyer_note?.trim() ? (
              <li className="flex gap-2 border-t border-ig-border pt-2.5 text-[14px] text-foreground">
                <span className="shrink-0 text-[12px] font-semibold text-muted">요청</span>
                <span className="min-w-0">{order.buyer_note.trim()}</span>
              </li>
            ) : null}
          </ul>
        </div>
      )}
    </>
  );

  const drawer =
    mounted && typeof document !== "undefined"
      ? createPortal(
          <>
            <div
              role="presentation"
              className={`fixed inset-0 z-[60] bg-black/40 transition-opacity duration-300 ease-out ${
                drawerOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
              }`}
              onClick={() => setDrawerOpen(false)}
              aria-hidden={!drawerOpen}
            />
            <div
              className={`fixed top-0 right-0 z-[70] flex h-[100dvh] w-[min(100vw,22rem)] flex-col bg-white shadow-[-6px_0_24px_rgba(0,0,0,0.12)] transition-transform duration-300 ease-out ${
                drawerOpen ? "translate-x-0" : "translate-x-full"
              }`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="store-order-drawer-title"
            >
              <div className="flex shrink-0 items-center gap-2 border-b border-ig-border px-3 py-3">
                <h2
                  id="store-order-drawer-title"
                  className="min-w-0 flex-1 text-[16px] font-semibold leading-[21px] tracking-[-0.02em] text-foreground"
                >
                  주문 내역
                </h2>
                <div className="relative flex shrink-0 items-center" ref={menuRef}>
                  <button
                    type="button"
                    onClick={onMoreMenuClick}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[20px] font-normal leading-none text-foreground hover:bg-black/[0.05]"
                    aria-label="메뉴"
                  >
                    ⋯
                  </button>
                  {moreMenuPanel}
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[22px] font-light leading-none text-foreground hover:bg-black/[0.05]"
                  aria-label="닫기"
                >
                  ×
                </button>
              </div>
              <div className="shrink-0 border-b border-ig-border px-3 py-2.5">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!canCancel || cancelBusy}
                    onClick={onCancel}
                    className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-red-200/90 bg-white px-3.5 text-[14px] font-normal leading-[18px] tracking-[-0.01em] text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-red-300 text-[13px] font-normal leading-none">
                      ×
                    </span>
                    <span className="flex items-center">주문취소</span>
                  </button>
                  <Link
                    href={`/my/store-orders/${encodeURIComponent(orderId)}`}
                    onClick={() => setDrawerOpen(false)}
                    className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-ig-border bg-white px-3.5 text-[14px] font-normal leading-[18px] tracking-[-0.01em] text-foreground"
                  >
                    <DocIcon className="h-[18px] w-[18px] shrink-0 text-muted" />
                    <span className="flex items-center">주문상세</span>
                  </Link>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">{orderBody}</div>
            </div>
          </>,
          document.body
        )
      : null;

  return (
    <>
      <div className="flex min-h-[44px] items-center gap-2 border-b border-ig-border bg-white px-2 py-1.5">
        <AppBackButton preferHistoryBack backHref={backHref} />
        <h1 className="min-w-0 flex-1 truncate text-center text-[16px] font-semibold leading-[21px] tracking-[-0.02em] text-foreground">
          {title}
        </h1>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => setDrawerOpen((v) => !v)}
            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-ui-rect text-neutral-800 hover:bg-black/[0.05] active:bg-black/[0.06] ${
              !matchAcked ? "ring-2 ring-amber-400/80 ring-offset-2 ring-offset-white" : ""
            }`}
            aria-expanded={drawerOpen}
            aria-label={drawerOpen ? "주문 내역 패널 닫기" : "주문 내역 패널 열기"}
          >
            <span className={`${!matchAcked ? "animate-pulse" : ""}`} aria-hidden>
              <svg
                className="h-5 w-5 text-neutral-800"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </span>
          </button>
          <button
            type="button"
            onClick={() => onBuyerChatSoundOnChange(!buyerChatSoundOn)}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-ui-rect text-neutral-800 hover:bg-black/[0.05]"
            aria-label={buyerChatSoundOn ? "채팅 알림음 켜짐 — 탭하면 끔" : "채팅 알림음 꺼짐 — 탭하면 켬"}
            aria-pressed={buyerChatSoundOn}
          >
            {buyerChatSoundOn ? (
              <svg
                className="h-[22px] w-[22px] text-neutral-800"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
            ) : (
              <span className="relative inline-flex h-[22px] w-[22px] items-center justify-center" aria-hidden>
                <svg
                  className="h-[22px] w-[22px] text-neutral-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
                <span className="pointer-events-none absolute -bottom-0.5 -right-1 text-[13px] leading-none">
                  🔇
                </span>
              </span>
            )}
          </button>
        </div>
      </div>

      {drawer}
    </>
  );
}

function DocIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}
