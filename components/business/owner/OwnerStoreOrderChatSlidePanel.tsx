"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { BodyPortal } from "@/components/layout/BodyPortal";
import { OwnerOrderChatSlideHostProvider } from "@/components/business/owner/OwnerOrderChatSlideHostContext";
import { OwnerStoreOrderModalSellerToolbar } from "@/components/business/owner/OwnerStoreOrderModalSellerToolbar";
import type { OwnerStoreOrderListRow } from "@/lib/business/owner-store-order-list-row-bridge";
import { ownerOrderStatusLabelKo } from "@/lib/stores/owner-mobile-ui-tokens";
import { formatMoneyPhp } from "@/lib/utils/format";
import {
  OWNER_ORDER_CHAT_SLIDE_BACKDROP_Z_CLASS,
  OWNER_ORDER_CHAT_SLIDE_EASING,
  OWNER_ORDER_CHAT_SLIDE_MS,
  OWNER_ORDER_CHAT_SLIDE_PANEL_Z_CLASS,
  OWNER_ORDER_CHAT_SLIDE_WIDTH_CLASS,
} from "@/lib/store-order-chat/owner-order-chat-slide-layout";

const CommunityMessengerRoomClient = dynamic(
  () =>
    import("@/components/community-messenger/CommunityMessengerRoomClient").then(
      (m) => m.CommunityMessengerRoomClient
    ),
  { ssr: false, loading: () => null }
);

type SlidePhase = "enter-from-right" | "open" | "exit-to-right";

