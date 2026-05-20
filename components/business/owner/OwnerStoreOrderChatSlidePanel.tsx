"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { BodyPortal } from "@/components/layout/BodyPortal";
import { OwnerOrderChatSlideHostProvider } from "@/components/business/owner/OwnerOrderChatSlideHostContext";
import { OwnerStoreOrderModalSellerToolbar } from "@/components/business/owner/OwnerStoreOrderModalSellerToolbar";
import type { OwnerStoreOrderListRow } from "@/lib/business/owner-store-order-list-row-bridge";
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
  const { t } = useI18n();
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
          `/api/me/stores/${encodeURIComponent(storeId)}/orders/${encodeURIComponent(orderId)}`,
          { credentials: "include", cache: "no-store" }
        );
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          order?: { community_messenger_room_id?: string | null };
        };
        if (cancelled) return;
        if (!res.ok || !j?.ok) {
          setRoomErr(
            typeof j?.error === "string" ? j.error : t("store_owner_chat_room_open_failed")
          );
          setRoomId(null);
          return;
        }
        const rid = String(j.order?.community_messenger_room_id ?? "").trim();
        if (!rid) {
          setRoomErr(t("store_owner_chat_room_missing"));
          setRoomId(null);
          return;
        }
        setRoomId(rid);
      } catch {
        if (!cancelled) setRoomErr(t("store_owner_chat_network_failed"));
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
          aria-label={t("store_owner_aria_back_orders")}
          onClick={requestClose}
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label={t("store_owner_aria_order_chat")}
          className={`flex h-[100dvh] max-h-[100dvh] min-h-0 flex-col border-l border-[#E5E7EB] bg-white shadow-2xl ${OWNER_ORDER_CHAT_SLIDE_WIDTH_CLASS} ${OWNER_ORDER_CHAT_SLIDE_PANEL_Z_CLASS} pt-[env(safe-area-inset-top,0px)]`}
          style={{
            transform: panelOpen ? "translate3d(0, 0, 0)" : "translate3d(100%, 0, 0)",
            transition: `transform ${OWNER_ORDER_CHAT_SLIDE_MS}ms ${OWNER_ORDER_CHAT_SLIDE_EASING}`,
            willChange: "transform",
          }}
        >
          <header className="flex shrink-0 items-center gap-2 border-b border-[#E5E7EB] bg-white px-2 py-2">
            <button
              type="button"
              onClick={requestClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-[#F5F5F5]"
              aria-label={t("store_owner_aria_exit_orders")}
            >
              <ChevronLeft className="h-5 w-5 text-[#262626]" aria-hidden />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold text-[#262626]">{t("store_owner_chats_title")}</p>
              <p className="truncate text-[12px] text-[#8C8C8C]">
                {t("store_owner_order_chat_line", {
                  orderNo: order?.order_no ?? t("store_owner_order_fallback"),
                  storeName,
                })}
              </p>
            </div>
          </header>

          <OwnerStoreOrderModalSellerToolbar
            storeId={storeId}
            orderId={orderId}
            onRoomReload={() => {
              /* room client realtime handles messages */
            }}
          />

          <div className="relative min-h-0 flex-1 overflow-hidden bg-[#F3F4F6]">
            {roomLoading ?
              <p className="px-4 py-8 text-center text-[14px] text-[#8C8C8C]">{t("store_owner_chat_connecting")}</p>
            : roomErr ?
              <div className="px-4 py-8 text-center">
                <p className="text-[14px] text-[#FF4D4F]">{roomErr}</p>
                <button
                  type="button"
                  onClick={requestClose}
                  className="mt-3 text-[14px] font-semibold text-[#2D7FF9]"
                >
                  {t("store_owner_back_to_orders")}
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
