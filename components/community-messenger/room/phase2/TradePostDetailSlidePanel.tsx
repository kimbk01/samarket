"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { BodyPortal } from "@/components/layout/BodyPortal";
import { PostDetailView } from "@/components/post/PostDetailView";
import type { PostWithMeta } from "@/lib/posts/schema";
import type { ChatRoomSource } from "@/lib/types/chat";
import {
  OWNER_ORDER_CHAT_SLIDE_BACKDROP_Z_CLASS,
  OWNER_ORDER_CHAT_SLIDE_EASING,
  OWNER_ORDER_CHAT_SLIDE_MS,
  OWNER_ORDER_CHAT_SLIDE_PANEL_Z_CLASS,
  OWNER_ORDER_CHAT_SLIDE_WIDTH_CLASS,
} from "@/lib/store-order-chat/owner-order-chat-slide-layout";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { useOverlayHardwareBack } from "@/lib/ui/overlay-back-stack";
import { TradePostUnavailable } from "@/components/trade/TradePostUnavailable";

type SlidePhase = "enter-from-right" | "open" | "exit-to-right";

type Props = {
  postId: string;
  viewerUserId?: string | null;
  messengerRoomId?: string | null;
  productChatRoomId?: string | null;
  onClose: () => void;
};

export function TradePostDetailSlidePanel({
  postId,
  viewerUserId,
  messengerRoomId,
  productChatRoomId,
  onClose,
}: Props) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<SlidePhase>("enter-from-right");
  const [post, setPost] = useState<PostWithMeta | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** 숨김·삭제·없는 글(404) — 「볼 수 없는 글이에요」(상세 화면과 같은 안내, Owner 2026-10-28 승인 시안 ③) */
  const [unavailable, setUnavailable] = useState(false);

  const requestClose = useCallback(() => {
    if (phase === "exit-to-right") return;
    setPhase("exit-to-right");
    window.setTimeout(() => onClose(), OWNER_ORDER_CHAT_SLIDE_MS);
  }, [onClose, phase]);

  /** Android 뒤로 키 = 슬라이드만 닫기(주문 채팅 슬라이드와 같음) — 2026-10-28 실기: 뒤로 키가 닫지 않거나 아래 화면을 이동시킴 */
  useOverlayHardwareBack(true, requestClose);

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
    const id = postId.trim();
    if (!id) {
      setLoadError(t("common_content_unavailable"));
      setPost(null);
      return;
    }
    let cancelled = false;
    setLoadError(null);
    setUnavailable(false);
    setPost(null);
    void (async () => {
      try {
        const res = await fetch(`/api/posts/${encodeURIComponent(id)}/detail`, { cache: "no-store" });
        if (!res.ok) {
          if (cancelled) return;
          if (res.status === 404 || res.status === 403) setUnavailable(true);
          else setLoadError(t("common_content_unavailable"));
          return;
        }
        const row = (await res.json()) as PostWithMeta;
        if (!cancelled) setPost(row?.id ? row : null);
        if (!cancelled && !row?.id) setLoadError(t("common_content_unavailable"));
      } catch {
        if (!cancelled) setLoadError(t("common_network_error_retry"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [postId, t]);

  const panelOpen = phase === "open";
  const backdropVisible = phase === "open";
  const viewerId = viewerUserId?.trim() || "";
  const roomBootstrap =
    viewerId && (messengerRoomId?.trim() || productChatRoomId?.trim())
      ? {
          viewerUserId: viewerId,
          roomId: productChatRoomId?.trim() || null,
          source: (productChatRoomId?.trim() ? "product_chat" : null) as ChatRoomSource | null,
          messengerRoomId: messengerRoomId?.trim() || null,
        }
      : undefined;

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
          aria-label={t("tier1_back")}
          onClick={requestClose}
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label={t("cm_ui_trade_view_details")}
          className={`relative z-[1] flex h-[100dvh] max-h-[100dvh] min-h-0 flex-col border-l border-sam-border bg-sam-app shadow-2xl ${OWNER_ORDER_CHAT_SLIDE_WIDTH_CLASS} ${OWNER_ORDER_CHAT_SLIDE_PANEL_Z_CLASS} pt-[var(--safe-top)]`}
          style={{
            transform: panelOpen ? "translate3d(0, 0, 0)" : "translate3d(100%, 0, 0)",
            transition: `transform ${OWNER_ORDER_CHAT_SLIDE_MS}ms ${OWNER_ORDER_CHAT_SLIDE_EASING}`,
            willChange: "transform",
          }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
            {unavailable ? (
              <TradePostUnavailable onBack={requestClose} />
            ) : loadError ? (
              <div className="flex flex-col items-start gap-3 px-4 py-8">
                <p className="sam-text-body text-sam-muted">{loadError}</p>
                <button
                  type="button"
                  onClick={requestClose}
                  className="min-h-10 rounded-ui-rect border border-sam-border bg-sam-surface px-4 sam-text-body font-medium text-sam-fg"
                >
                  {t("tier1_back")}
                </button>
              </div>
            ) : post ? (
              <PostDetailView
                post={post}
                related={{ sellerItems: [], similarItems: [], ads: [] }}
                viewerTradeRoomBootstrap={roomBootstrap}
                serverViewerUserId={viewerId || undefined}
              />
            ) : (
              <div className="px-4 py-8 sam-text-body text-sam-muted">{t("common_loading")}</div>
            )}
          </div>
        </aside>
      </div>
    </BodyPortal>
  );
}