export function OwnerStoreOrderChatSlidePanel({
  orderId,
  order,
  storeId,
  storeName,
  onClose,
}: {
  orderId: string;
  order: OwnerStoreOrderListRow | null;
  storeId: string;
  storeName: string;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<SlidePhase>("enter-from-right");
  const [roomId, setRoomId] = useState<string | null>(() => {
    const rid = order?.community_messenger_room_id?.trim();
    return rid || null;
  });
  const [roomErr, setRoomErr] = useState<string | null>(null);
  const [roomLoading, setRoomLoading] = useState(!order?.community_messenger_room_id?.trim());

  const requestClose = useCallback(() => {
    if (phase === "exit-to-right") return;
    setPhase("exit-to-right");
    window.setTimeout(() => onClose(), OWNER_ORDER_CHAT_SLIDE_MS);
  }, [onClose, phase]);

  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => setPhase("open"));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      requestClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [requestClose]);

  useEffect(() => {
    const existing = order?.community_messenger_room_id?.trim();
    if (existing) {
      setRoomId(existing);
      setRoomLoading(false);
      setRoomErr(null);
      return;
    }
    let cancelled = false;
    setRoomLoading(true);
    setRoomErr(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/me/stores/${encodeURIComponent(storeId)}/orders/${encodeURIComponent(orderId)}/ensure-chat`,
          { method: "POST", credentials: "include", cache: "no-store" }
        );
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          order?: { community_messenger_room_id?: string | null };
        };
        if (cancelled) return;
        if (!res.ok || !j?.ok) {
          setRoomErr(typeof j?.error === "string" ? j.error : "채팅방을 열 수 없습니다.");
          setRoomId(null);
          return;
        }
        const rid = String(j.order?.community_messenger_room_id ?? "").trim();
        if (!rid) {
          setRoomErr("연결된 채팅방이 없습니다.");
          setRoomId(null);
          return;
        }
        setRoomId(rid);
      } catch {
        if (!cancelled) setRoomErr("네트워크 오류로 채팅을 열 수 없습니다.");
      } finally {
        if (!cancelled) setRoomLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [order?.community_messenger_room_id, orderId, storeId]);

  const panelOpen = phase === "open";
  const backdropVisible = phase === "open";

  return (
    <BodyPortal>
      <div
        className={`fixed inset-0 ${OWNER_ORDER_CHAT_SLIDE_BACKDROP_Z_CLASS} flex justify-end`}
        role="presentation"
      >
        <button
          type="button"
          className="min-w-0 flex-1 bg-black/30 transition-opacity"
          style={{
            opacity: backdropVisible ? 1 : 0,
            transitionDuration: `${OWNER_ORDER_CHAT_SLIDE_MS}ms`,
            transitionTimingFunction: OWNER_ORDER_CHAT_SLIDE_EASING,
          }}
          aria-label="주문 관리로 돌아가기"
          onClick={requestClose}
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="주문 채팅"
          className={`flex h-[100dvh] max-h-[100dvh] min-h-0 flex-col border-l border-[#DDE5E0] bg-white shadow-2xl ${OWNER_ORDER_CHAT_SLIDE_WIDTH_CLASS} ${OWNER_ORDER_CHAT_SLIDE_PANEL_Z_CLASS} pt-[env(safe-area-inset-top,0px)]`}
          style={{
            transform: panelOpen ? "translate3d(0, 0, 0)" : "translate3d(100%, 0, 0)",
            transition: `transform ${OWNER_ORDER_CHAT_SLIDE_MS}ms ${OWNER_ORDER_CHAT_SLIDE_EASING}`,
            willChange: "transform",
          }}
        >
          <header className="flex shrink-0 items-center gap-2 border-b border-[#DDE5E0] bg-white px-2 py-2">
            <button
              type="button"
              onClick={requestClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#123B4A] hover:bg-[#EAF6FB]"
              aria-label="주문 관리로 나가기"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold leading-[1.35] text-[#123B4A]">주문 진행 채팅</p>
              <p className="truncate text-[12px] leading-[1.35] text-[#6B7280]">
                {order?.order_no ?? "주문"} · {storeName}
              </p>
            </div>
          </header>

          <div className="shrink-0 border-b border-[#DDE5E0] bg-[#1C8DB8] px-3 py-3 text-white">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[12px] font-semibold leading-[1.35] text-white/80">
                  {order?.order_no ?? orderId}
                </p>
                <p className="mt-1 truncate text-[15px] font-bold leading-[1.35]">
                  {order ? ownerOrderStatusLabelKo(order.order_status) : "주문 상태 확인중"}
                </p>
                <p className="mt-1 line-clamp-1 text-[12px] leading-[1.35] text-white/80">
                  {order?.delivery_address_summary || "주소 정보 확인중"}
                </p>
              </div>
              {order ? (
                <div className="shrink-0 text-right">
                  <p className="text-[12px] font-semibold leading-[1.35] text-white/80">
                    {order.fulfillment_type === "pickup" ? "픽업주문" : "배달주문"}
                  </p>
                  <p className="mt-1 text-[15px] font-bold leading-[1.35]">{formatMoneyPhp(order.payment_amount)}</p>
                </div>
              ) : null}
            </div>
            <div className="mt-2 flex gap-1.5 overflow-x-auto">
              {["조금 늦어집니다", "문앞 배달 예정", "재료 확인중", "전화 부탁드립니다"].map((label) => (
                <span key={label} className="shrink-0 rounded-[4px] bg-white/12 px-2 py-1 text-[11px] font-bold leading-[1.35] text-white ring-1 ring-white/20">
                  {label}
                </span>
              ))}
            </div>
          </div>

          <OwnerStoreOrderModalSellerToolbar
            storeId={storeId}
            orderId={orderId}
            onRoomReload={() => {
              /* room client realtime handles messages */
            }}
          />

          <div className="relative min-h-0 flex-1 overflow-hidden bg-[#f6f6f6]">
            {roomLoading ?
              <p className="px-4 py-8 text-center text-[14px] text-[#8C8C8C]">채팅방 연결 중…</p>
            : roomErr ?
              <div className="px-4 py-8 text-center">
                <p className="text-[14px] text-[#FF4D4F]">{roomErr}</p>
                <button
                  type="button"
                  onClick={requestClose}
                  className="mt-3 text-[14px] font-semibold text-[#2D7FF9]"
                >
                  주문 관리로 돌아가기
                </button>
              </div>
            : roomId ?
              <OwnerOrderChatSlideHostProvider closeSlide={requestClose}>
                <div className="flex h-full min-h-0 flex-col [&_.community-messenger-room-shell]:min-h-0">
                  <CommunityMessengerRoomClient roomId={roomId} />
                </div>
              </OwnerOrderChatSlideHostProvider>
            : null}
          </div>
        </aside>
      </div>
    </BodyPortal>
  );
}
