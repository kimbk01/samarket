"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { BodyPortal } from "@/components/layout/BodyPortal";
import { CommunityMessengerRoomClient } from "@/components/community-messenger/CommunityMessengerRoomClient";
import { OwnerOrderChatSlideHostProvider } from "@/components/business/owner/OwnerOrderChatSlideHostContext";
import { StoreDeliveryBufferingSpinner } from "@/components/stores/StoreDeliveryBufferingSpinner";
import type { OwnerStoreOrderListRow } from "@/lib/business/owner-store-order-list-row-bridge";
import { buildOwnerStoreOrderMessengerContext } from "@/lib/business/owner-store-order-messenger-link";
import {
  OWNER_ORDER_CHAT_SLIDE_BACKDROP_Z_CLASS,
  OWNER_ORDER_CHAT_SLIDE_EASING,
  OWNER_ORDER_CHAT_SLIDE_MS,
  OWNER_ORDER_CHAT_SLIDE_PANEL_Z_CLASS,
  OWNER_ORDER_CHAT_SLIDE_WIDTH_CLASS,
} from "@/lib/store-order-chat/owner-order-chat-slide-layout";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { resolveInstantStoreOrderMessengerEntrySnapshot } from "@/lib/store-order-chat/store-order-messenger-entry-shell-snapshot";
import { prepareStoreOrderMessengerRoomEntryByOrder } from "@/lib/store-order-chat/store-order-messenger-room-entry-client";
import { peekMessengerRoomViewerUserIdClient } from "@/lib/community-messenger/room/peek-messenger-room-viewer-user-id-client";

type SlidePhase = "enter-from-right" | "open" | "exit-to-right";

function resolveOwnerInstantShellSnapshot(
  order: OwnerStoreOrderListRow | null,
  roomId: string,
  storeId: string,
  storeName: string,
  viewerUserId?: string
): CommunityMessengerRoomSnapshot {
  const contextMeta =
    order ?
      buildOwnerStoreOrderMessengerContext(order, storeName, storeId)
    : null;
  return resolveInstantStoreOrderMessengerEntrySnapshot({
    roomId,
    viewerUserId,
    contextMeta,
    myRole: "owner",
  });
}

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
  const orderAtOpenRef = useRef(order);
  if (order && !orderAtOpenRef.current) {
    orderAtOpenRef.current = order;
  }

  const viewerUserId = peekMessengerRoomViewerUserIdClient() ?? undefined;

  const [roomId, setRoomId] = useState<string | null>(() => {
    const seedOrder = orderAtOpenRef.current ?? order;
    return seedOrder?.community_messenger_room_id?.trim() || null;
  });
  const [initialServerSnapshot, setInitialServerSnapshot] =
    useState<CommunityMessengerRoomSnapshot | null>(() => {
      const seedOrder = orderAtOpenRef.current ?? order;
      const rid = seedOrder?.community_messenger_room_id?.trim();
      if (!rid) return null;
      return resolveOwnerInstantShellSnapshot(seedOrder, rid, storeId, storeName, viewerUserId);
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
    const sid = storeId.trim();
    const oid = orderId.trim();
    if (!sid || !oid) {
      setRoomErr("주문 정보가 없습니다.");
      return;
    }

    let cancelled = false;
    setRoomErr(null);

    const seedOrder = orderAtOpenRef.current;
    const instantContextMeta =
      seedOrder ? buildOwnerStoreOrderMessengerContext(seedOrder, storeName, sid) : null;

    void (async () => {
      try {
        const result = await prepareStoreOrderMessengerRoomEntryByOrder({
          orderId: oid,
          storeId: sid,
          role: "owner",
          instantContextMeta,
          myRole: "owner",
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
              "채팅 내용을 불러오지 못했습니다."
            : "채팅방을 열 수 없습니다."
          );
          return;
        }
        setRoomId(result.roomId);
        setInitialServerSnapshot(result.snapshot);
      } catch {
        if (!cancelled) setRoomErr("네트워크 오류로 채팅을 열 수 없습니다.");
      }
    })();

    return () => {
      cancelled = true;
    };
    /** DO NOT: order row room-id 필드를 effect deps에 넣음 — 목록 row 보강 시 채팅 state·RoomClient 가 리셋되어 빈 타임라인이 재발한다. */
  }, [orderId, storeId, storeName]);

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
          className={`delivery-ui flex h-[100dvh] max-h-[100dvh] min-h-0 flex-col border-l border-[color:var(--delivery-border)] bg-[color:var(--delivery-bg-card)] shadow-2xl ${OWNER_ORDER_CHAT_SLIDE_WIDTH_CLASS} ${OWNER_ORDER_CHAT_SLIDE_PANEL_Z_CLASS} pt-[env(safe-area-inset-top,0px)]`}
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
                aria-label={t("store_owner_aria_exit_orders")}
              >
                <ChevronLeft className="h-5 w-5" aria-hidden />
              </button>
              <p className="min-w-0 flex-1 truncate text-[15px] font-bold leading-[1.35] text-[color:var(--delivery-dark)]">
                {t("store_owner_order_progress_chat_title")}
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
                  주문 관리로 돌아가기
                </button>
              </div>
            : awaitingRoomId ?
              <div className="flex min-h-[40vh] items-center justify-center">
                <StoreDeliveryBufferingSpinner />
              </div>
            : chatReady && roomId && initialServerSnapshot ?
              <OwnerOrderChatSlideHostProvider closeSlide={requestClose}>
                <div className="flex h-full min-h-0 flex-col [&_.community-messenger-room-shell]:min-h-0">
                  <CommunityMessengerRoomClient
                    key={roomId}
                    roomId={roomId}
                    initialServerSnapshot={initialServerSnapshot}
                    initialViewerUserId={initialServerSnapshot.viewerUserId}
                  />
                </div>
              </OwnerOrderChatSlideHostProvider>
            : null}
          </div>
        </aside>
      </div>
    </BodyPortal>
  );
}
