"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { BodyPortal } from "@/components/layout/BodyPortal";
import { CommunityMessengerRoomClient } from "@/components/community-messenger/CommunityMessengerRoomClient";
import { BuyerOrderChatSlideHostProvider } from "@/components/mypage/BuyerOrderChatSlideHostContext";
import { StoreDeliveryBufferingSpinner } from "@/components/stores/StoreDeliveryBufferingSpinner";
import {
  buildMessengerContextInputFromStoreOrderSnapshot,
  buildMessengerContextMetaFromStoreOrder,
} from "@/lib/community-messenger/store-order-messenger-context";
import {
  OWNER_ORDER_CHAT_SLIDE_BACKDROP_Z_CLASS,
  OWNER_ORDER_CHAT_SLIDE_EASING,
  OWNER_ORDER_CHAT_SLIDE_MS,
  OWNER_ORDER_CHAT_SLIDE_PANEL_Z_CLASS,
  OWNER_ORDER_CHAT_SLIDE_WIDTH_CLASS,
} from "@/lib/store-order-chat/owner-order-chat-slide-layout";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { resolveInstantStoreOrderMessengerEntrySnapshot } from "@/lib/store-order-chat/store-order-messenger-entry-shell-snapshot";
import { prepareStoreOrderMessengerRoomEntryByOrder } from "@/lib/store-order-chat/store-order-messenger-room-entry-client";
import { peekMessengerRoomViewerUserIdClient } from "@/lib/community-messenger/room/peek-messenger-room-viewer-user-id-client";

type SlidePhase = "enter-from-right" | "open" | "exit-to-right";

export type BuyerStoreOrderChatSlideOrder = {
  id: string;
  order_no: string;
  store_id: string;
  store_name: string;
  fulfillment_type: string;
  order_status: string;
  payment_amount: number;
  store_profile_image_url?: string | null;
  community_messenger_room_id?: string | null;
  items?: { product_title_snapshot: string }[];
};

function resolveBuyerInstantShellSnapshot(
  order: BuyerStoreOrderChatSlideOrder | null,
  roomId: string,
  viewerUserId?: string
): CommunityMessengerRoomSnapshot {
  const contextMeta =
    order ?
      buildMessengerContextMetaFromStoreOrder(
        buildMessengerContextInputFromStoreOrderSnapshot({
          orderId: order.id,
          storeName: order.store_name,
          orderNo: order.order_no,
          storeId: order.store_id,
          fulfillmentType: order.fulfillment_type,
          orderStatus: order.order_status,
          paymentAmount: order.payment_amount,
          firstLineProductTitle: order.items?.[0]?.product_title_snapshot ?? null,
          thumbnailUrl: order.store_profile_image_url ?? null,
        })
      )
    : null;
  return resolveInstantStoreOrderMessengerEntrySnapshot({
    roomId,
    viewerUserId,
    contextMeta,
    myRole: "member",
  });
}

