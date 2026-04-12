"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { OrderChatRoomClient } from "@/components/order-chat/OrderChatRoomClient";

const BOTTOM_OVER_NAV =
  "bottom-[calc(4rem+env(safe-area-inset-bottom,0px))]" as const;

/** `bottom` 클래스(4rem+safe) + 여백을 반영해, 아래쪽 카드여도 채팅 영역 최소 높이 확보 */
function computeModalTopPx(anchorTopPx: number): number {
  if (typeof window === "undefined") {
    return Number.isFinite(anchorTopPx) ? Math.max(56, Math.floor(anchorTopPx)) : 120;
  }
  const vh = window.visualViewport?.height ?? window.innerHeight;
  const navReserve = 64;
  const safeGuess = 20;
  const gap = 8;
  const bottomReserve = navReserve + safeGuess + gap;
  const minChatPx = Math.min(400, Math.max(260, Math.round(vh * 0.42)));
  const maxTop = Math.max(56, Math.round(vh - bottomReserve - minChatPx));
  const raw = Number.isFinite(anchorTopPx) ? Math.max(56, Math.floor(anchorTopPx)) : 120;
  return Math.min(raw, maxTop);
}

type Props = {
  open: boolean;
  onClose: () => void;
  storeId: string;
  orderId: string;
  /** 뷰포트 기준 `getBoundingClientRect().bottom` — 상품준비(회색) 박스 하단 */
  anchorTopPx: number;
};

export function OwnerStoreOrderChatModal({ open, onClose, storeId, orderId, anchorTopPx }: Props) {
  const [mounted, setMounted] = useState(false);
  const [layoutTopPx, setLayoutTopPx] = useState(() => computeModalTopPx(anchorTopPx));

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useLayoutEffect(() => {
    if (!open) return;
    const apply = () => setLayoutTopPx(computeModalTopPx(anchorTopPx));
    apply();
    window.addEventListener("resize", apply);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("resize", apply);
      vv?.removeEventListener("resize", apply);
    };
  }, [open, anchorTopPx]);

  if (!mounted || !open) return null;

  const listHref = buildStoreOrdersHref({ storeId, orderId });

  return createPortal(
    <div className="fixed inset-0 z-[190]" role="presentation">
      <button
        type="button"
        className="absolute inset-0 z-0 bg-black/45"
        aria-label="채팅 닫기"
        onClick={onClose}
      />
      <div
        className={`absolute inset-x-0 z-10 mx-auto flex max-w-4xl flex-col overflow-hidden rounded-t-[length:var(--ui-radius-rect)] border border-sam-border bg-sam-surface shadow-2xl ${BOTTOM_OVER_NAV}`}
        style={{ top: layoutTopPx }}
        role="dialog"
        aria-modal="true"
        aria-label="주문 채팅"
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <OrderChatRoomClient
            orderId={orderId}
            backHref={listHref}
            orderChatsHref={listHref}
            showMessengerDeepLink={false}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