/** 구매자 `/orders` — 주문 카드에서 우→좌 슬라이드 주문 채팅 */
export function BuyerStoreOrderChatSlidePanel({
  orderId,
  order,
  onClose,
}: {
  orderId: string;
  order: BuyerStoreOrderChatSlideOrder | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<SlidePhase>("enter-from-right");
  const orderAtOpenRef = useRef(order);
  useLayoutEffect(() => {
    if (order) orderAtOpenRef.current = order;
  }, [order]);

  const viewerUserId = peekMessengerRoomViewerUserIdClient() ?? undefined;

  const [roomId, setRoomId] = useState<string | null>(() => {
    return order?.community_messenger_room_id?.trim() || null;
  });
  const [initialServerSnapshot, setInitialServerSnapshot] =
    useState<CommunityMessengerRoomSnapshot | null>(() => {
      const rid = order?.community_messenger_room_id?.trim();
      if (!rid || !order) return null;
      return resolveBuyerInstantShellSnapshot(order, rid, viewerUserId);
    });
  const [roomErr, setRoomErr] = useState<string | null>(null);

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
    const oid = orderId.trim();
    if (!oid) {
      setRoomErr(t("store_owner_chat_order_context_missing"));
      return;
    }

    let cancelled = false;
    setRoomErr(null);

    const seedOrder = orderAtOpenRef.current;
    const instantContextMeta =
      seedOrder ?
        buildMessengerContextMetaFromStoreOrder(
          buildMessengerContextInputFromStoreOrderSnapshot({
            orderId: seedOrder.id,
            storeName: seedOrder.store_name,
            orderNo: seedOrder.order_no,
            storeId: seedOrder.store_id,
            fulfillmentType: seedOrder.fulfillment_type,
            orderStatus: seedOrder.order_status,
            paymentAmount: seedOrder.payment_amount,
            firstLineProductTitle: seedOrder.items?.[0]?.product_title_snapshot ?? null,
            thumbnailUrl: seedOrder.store_profile_image_url ?? null,
          })
        )
      : null;

    void (async () => {
      try {
        const result = await prepareStoreOrderMessengerRoomEntryByOrder({
          orderId: oid,
          role: "buyer",
          instantContextMeta,
          myRole: "member",
          viewerUserId,
          onShellReady: (nextRoomId, shell) => {
            if (cancelled) return;
            setRoomId((prev) => prev ?? nextRoomId);
            setInitialServerSnapshot((prev) => {
              if (prev && !prev.clientShellPlaceholder && (prev.messages?.length ?? 0) > 0) {
                return prev;
              }
              return shell;
            });
          },
        });
        if (cancelled) return;
        if (!result.ok) {
          setRoomErr(
            result.error === "ensure_failed" || result.error === "bootstrap_failed" ?
              t("store_owner_chat_load_failed")
            : t("store_owner_chat_room_open_failed")
          );
          return;
        }
        setRoomId(result.roomId);
        setInitialServerSnapshot(result.snapshot);
      } catch {
        if (!cancelled) setRoomErr(t("store_owner_chat_network_failed"));
      }
    })();

    return () => {
      cancelled = true;
    };
    /** DO NOT: order row room-id 필드를 effect deps에 넣음 — 목록 row 보강 시 채팅 state·RoomClient 가 리셋되어 빈 타임라인이 재발한다. */
  }, [orderId, t, viewerUserId]);

  const panelOpen = phase === "open";
  const backdropVisible = phase === "open";
  const chatReady = Boolean(roomId && initialServerSnapshot && !roomErr);
  const awaitingRoomId = !roomErr && !chatReady;

  return (
    <BodyPortal>
      <div
        className={`fixed inset-0 ${OWNER_ORDER_CHAT_SLIDE_BACKDROP_Z_CLASS} flex justify-end`}
        role="presentation"
      >
        <button
          type="button"
          className={OverlayUi.backdrop}
          style={{
            opacity: backdropVisible ? 1 : 0,
            transitionDuration: `${OWNER_ORDER_CHAT_SLIDE_MS}ms`,
            transitionTimingFunction: OWNER_ORDER_CHAT_SLIDE_EASING,
          }}
          aria-label={t("common_close")}
          onClick={requestClose}
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label={t("store_messenger_order_chat_label")}
          className={`relative z-[1] delivery-ui flex h-[100dvh] max-h-[100dvh] min-h-0 flex-col border-l border-[color:var(--delivery-border)] bg-[color:var(--delivery-bg-card)] shadow-2xl ${OWNER_ORDER_CHAT_SLIDE_WIDTH_CLASS} ${OWNER_ORDER_CHAT_SLIDE_PANEL_Z_CLASS} pt-[var(--safe-top)]`}
          style={{
            transform: panelOpen ? "translate3d(0, 0, 0)" : "translate3d(100%, 0, 0)",
            transition: `transform ${OWNER_ORDER_CHAT_SLIDE_MS}ms ${OWNER_ORDER_CHAT_SLIDE_EASING}`,
            willChange: "transform",
          }}
        >
          {awaitingRoomId ?
            <header className="flex shrink-0 items-center gap-2 border-b border-[color:var(--delivery-border)] bg-[color:var(--delivery-bg-card)] px-2 py-2">
              <button
                type="button"
                onClick={requestClose}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--delivery-dark)] hover:bg-[color:var(--delivery-primary-soft)]"
                aria-label={t("common_close")}
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
              <p className="min-w-0 flex-1 truncate text-[15px] font-bold leading-[1.35] text-[color:var(--delivery-dark)]">
                {t("store_messenger_order_chat_label")}
              </p>
            </header>
          : null}

          <div className="relative min-h-0 flex-1 overflow-hidden bg-[color:var(--delivery-latte)]">
            {roomErr ?
              <div className="px-4 py-8 text-center">
                <p className="text-[14px] text-[color:var(--delivery-danger)]">{roomErr}</p>
                <button
                  type="button"
                  onClick={requestClose}
                  className="mt-3 text-[14px] font-semibold text-[color:var(--delivery-primary)]"
                >
                  {t("common_close")}
                </button>
              </div>
            : awaitingRoomId ?
              <div className="flex min-h-[40vh] items-center justify-center">
                <StoreDeliveryBufferingSpinner />
              </div>
            : chatReady && roomId && initialServerSnapshot ?
              <BuyerOrderChatSlideHostProvider closeSlide={requestClose}>
                <div className="flex h-full min-h-0 flex-col [&_.community-messenger-room-shell]:min-h-0">
                  <CommunityMessengerRoomClient
                    key={roomId}
                    roomId={roomId}
                    initialServerSnapshot={initialServerSnapshot}
                    initialViewerUserId={initialServerSnapshot.viewerUserId}
                  />
                </div>
              </BuyerOrderChatSlideHostProvider>
            : null}
          </div>
        </aside>
      </div>
    </BodyPortal>
  );
}
