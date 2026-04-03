"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ChatRoom, ChatMessage } from "@/lib/types/chat";
import { allowMockChatMessageFallback } from "@/lib/config/deploy-surface";
import { getMessages } from "@/lib/chats/mock-chat-messages";
import { getMessagesFromDb } from "@/lib/chats/getMessagesFromDb";
import { sendChatMessage } from "@/lib/chat/sendChatMessage";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { uploadPostImages } from "@/lib/posts/uploadPostImages";
import { markRoomAsRead } from "@/lib/chat/markRoomAsRead";
import { getAppSettings } from "@/lib/app-settings";
import { ChatProductSummary } from "./ChatProductSummary";
import { ChatMessageList } from "./ChatMessageList";
import { ChatInputBar } from "./ChatInputBar";
import { ReportActionSheet } from "@/components/reports/ReportActionSheet";
import { BlockActionSheet } from "@/components/reports/BlockActionSheet";
import { TradeFlowBanner } from "@/components/trade/TradeFlowBanner";
import {
  StoreOrderBuyerChatTop,
  type StoreOrderBuyerItemPayload,
  type StoreOrderBuyerOrderPayload,
} from "@/components/chats/StoreOrderBuyerChatTop";
import { StoreOrderSellerHamburger } from "@/components/chats/StoreOrderSellerHamburger";
import { StoreOrderSellerOrderPanel } from "@/components/chats/StoreOrderSellerOrderPanel";
import { storeOrderAwaitingFirstPayment } from "@/lib/stores/store-order-awaiting-payment";
import { TradeReviewForm } from "@/components/trade/TradeReviewForm";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { TradePrimaryAppBarShell } from "@/components/layout/TradePrimaryAppBarShell";
import {
  APP_MAIN_HEADER_ROW_ALIGNED_TO_COLUMN_CLASS,
  APP_TIER1_VIEWPORT_BLEED_FROM_COLUMN_CLASS,
} from "@/lib/ui/app-content-layout";
import {
  SELLER_LISTING_LABEL,
  type SellerListingState,
  normalizeSellerListingState,
} from "@/lib/products/seller-listing-state";
import { postSellerListingChangeSystemNotice } from "@/lib/chat/postSellerListingChangeNotice";
import { canOpenTradeReviewSheet } from "@/lib/trade/can-open-trade-review-sheet";
import { KASAMA_TRADE_CHAT_UNREAD_UPDATED } from "@/lib/chats/chat-channel-events";
import {
  BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS,
  VIEWPORT_HEIGHT_MINUS_BOTTOM_NAV_CLASS,
} from "@/lib/main-menu/bottom-nav-config";
import { ADMIN_CHAT_SUSPENDED_MESSAGE } from "@/lib/chat/chat-room-admin-suspend";
import {
  bustIntegratedChatMessagesCache,
  fetchIntegratedChatRoomMessages,
  fetchLegacyChatRoomMessages,
} from "@/lib/chats/fetch-chat-room-messages-api";
import { mergeChatMessagesById } from "@/lib/chats/merge-chat-messages";
import {
  useChatRoomRealtime,
  type ChatRoomRealtimeConnectionState,
} from "@/lib/chats/use-chat-room-realtime";
import { ChatRealtimeAppBarIcons } from "@/components/chats/ChatRealtimeAppBarIcons";
import { STORE_ORDER_MATCH_ACK_MESSAGE } from "@/lib/chats/store-order-match-ack-text";
import { playCoalescedOrderMatchChatAlert } from "@/lib/notifications/coalesced-chat-alert-sound";
import { IG_DM_BODY_TEXT } from "@/lib/chats/instagram-dm-tokens";
import { TrustSummaryCard } from "@/components/reviews/TrustSummaryCard";
import type { UserTrustSummary } from "@/lib/types/review";
import type { PublicSellerProfileDTO } from "@/lib/users/map-profile-to-public-seller";
import { clampTrustScore } from "@/lib/trust/trust-score-core";

interface ChatDetailViewProps {
  room: ChatRoom;
  currentUserId: string;
  onRoomReload?: () => void;
  /** 구매 내역 등에서 ?review=1 로 진입 시 후기 시트 자동 오픈 */
  openReviewOnMount?: boolean;
  /** `ChatRoomScreen`에서 전달 — 목록 복귀 경로 덮어쓰기 */
  listHref?: string;
  onListNavigate?: () => void;
  embedded?: boolean;
  embeddedFill?: boolean;
  tradeHubColumnLayout?: boolean;
  ownerStoreOrderModalChrome?: boolean;
}

export function ChatDetailView({
  room,
  currentUserId,
  onRoomReload,
  openReviewOnMount = false,
  listHref: listHrefProp,
  onListNavigate: _onListNavigate,
  embedded = false,
  embeddedFill = false,
  tradeHubColumnLayout = false,
  ownerStoreOrderModalChrome: _ownerStoreOrderModalChrome = false,
}: ChatDetailViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const rootHeightClass = embedded
    ? embeddedFill
      ? "min-h-0 flex-1"
      : "min-h-[560px]"
    : tradeHubColumnLayout
      ? "min-h-0 flex min-w-0 flex-1 flex-col"
      : VIEWPORT_HEIGHT_MINUS_BOTTOM_NAV_CLASS;
  void _onListNavigate;
  void _ownerStoreOrderModalChrome;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const partnerId =
    room.buyerId === currentUserId ? room.sellerId : room.buyerId;
  const isGeneralPurposeChat = room.generalChat != null;
  const storeOrderId = (room.generalChat?.storeOrderId ?? "").trim();
  const storeIdForOrderChat = (room.generalChat?.storeId ?? "").trim();
  const isStoreOrderBuyer =
    isGeneralPurposeChat &&
    room.generalChat?.kind === "store_order" &&
    room.buyerId === currentUserId &&
    storeOrderId.length > 0;
  const isStoreOrderChat =
    isGeneralPurposeChat && room.generalChat?.kind === "store_order";
  const chatHubListHref = isStoreOrderChat ? "/my/store-orders" : "/chats";
  const effectiveListHref = listHrefProp?.trim() || chatHubListHref;
  const [partnerBlocked, setPartnerBlocked] = useState(false);
  /** 상단 상대방 — `/api/users/.../public-profile` (매너 배터리·최신 닉네임·프로필 사진) */
  const [partnerPublicProfile, setPartnerPublicProfile] = useState<PublicSellerProfileDTO | null>(null);
  useEffect(() => {
    if (!partnerId?.trim()) {
      setPartnerPublicProfile(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(partnerId)}/public-profile`, {
          cache: "no-store",
          credentials: "include",
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          profile?: PublicSellerProfileDTO;
        };
        if (cancelled) return;
        const prof = data.profile;
        if (
          res.ok &&
          data.ok &&
          prof?.id &&
          prof.id.trim().toLowerCase() === partnerId.trim().toLowerCase()
        ) {
          setPartnerPublicProfile(prof);
        } else {
          setPartnerPublicProfile(null);
        }
      } catch {
        if (!cancelled) setPartnerPublicProfile(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [partnerId]);

  useEffect(() => {
    if (!partnerId?.trim()) {
      setPartnerBlocked(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(
          `/api/me/block-relation?otherUserId=${encodeURIComponent(partnerId)}`,
          { credentials: "include" }
        );
        const j = (await r.json()) as { ok?: boolean; isBlocked?: boolean };
        if (!cancelled && j.ok) setPartnerBlocked(j.isBlocked === true);
      } catch {
        if (!cancelled) setPartnerBlocked(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [partnerId]);
  const reportEnabled = getAppSettings().reportEnabled !== false;
  const [reportSheetOpen, setReportSheetOpen] = useState(false);
  const [blockSheetOpen, setBlockSheetOpen] = useState(false);
  const [reviewSheetOpen, setReviewSheetOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [imageSending, setImageSending] = useState(false);
  /** 판매자: POST 성공 응답으로만 고정 — 폴링/재조회가 inquiry를 실어와도 유지 */
  const [pinnedListing, setPinnedListing] = useState<SellerListingState | null>(null);
  const [pinnedForProductId, setPinnedForProductId] = useState<string | null>(null);
  const [listingSaving, setListingSaving] = useState(false);
  const [listingError, setListingError] = useState<string | null>(null);
  const [listingNotice, setListingNotice] = useState<string | null>(null);
  const [sellerListingControlsEnabled, setSellerListingControlsEnabled] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);
  const didAutoOpenReviewRef = useRef(false);
  const [storeOrderTop, setStoreOrderTop] = useState<StoreOrderBuyerOrderPayload | null>(null);
  const [storeOrderItems, setStoreOrderItems] = useState<StoreOrderBuyerItemPayload[]>([]);
  const [storeOrderLoadErr, setStoreOrderLoadErr] = useState<string | null>(null);
  const [storeOrderLoading, setStoreOrderLoading] = useState(false);
  const [storeOrderCancelBusy, setStoreOrderCancelBusy] = useState(false);
  const [buyerOrderChatSoundOn, setBuyerOrderChatSoundOn] = useState(true);
  const buyerOrderChatSoundOnRef = useRef(true);
  /** 폴링 1회차는 입장 직후 동기화 — 알림·소리 없음(빈 응답이어도 2회차부터만 알림) */
  const pollTickCountRef = useRef(0);

  const postId = (room.product?.id ?? room.productId ?? "").trim();
  const propListing = normalizeSellerListingState(
    room.product?.sellerListingState,
    room.product?.status
  );
  const amISeller = room.sellerId === currentUserId;

  const partnerDisplayNickname = useMemo(
    () => partnerPublicProfile?.nickname?.trim() || room.partnerNickname?.trim() || "상대",
    [partnerPublicProfile?.nickname, room.partnerNickname]
  );
  const partnerDisplayAvatar = useMemo(
    () => partnerPublicProfile?.avatar_url?.trim() || room.partnerAvatar?.trim() || "",
    [partnerPublicProfile?.avatar_url, room.partnerAvatar]
  );
  const partnerTrustSummary: UserTrustSummary | null = useMemo(
    () =>
      partnerPublicProfile
        ? {
            userId: partnerPublicProfile.id,
            reviewCount: 0,
            averageRating: 0,
            mannerScore: clampTrustScore(partnerPublicProfile.trustScore),
            positiveCount: 0,
            negativeCount: 0,
            summaryTags: [],
          }
        : null,
    [partnerPublicProfile]
  );

  const isStoreOrderSeller =
    isStoreOrderChat &&
    amISeller &&
    storeOrderId.length > 0 &&
    storeIdForOrderChat.length > 0;

  const [sellerDrawerOpen, setSellerDrawerOpen] = useState(false);
  const [sellerAdminModalOpen, setSellerAdminModalOpen] = useState(false);

  const setSellerDrawerOpenExclusive = useCallback((v: boolean) => {
    if (v) setSellerAdminModalOpen(false);
    setSellerDrawerOpen(v);
  }, []);

  const setSellerAdminModalOpenExclusive = useCallback((v: boolean) => {
    if (v) setSellerDrawerOpen(false);
    setSellerAdminModalOpen(v);
  }, []);

  const displayListing: SellerListingState =
    amISeller && pinnedListing != null && pinnedForProductId === postId && postId
      ? pinnedListing
      : propListing;

  const isSold = room.product?.status === "sold" || displayListing === "completed";
  const effectiveProductChatId = (room.productChatRoomId || room.id).trim();
  const chatMode = room.chatMode ?? "open";
  const soldToOther =
    room.product?.status === "sold" &&
    room.soldBuyerId &&
    room.buyerId === currentUserId &&
    room.soldBuyerId !== currentUserId;
  const blockedByReservation =
    !isGeneralPurposeChat &&
    Boolean(room.reservedBuyerId?.trim()) &&
    room.buyerId !== room.reservedBuyerId &&
    displayListing === "reserved";
  const adminChatSuspended = room.adminChatSuspended === true;
  const canWriteTradeMessage = isGeneralPurposeChat
    ? chatMode !== "readonly" && chatMode !== "limited"
    : !adminChatSuspended &&
      !soldToOther &&
      !blockedByReservation &&
      chatMode !== "readonly" &&
      chatMode !== "limited";
  const canOpenReviewSheet = !isGeneralPurposeChat && canOpenTradeReviewSheet({
    currentUserId,
    roomSellerId: room.sellerId,
    roomBuyerId: room.buyerId,
    productStatus: room.product?.status,
    sellerListingState: room.product?.sellerListingState,
    ...(amISeller &&
    pinnedListing != null &&
    pinnedForProductId === postId &&
    postId
      ? { sellerListingOverride: pinnedListing }
      : {}),
    tradeFlowStatus: room.tradeFlowStatus,
    soldBuyerId: room.soldBuyerId ?? null,
    buyerReviewSubmitted: room.buyerReviewSubmitted === true,
  });

  useEffect(() => {
    didAutoOpenReviewRef.current = false;
    pollTickCountRef.current = 0;
  }, [room.id]);

  useEffect(() => {
    if (!openReviewOnMount || didAutoOpenReviewRef.current) return;
    if (!canOpenReviewSheet) return;
    didAutoOpenReviewRef.current = true;
    setReviewSheetOpen(true);
    if (pathname) router.replace(pathname, { scroll: false });
  }, [openReviewOnMount, canOpenReviewSheet, pathname, router]);

  const isChatRoom = room.source === "chat_room";

  const [chatRealtimeConnState, setChatRealtimeConnState] =
    useState<ChatRoomRealtimeConnectionState>("disabled");
  const [chatRealtimeLive, setChatRealtimeLive] = useState(false);
  const [chatMessageSoundMuted, setChatMessageSoundMuted] = useState(false);

  const onIntegratedRealtimeMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => mergeChatMessagesById(prev, [msg]));
  }, []);

  const onIntegratedRealtimeRemoved = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const onIntegratedRealtimeConnectionState = useCallback((s: ChatRoomRealtimeConnectionState) => {
    setChatRealtimeConnState(s);
    setChatRealtimeLive(s === "live");
  }, []);

  useChatRoomRealtime({
    roomId: isChatRoom ? room.id : null,
    mode: "integrated",
    enabled: isChatRoom && !!currentUserId?.trim(),
    onMessage: onIntegratedRealtimeMessage,
    onMessageRemoved: onIntegratedRealtimeRemoved,
    onConnectionState: onIntegratedRealtimeConnectionState,
  });

  useEffect(() => {
    setChatRealtimeLive(false);
    setChatRealtimeConnState(isChatRoom ? "connecting" : "disabled");
  }, [room.id, isChatRoom]);

  useEffect(() => {
    setPinnedListing(null);
    setPinnedForProductId(null);
    setListingError(null);
    setListingNotice(null);
    setSellerListingControlsEnabled(true);
  }, [room.id]);

  useEffect(() => {
    if (!amISeller || pinnedListing == null || pinnedForProductId !== postId || !postId) return;
    if (propListing === pinnedListing) {
      setPinnedListing(null);
      setPinnedForProductId(null);
    }
  }, [amISeller, pinnedListing, pinnedForProductId, postId, propListing]);

  const persistListingState = useCallback(
    async (state: SellerListingState) => {
      if (!postId || state === displayListing) return;
      const label = SELLER_LISTING_LABEL[state];
      if (typeof window !== "undefined" && !window.confirm(`물품의 상태를 "${label}"으로 선택하시겠습니까?`)) {
        return;
      }
      setListingSaving(true);
      setListingError(null);
      setListingNotice(null);
      try {
        const body: { sellerListingState: SellerListingState; reservedBuyerId?: string } = {
          sellerListingState: state,
        };
        if (state === "reserved" && amISeller && room.buyerId?.trim()) {
          body.reservedBuyerId = room.buyerId.trim();
        }
        const res = await fetch(`/api/posts/${postId}/seller-listing-state`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          sellerListingState?: string;
          warning?: string;
        };
        if (!res.ok || !data.ok || !data.sellerListingState) {
          const errMsg = String(data.error ?? "저장에 실패했습니다.");
          const schemaBlock =
            /seller_listing_state|마이그레이션|schema cache|Could not find|posts\.seller_listing/i.test(
              errMsg
            );
          if (schemaBlock) {
            setListingError(
              "판매 단계를 DB에 반영하지 못했습니다. Supabase에 posts.seller_listing_state 컬럼이 있는지 확인한 뒤 다시 시도해 주세요."
            );
            return;
          }
          setListingError(errMsg);
          return;
        }
        const w = typeof data.warning === "string" ? data.warning.trim() : "";
        setListingNotice(w || null);
        setPinnedListing(data.sellerListingState as SellerListingState);
        setPinnedForProductId(postId);
        /** 채팅에서만 안내 — 내정보 등 다른 경로 변경 시에는 호출하지 않음 */
        const noticeBody = `제품의 상태가 ${label}으로 변경되었습니다.`;
        const added = await postSellerListingChangeSystemNotice(room, currentUserId, noticeBody);
        if (added) {
          setMessages((prev) => [...prev, added]);
        }
      } catch {
        setListingError("네트워크 오류로 저장하지 못했습니다.");
      } finally {
        setListingSaving(false);
      }
    },
    [postId, currentUserId, displayListing, room, amISeller]
  );

  // ⋮ 메뉴 밖 클릭 시 닫기
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent | TouchEvent) => {
      const el = e.target as Node;
      if (menuRef.current?.contains(el)) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close, { passive: true });
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [menuOpen]);

  const fetchMessages = useCallback(async () => {
    if (isChatRoom) {
      return fetchIntegratedChatRoomMessages(room.id);
    }
    const fromApi = await fetchLegacyChatRoomMessages(room.id);
    if (fromApi.length > 0) return fromApi;
    try {
      return await getMessagesFromDb(room.id, currentUserId);
    } catch {
      return allowMockChatMessageFallback() ? getMessages(room.id) : [];
    }
  }, [room.id, currentUserId, isChatRoom]);

  /** 폴링용: API만 호출 (실패 시 빈 배열 — 기존 메시지 유지). 동시 요청은 single-flight 로 합류 */
  const fetchMessagesForPolling = useCallback(async (): Promise<ChatMessage[]> => {
    if (isChatRoom) {
      return fetchIntegratedChatRoomMessages(room.id);
    }
    return fetchLegacyChatRoomMessages(room.id);
  }, [room.id, isChatRoom]);

  // 초기 로드: API 우선 (테스트 로그인·RLS 시 판매자도 동일하게 메시지 수신)
  useEffect(() => {
    let cancelled = false;
    setMessagesLoading(true);
    (async () => {
      let list: ChatMessage[] = [];
      try {
        const fromApi = await fetchMessages();
        list = Array.isArray(fromApi) ? fromApi : [];
        if (!cancelled) setMessages(list);
      } catch {
        /* ignore */
      }
      if (cancelled) return;
      /** 통합 채팅은 API·Realtime 경로만 사용 — `product_chat_messages` 폴백 호출은 불필요 지연 */
      if (list.length === 0 && !isChatRoom) {
        try {
          const fromDb = await getMessagesFromDb(room.id, currentUserId);
          if (!cancelled && fromDb.length > 0) setMessages(fromDb);
        } catch {
          /* ignore */
        }
      }
      if (!cancelled) {
        setMessages((prev) =>
          prev.length === 0 && allowMockChatMessageFallback() ? getMessages(room.id) : prev
        );
      }
    })().finally(() => {
      if (!cancelled) setMessagesLoading(false);
    });
    return () => { cancelled = true; };
  }, [room.id, currentUserId, fetchMessages, isChatRoom]);

  // 당근형: 상대가 보낸 메시지 실시간 반영 — 판매자/구매자 다른 창에서도 답장 수신
  useEffect(() => {
    if (!room.id || !currentUserId) return;
    const tick = async () => {
      const next = await fetchMessagesForPolling();
      const allowIncomingAlerts = pollTickCountRef.current > 0;
      pollTickCountRef.current += 1;
      setMessages((prev) => {
        if (next.length === 0) return prev;
        const prevIds = new Set(prev.map((m) => m.id));
        const newly = next.filter((m) => !prevIds.has(m.id));
        if (allowIncomingAlerts) {
          for (const m of newly) {
            const isFromPartner = m.senderId !== currentUserId;
            if (
              isStoreOrderChat &&
              amISeller &&
              isFromPartner &&
              (m.message || "").includes(STORE_ORDER_MATCH_ACK_MESSAGE)
            ) {
              void playCoalescedOrderMatchChatAlert(`msg:${m.id}:match-ack`);
              if (typeof window !== "undefined" && "Notification" in window) {
                const showNote = () => {
                  try {
                    new Notification("SAMarket", {
                      body: "주문자가 주문 내용 일치를 확인했습니다.",
                      tag: `store-order-match-${room.id}:${m.id}`,
                    });
                  } catch {
                    /* ignore */
                  }
                };
                const p = Notification.permission;
                if (p === "granted") showNote();
                else if (p === "default")
                  void Notification.requestPermission().then((r) => {
                    if (r === "granted") showNote();
                  });
              }
            }
            if (
              isStoreOrderChat &&
              room.buyerId === currentUserId &&
              isFromPartner &&
              buyerOrderChatSoundOnRef.current
            ) {
              void playCoalescedOrderMatchChatAlert(`msg:${m.id}:order-chat`);
            }
          }
        }
        return mergeChatMessagesById(prev, next);
      });
    };
    tick(); // 마운트 직후 1회 실행 (초기 로드 직후 반영)
    /** 통합 채팅: Realtime 구독 성공 시 폴링은 백업용으로만 길게. 미연결 시 기존 간격 유지 */
    const pollMs = isStoreOrderChat
      ? chatRealtimeLive
        ? 90_000
        : 22_000
      : isChatRoom && chatRealtimeLive
        ? 120_000
        : 10_000;
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") void tick();
    }, pollMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    const onPageShow = (e: Event) => {
      const pe = e as PageTransitionEvent;
      if (pe.persisted) void tick();
    };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
    if (typeof window !== "undefined") window.addEventListener("pageshow", onPageShow);
    return () => {
      clearInterval(interval);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
      if (typeof window !== "undefined") window.removeEventListener("pageshow", onPageShow);
    };
  }, [
    room.id,
    currentUserId,
    fetchMessagesForPolling,
    isStoreOrderChat,
    isChatRoom,
    chatRealtimeLive,
    amISeller,
    room.buyerId,
  ]);

  // 읽음 처리: API 호출(테스트 로그인 포함) 후 상단 편지 숫자 갱신 이벤트
  useEffect(() => {
    if (isChatRoom) {
      fetch(`/api/chat/rooms/${room.id}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
        .then((r) => r.ok && r.json())
        .then((data) => {
          if (data?.ok && typeof window !== "undefined") window.dispatchEvent(new CustomEvent(KASAMA_TRADE_CHAT_UNREAD_UPDATED));
        });
      return;
    }
    markRoomAsRead(room.id).then(async (res) => {
      /** 클라이언트 읽음 성공만으로는 통합 chat_rooms 미읽음이 남을 수 있어, 서비스 롤 API로 동기화 */
      const data = await fetch(`/api/chat/room/${room.id}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
        .then((r) => r.ok && r.json())
        .catch(() => null);
      if (data?.ok && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(KASAMA_TRADE_CHAT_UNREAD_UPDATED));
      } else if (res.ok && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(KASAMA_TRADE_CHAT_UNREAD_UPDATED));
      }
    });
  }, [room.id, currentUserId, isChatRoom]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuOpen]);

  const postChatText = useCallback(
    async (message: string): Promise<{ ok: true } | { ok: false; error?: string }> => {
      if (!canWriteTradeMessage) return { ok: false, error: "이 채팅에서는 메시지를 보낼 수 없습니다." };
      if (isChatRoom) {
        try {
          const res = await fetch(`/api/chat/rooms/${room.id}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body: message }),
            credentials: "include",
          });
          const data = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            message?: { id?: string; createdAt?: string };
            error?: string;
          };
          if (data?.ok && data?.message?.id) {
            bustIntegratedChatMessagesCache(room.id);
            setMessages((prev) => [
              ...prev,
              {
                id: data.message!.id!,
                roomId: room.id,
                senderId: currentUserId,
                message,
                createdAt: data.message!.createdAt ?? new Date().toISOString(),
                isRead: false,
              },
            ]);
            return { ok: true };
          }
          const apiErr = typeof data?.error === "string" ? data.error.trim() : "";
          if (apiErr) return { ok: false, error: apiErr };
          if (res.status === 401) return { ok: false, error: "로그인이 필요합니다." };
          if (res.status === 403) {
            return { ok: false, error: "접근이 제한되었거나 권한이 없습니다. 서버 안내를 확인해 주세요." };
          }
          if (res.status >= 500) return { ok: false, error: "서버 오류로 전송하지 못했습니다. 잠시 후 다시 시도해 주세요." };
        } catch {
          return { ok: false, error: "네트워크 오류로 전송하지 못했습니다." };
        }
        return { ok: false, error: "전송에 실패했습니다. 다시 시도해 주세요." };
      }

      try {
        const res = await sendChatMessage(room.id, { type: "text", text: message });
        if (res.ok) {
          setMessages((prev) => [
            ...prev,
            {
              id: res.messageId,
              roomId: room.id,
              senderId: currentUserId,
              message,
              createdAt: new Date().toISOString(),
              isRead: false,
            },
          ]);
          return { ok: true };
        }
        return { ok: false, error: res.error };
      } catch {
        return { ok: false, error: "네트워크 오류로 전송하지 못했습니다." };
      }
    },
    [room.id, currentUserId, isChatRoom, canWriteTradeMessage]
  );

  const postChatTextForSellerPanel = useCallback(
    async (text: string): Promise<{ ok: true } | { ok: false; error?: string }> => {
      const r = await postChatText(text);
      return r.ok ? { ok: true } : { ok: false, error: r.error ?? "전송에 실패했습니다." };
    },
    [postChatText]
  );

  const sendBuyerOrderMatchAck = useCallback(async () => {
    const r = await postChatText(STORE_ORDER_MATCH_ACK_MESSAGE);
    if (!r.ok) setSendError(r.error ?? "확인 메시지 전송에 실패했습니다. 다시 시도해 주세요.");
    return r.ok;
  }, [postChatText]);

  const handleSend = useCallback(
    async (message: string) => {
      setSendError(null);
      if (!canWriteTradeMessage) {
        setSendError("이 채팅에서는 메시지를 보낼 수 없습니다.");
        return;
      }
      const r = await postChatText(message);
      if (!r.ok) {
        setSendError(r.error ?? "전송에 실패했습니다. 다시 시도해 주세요.");
      }
    },
    [canWriteTradeMessage, postChatText]
  );

  const handleSendImageFile = useCallback(
    async (file: File) => {
      setSendError(null);
      if (!canWriteTradeMessage) {
        setSendError("이 채팅에서는 메시지를 보낼 수 없습니다.");
        return;
      }
      const maxBytes = 10 * 1024 * 1024;
      if (file.size > maxBytes) {
        setSendError("10MB 이하 이미지만 보낼 수 있어요.");
        return;
      }
      if (!file.type.startsWith("image/")) {
        setSendError("이미지 파일만 보낼 수 있어요.");
        return;
      }
      const user = getCurrentUser();
      if (!user?.id) {
        setSendError("로그인이 필요합니다.");
        return;
      }
      setImageSending(true);
      try {
        const urls = await uploadPostImages([file], user.id);
        const imageUrl = urls[0];
        if (!imageUrl) {
          setSendError("이미지 업로드에 실패했습니다. 다시 시도해 주세요.");
          return;
        }
        if (isChatRoom) {
          const res = await fetch(`/api/chat/rooms/${room.id}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body: "", messageType: "image", imageUrl }),
            credentials: "include",
          });
          const data = await res.json().catch(() => ({}));
          if (data?.ok && data?.message?.id) {
            setMessages((prev) => [
              ...prev,
              {
                id: data.message.id,
                roomId: room.id,
                senderId: currentUserId,
                message: "",
                messageType: "image" as const,
                imageUrl,
                createdAt: data.message.createdAt ?? new Date().toISOString(),
                isRead: false,
              },
            ]);
          } else {
            setSendError(
              typeof data?.error === "string" ? data.error : "전송에 실패했습니다. 다시 시도해 주세요."
            );
          }
          return;
        }
        const sendRes = await sendChatMessage(room.id, {
          type: "image",
          text: "",
          imageUrl,
        });
        if (sendRes.ok) {
          setMessages((prev) => [
            ...prev,
            {
              id: sendRes.messageId,
              roomId: room.id,
              senderId: currentUserId,
              message: "",
              messageType: "image" as const,
              imageUrl,
              createdAt: new Date().toISOString(),
              isRead: false,
            },
          ]);
        } else {
          setSendError(sendRes.error || "전송에 실패했습니다. 다시 시도해 주세요.");
        }
      } catch {
        setSendError("전송에 실패했습니다. 다시 시도해 주세요.");
      } finally {
        setImageSending(false);
      }
    },
    [room.id, currentUserId, isChatRoom, canWriteTradeMessage]
  );

  const loadStoreOrderDetail = useCallback(async () => {
    if (!storeOrderId) return;
    setStoreOrderLoading(true);
    setStoreOrderLoadErr(null);
    try {
      const res = await fetch(`/api/me/store-orders/${encodeURIComponent(storeOrderId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        order?: Record<string, unknown>;
        items?: StoreOrderBuyerItemPayload[];
      };
      if (!res.ok || !json?.ok) {
        setStoreOrderTop(null);
        setStoreOrderItems([]);
        setStoreOrderLoadErr(
          res.status === 404
            ? "주문을 찾을 수 없습니다."
            : typeof json?.error === "string"
              ? json.error
              : "불러오기 실패"
        );
        return;
      }
      const o = json.order ?? {};
      setStoreOrderTop({
        order_no: typeof o.order_no === "string" ? o.order_no : undefined,
        order_status: String(o.order_status ?? ""),
        payment_status: String(o.payment_status ?? ""),
        store_name: String(o.store_name ?? ""),
        delivery_address_summary: (o.delivery_address_summary as string | null) ?? null,
        delivery_address_detail: (o.delivery_address_detail as string | null) ?? null,
        buyer_phone: (o.buyer_phone as string | null) ?? null,
        buyer_note: (o.buyer_note as string | null) ?? null,
        payment_amount: Number(o.payment_amount ?? 0),
        delivery_fee_amount:
          o.delivery_fee_amount != null && o.delivery_fee_amount !== ""
            ? Number(o.delivery_fee_amount)
            : null,
      });
      setStoreOrderItems(Array.isArray(json.items) ? json.items : []);
    } catch {
      setStoreOrderLoadErr("네트워크 오류");
      setStoreOrderTop(null);
      setStoreOrderItems([]);
    } finally {
      setStoreOrderLoading(false);
    }
  }, [storeOrderId]);

  useEffect(() => {
    if (!isStoreOrderBuyer) {
      setStoreOrderTop(null);
      setStoreOrderItems([]);
      setStoreOrderLoadErr(null);
    }
  }, [room.id, isStoreOrderBuyer]);

  useEffect(() => {
    if (!isStoreOrderBuyer) return;
    try {
      const v = localStorage.getItem(`kasama.storeOrderChat.bellOn.${room.id}`);
      const on = v !== "0";
      setBuyerOrderChatSoundOn(on);
      buyerOrderChatSoundOnRef.current = on;
    } catch {
      setBuyerOrderChatSoundOn(true);
      buyerOrderChatSoundOnRef.current = true;
    }
  }, [room.id, isStoreOrderBuyer]);

  useEffect(() => {
    buyerOrderChatSoundOnRef.current = buyerOrderChatSoundOn;
  }, [buyerOrderChatSoundOn]);

  useEffect(() => {
    if (!isStoreOrderBuyer || !storeOrderId) return;
    void loadStoreOrderDetail();
  }, [isStoreOrderBuyer, storeOrderId, loadStoreOrderDetail]);

  const handleCancelStoreOrder = useCallback(async () => {
    if (!storeOrderId || !storeOrderTop) return;
    if (typeof window !== "undefined" && !window.confirm("주문을 취소할까요?")) return;
    setStoreOrderCancelBusy(true);
    try {
      const res = await fetch(`/api/me/store-orders/${encodeURIComponent(storeOrderId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancel: true }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json?.ok) {
        const code = typeof json?.error === "string" ? json.error : "";
        if (typeof window !== "undefined") {
          window.alert(
            code === "cannot_cancel_after_accepted"
              ? "매장이 접수한 뒤에는 여기서 취소할 수 없습니다."
              : "취소에 실패했습니다."
          );
        }
        return;
      }
      await loadStoreOrderDetail();
      onRoomReload?.();
      router.refresh();
    } catch {
      if (typeof window !== "undefined") window.alert("네트워크 오류");
    } finally {
      setStoreOrderCancelBusy(false);
    }
  }, [storeOrderId, storeOrderTop, loadStoreOrderDetail, onRoomReload, router]);

  const runSellerCompleteFromMenu = useCallback(async () => {
    const uid = currentUserId?.trim();
    if (!uid) return;
    try {
      const res = await fetch(
        `/api/trade/product-chat/${encodeURIComponent(effectiveProductChatId)}/seller-complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (res.ok && data.ok) onRoomReload?.();
    } catch {
      /* ignore */
    }
  }, [effectiveProductChatId, currentUserId, onRoomReload]);

  const handleLeave = useCallback(async () => {
    if (!isChatRoom) return;
    try {
      const res = await fetch(`/api/chat/rooms/${room.id}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(KASAMA_TRADE_CHAT_UNREAD_UPDATED));
        router.push(effectiveListHref);
      }
    } catch {
      /* ignore */
    }
  }, [room.id, currentUserId, isChatRoom, router, effectiveListHref]);

  const moreMenuPanel = menuOpen ? (
    <div className="absolute right-0 top-full z-[80] mt-1 min-w-[180px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
      {!isStoreOrderBuyer && amISeller && postId && room.product && (room.product.status ?? "").toLowerCase() !== "sold" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        void persistListingState("inquiry");
                      }}
                      className="block w-full px-4 py-2.5 text-left text-[14px] text-gray-700 hover:bg-gray-50"
                    >
                      판매중으로 변경
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        void persistListingState("negotiating");
                      }}
                      className="block w-full px-4 py-2.5 text-left text-[14px] text-gray-700 hover:bg-gray-50"
                    >
                      문의중으로 변경
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        void persistListingState("reserved");
                      }}
                      className="block w-full px-4 py-2.5 text-left text-[14px] text-gray-700 hover:bg-gray-50"
                    >
                      예약중으로 변경
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        void runSellerCompleteFromMenu();
                      }}
                      className="block w-full px-4 py-2.5 text-left text-[14px] text-gray-700 hover:bg-gray-50"
                    >
                      거래완료 (되돌리기 불가)
                    </button>
                  </>
                ) : null}
                {postId && !isStoreOrderBuyer ? (
                  <Link
                    href={`/post/${postId}`}
                    onClick={() => setMenuOpen(false)}
                    className="block w-full px-4 py-2.5 text-left text-[14px] text-gray-700 hover:bg-gray-50"
                  >
                    게시글 보기
                  </Link>
                ) : null}
                {reportEnabled && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setReportSheetOpen(true);
                    }}
                    className="block w-full px-4 py-2.5 text-left text-[14px] text-gray-700 hover:bg-gray-50"
                  >
                    신고
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setBlockSheetOpen(true);
                  }}
                  className="block w-full px-4 py-2.5 text-left text-[14px] text-gray-700 hover:bg-gray-50"
                >
                  차단
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    if (isChatRoom) handleLeave();
                    else router.push(effectiveListHref);
                  }}
                  className="block w-full px-4 py-2.5 text-left text-[14px] text-gray-700 hover:bg-gray-50"
                >
                  나가기
                </button>
                {isChatRoom && (
                  <button
                    type="button"
                    onClick={async () => {
                      setMenuOpen(false);
                      try {
                        const res = await fetch(`/api/chat/rooms/${room.id}/hide`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({}),
                        });
                        if (res.ok) {
                          router.push(effectiveListHref);
                          router.refresh();
                        }
                      } catch {
                        /* ignore */
                      }
                    }}
                    className="block w-full px-4 py-2.5 text-left text-[14px] text-gray-700 hover:bg-gray-50"
                  >
                    숨기기
                  </button>
                )}
                {canOpenReviewSheet && (
                  <button
                    type="button"
                    onClick={() => {
                      setReviewSheetOpen(true);
                      setMenuOpen(false);
                    }}
                    className="block w-full px-4 py-2.5 text-left text-[14px] text-gray-700 hover:bg-gray-50"
                  >
                    평가·후기 보내기
                  </button>
                )}
    </div>
  ) : null;

  const sellerComposerQuickBar =
    isStoreOrderSeller ? (
      <div className="flex flex-wrap gap-2 border-b border-[#EFEFEF] bg-white px-3 pb-2 pt-1">
        <button
          type="button"
          onClick={() => setSellerDrawerOpenExclusive(true)}
          className="rounded-full border border-[#DBDBDB] bg-white px-3.5 py-1.5 text-[13px] font-medium leading-tight tracking-[-0.01em] text-[#262626] hover:bg-black/[0.04] active:bg-black/[0.06]"
        >
          주문 패널
        </button>
        <button
          type="button"
          onClick={() => setSellerAdminModalOpenExclusive(true)}
          className="rounded-full border border-[#0095F6]/35 bg-[#0095F6]/8 px-3.5 py-1.5 text-[13px] font-semibold leading-tight tracking-[-0.01em] text-[#0095F6] hover:bg-[#0095F6]/14 active:bg-[#0095F6]/20"
        >
          관리자 메뉴
        </button>
      </div>
    ) : null;

  const chatComposerInner = (
    <>
      {sellerComposerQuickBar}
      {sendError && (
        <p className="bg-red-50 px-4 py-1.5 text-[12px] text-red-600 text-center">{sendError}</p>
      )}
      <ChatInputBar
        draftStorageKey={room.id}
        onSend={handleSend}
        onLeave={
          isStoreOrderBuyer
            ? undefined
            : isChatRoom
              ? handleLeave
              : () => router.push(effectiveListHref)
        }
        placeholder={isStoreOrderBuyer ? "메세지를 입력해주세요" : undefined}
        showEmojiButton={!isStoreOrderBuyer}
        variant={isStoreOrderChat ? "instagram" : "default"}
        onImageFilesSelected={async (files) => {
          for (const f of files) await handleSendImageFile(f);
        }}
        imageSending={imageSending}
      />
    </>
  );

  return (
    <div
      className={`flex flex-col ${isStoreOrderChat ? "bg-white" : "bg-[#e8e4df]"} ${rootHeightClass}`}
    >
      {isStoreOrderBuyer ? (
        <header className="shrink-0 border-b border-[#DBDBDB] bg-white">
          <StoreOrderBuyerChatTop
            backHref={effectiveListHref}
            title={
              storeOrderTop?.store_name
                ? `${storeOrderTop.store_name} 배달주문`
                : "매장 배달주문"
            }
            orderId={storeOrderId}
            order={storeOrderTop}
            items={storeOrderItems}
            orderLoading={storeOrderLoading}
            orderError={storeOrderLoadErr}
            canCancel={
              !!storeOrderTop &&
              storeOrderAwaitingFirstPayment({
                payment_status: storeOrderTop.payment_status,
                order_status: storeOrderTop.order_status,
              })
            }
            cancelBusy={storeOrderCancelBusy}
            onCancel={() => void handleCancelStoreOrder()}
            menuRef={menuRef}
            moreMenuPanel={moreMenuPanel}
            onMoreMenuClick={() => setMenuOpen((v) => !v)}
            chatRoomId={room.id}
            onSendOrderMatchAck={sendBuyerOrderMatchAck}
            buyerChatSoundOn={buyerOrderChatSoundOn}
            onBuyerChatSoundOnChange={(on) => {
              setBuyerOrderChatSoundOn(on);
              buyerOrderChatSoundOnRef.current = on;
              try {
                localStorage.setItem(`kasama.storeOrderChat.bellOn.${room.id}`, on ? "1" : "0");
              } catch {
                /* ignore */
              }
            }}
          />
        </header>
      ) : (
        <>
          <div
            className={`sticky top-0 z-30 shrink-0 ${APP_TIER1_VIEWPORT_BLEED_FROM_COLUMN_CLASS}`}
          >
            <TradePrimaryAppBarShell>
              <div
                className={`flex h-14 items-center gap-2 ${APP_MAIN_HEADER_ROW_ALIGNED_TO_COLUMN_CLASS}`}
              >
                <AppBackButton
                  preferHistoryBack={!isStoreOrderChat}
                  backHref={isStoreOrderChat ? effectiveListHref : undefined}
                  ariaLabel="이전 화면"
                />
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-white/90 ring-1 ring-black/5">
                    {partnerDisplayAvatar ? (
                      <img src={partnerDisplayAvatar} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[14px] font-medium text-gray-600">
                        {partnerDisplayNickname.charAt(0) || "?"}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-gray-900">{partnerDisplayNickname}</p>
                    <p className="truncate text-[12px] text-gray-700">
                      {room.product ? (amISeller ? "상대방 · 구매자" : "상대방 · 이 글의 판매자") : "채팅"}
                    </p>
                  </div>
                  {partnerTrustSummary ? (
                    <div className="shrink-0 pr-0.5" aria-label="상대방 거래 매너">
                      <TrustSummaryCard summary={partnerTrustSummary} variant="compact" />
                    </div>
                  ) : null}
                </div>
                {isChatRoom ? (
                  <ChatRealtimeAppBarIcons
                    state={chatRealtimeConnState}
                    messagesLoading={messagesLoading}
                    messageSoundMuted={chatMessageSoundMuted}
                    onToggleMessageSound={() => setChatMessageSoundMuted((v) => !v)}
                  />
                ) : null}
                {isStoreOrderSeller ? (
                  <StoreOrderSellerHamburger
                    chatRoomId={room.id}
                    drawerOpen={sellerDrawerOpen}
                    onDrawerOpenChange={setSellerDrawerOpenExclusive}
                  />
                ) : (
                  <div className="relative shrink-0" ref={menuRef}>
                    <button
                      type="button"
                      onClick={() => setMenuOpen((v) => !v)}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-800 hover:bg-black/10"
                      aria-label="더보기"
                    >
                      <MoreIcon className="h-5 w-5" />
                    </button>
                    {moreMenuPanel}
                  </div>
                )}
              </div>
            </TradePrimaryAppBarShell>
          </div>
          {!isStoreOrderChat ? (
            <div className="shrink-0 border-b border-gray-200 bg-white shadow-sm">
              {!isGeneralPurposeChat && (
                <TradeFlowBanner
                  room={room}
                  currentUserId={currentUserId}
                  effectiveProductChatId={effectiveProductChatId}
                  onActionDone={() => onRoomReload?.()}
                  onOpenReview={() => setReviewSheetOpen(true)}
                  canOpenReviewSheet={canOpenReviewSheet}
                  displayListing={displayListing}
                  onPersistListing={persistListingState}
                  listingSaving={listingSaving}
                  listingError={listingError}
                  listingNotice={listingNotice}
                  sellerListingControlsEnabled={sellerListingControlsEnabled}
                />
              )}
              {!isGeneralPurposeChat && adminChatSuspended ? (
                <div className="border-b border-amber-200 bg-amber-50 px-3 py-2.5 text-center text-[13px] font-medium text-amber-950">
                  {ADMIN_CHAT_SUSPENDED_MESSAGE}
                </div>
              ) : null}
              {room.product && (
                <div className="border-t border-gray-100 bg-white px-3 py-2">
                  <ChatProductSummary product={room.product} hideFavorite={amISeller} sellerUserId={room.sellerId} />
                </div>
              )}
            </div>
          ) : null}
        </>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {messagesLoading ? (
          <div
            className={`flex flex-1 items-center justify-center ${isStoreOrderChat ? `bg-white ${IG_DM_BODY_TEXT} text-[#A8A8A8]` : "bg-[#F7F7F7] text-[14px] text-gray-600"}`}
          >
            메시지 불러오는 중...
          </div>
        ) : (
          <div
            className={`flex-1 overflow-y-auto overflow-x-hidden ${isStoreOrderChat ? "bg-white px-3 py-2" : "bg-[#F7F7F7] px-2 py-1"}`}
          >
            <ChatMessageList
              messages={messages}
              currentUserId={currentUserId}
              partnerNickname={partnerDisplayNickname}
              partnerAvatar={partnerDisplayAvatar || undefined}
              variant={isStoreOrderChat ? "instagram" : "default"}
            />
          </div>
        )}
      </div>

      {partnerBlocked ? (
        isStoreOrderSeller ? (
          <div
            className={`sticky bottom-0 z-10 mx-auto w-full max-w-lg shrink-0 border-t bg-white safe-area-pb ${isStoreOrderChat ? "border-[#DBDBDB]" : "border-gray-200"}`}
            style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0px))" }}
          >
            {sellerComposerQuickBar}
            <div className="px-4 py-3 text-center">
              <p className="text-[13px] text-gray-500">
                차단된 사용자와는 메시지를 보낼 수 없습니다
              </p>
            </div>
          </div>
        ) : (
          <div className="shrink-0 border-t border-gray-200 bg-white safe-area-pb">
            <div className="px-4 py-3 text-center">
              <p className="text-[13px] text-gray-500">
                차단된 사용자와는 메시지를 보낼 수 없습니다
              </p>
            </div>
          </div>
        )
      ) : !canWriteTradeMessage ? (
        isStoreOrderSeller ? (
          <div
            className={`sticky bottom-0 z-10 mx-auto w-full max-w-lg shrink-0 border-t bg-white safe-area-pb ${isStoreOrderChat ? "border-[#DBDBDB]" : "border-gray-200"}`}
            style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0px))" }}
          >
            {sellerComposerQuickBar}
            <div className="px-4 py-3 text-center">
              <p className="text-[13px] text-gray-500">
                {adminChatSuspended
                  ? ADMIN_CHAT_SUSPENDED_MESSAGE
                  : soldToOther
                    ? "이 상품은 다른 구매자와 거래가 완료되었습니다."
                    : blockedByReservation
                      ? "판매자가 다른 분과 예약 중입니다. 이 채팅에서는 새 메시지를 보낼 수 없어요."
                      : chatMode === "limited" || chatMode === "readonly"
                        ? "이 채팅에서는 메시지를 보낼 수 없습니다."
                        : "메시지를 보낼 수 없습니다."}
              </p>
            </div>
          </div>
        ) : (
          <div className="shrink-0 border-t border-gray-200 bg-white safe-area-pb">
            <div className="px-4 py-3 text-center">
              <p className="text-[13px] text-gray-500">
                {adminChatSuspended
                  ? ADMIN_CHAT_SUSPENDED_MESSAGE
                  : soldToOther
                    ? "이 상품은 다른 구매자와 거래가 완료되었습니다."
                    : blockedByReservation
                      ? "판매자가 다른 분과 예약 중입니다. 이 채팅에서는 새 메시지를 보낼 수 없어요."
                      : chatMode === "limited" || chatMode === "readonly"
                        ? "이 채팅에서는 메시지를 보낼 수 없습니다."
                        : "메시지를 보낼 수 없습니다."}
              </p>
            </div>
          </div>
        )
      ) : (
        <div
          className={`sticky bottom-0 z-10 mx-auto w-full max-w-lg shrink-0 border-t bg-white pt-3 safe-area-pb ${isStoreOrderChat ? "border-[#DBDBDB]" : "border-gray-200"}`}
          style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0px))" }}
        >
          {chatComposerInner}
        </div>
      )}

      {isStoreOrderSeller ? (
        <StoreOrderSellerOrderPanel
          presentation={sellerAdminModalOpen ? "modal" : "drawer"}
          open={sellerDrawerOpen || sellerAdminModalOpen}
          onOpenChange={(v) => {
            if (!v) {
              setSellerDrawerOpen(false);
              setSellerAdminModalOpen(false);
            }
          }}
          chatRoomId={room.id}
          storeId={storeIdForOrderChat}
          orderId={storeOrderId}
          menuRef={menuRef}
          moreMenuPanel={moreMenuPanel}
          onMoreMenuClick={() => setMenuOpen((v) => !v)}
          postChatText={postChatTextForSellerPanel}
          sendSummaryDisabled={!canWriteTradeMessage}
        />
      ) : null}

      {reportSheetOpen && (
        <div
          className={`fixed inset-x-0 top-0 z-50 flex items-end justify-center bg-black/50 ${BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS}`}
        >
          <div className="w-full max-w-lg rounded-t-2xl bg-white">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h2 className="text-[16px] font-semibold text-gray-900">신고</h2>
              <button type="button" onClick={() => setReportSheetOpen(false)} className="text-[14px] text-gray-500">
                닫기
              </button>
            </div>
            <ReportActionSheet
              targetType="chat"
              targetId={room.id}
              targetUserId={partnerId}
              targetLabel={partnerDisplayNickname}
              roomId={room.id}
              productId={room.productId}
              onClose={() => setReportSheetOpen(false)}
              onSuccess={() => setReportSheetOpen(false)}
            />
          </div>
        </div>
      )}

      {blockSheetOpen && (
        <div
          className={`fixed inset-x-0 top-0 z-50 flex items-end justify-center bg-black/50 ${BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS}`}
        >
          <div className="w-full max-w-lg rounded-t-2xl bg-white">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h2 className="text-[16px] font-semibold text-gray-900">차단</h2>
              <button type="button" onClick={() => setBlockSheetOpen(false)} className="text-[14px] text-gray-500">
                닫기
              </button>
            </div>
            <BlockActionSheet
              targetUserId={partnerId}
              targetLabel={partnerDisplayNickname}
              roomId={room.id}
              roomSource={room.source}
              currentUserId={currentUserId}
              onClose={() => setBlockSheetOpen(false)}
              onSuccess={() => {
                setBlockSheetOpen(false);
                router.refresh();
              }}
            />
          </div>
        </div>
      )}

      {reviewSheetOpen && (
        <div
          className={`fixed inset-x-0 top-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4 ${BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS}`}
        >
          <div className="flex max-h-full min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-lg sm:max-h-[min(90vh,calc(100dvh-4rem-env(safe-area-inset-bottom,0px)))] sm:rounded-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
              <h2 className="text-[16px] font-semibold text-gray-900">후기 작성</h2>
              <button type="button" onClick={() => setReviewSheetOpen(false)} className="text-[14px] text-gray-500">
                닫기
              </button>
            </div>
            <TradeReviewForm
              effectiveProductChatId={effectiveProductChatId}
              productId={room.productId}
              revieweeId={partnerId}
              revieweeLabel={partnerDisplayNickname}
              roleType="buyer_to_seller"
              onSuccess={() => {
                setReviewSheetOpen(false);
                onRoomReload?.();
                router.refresh();
              }}
              onCancel={() => setReviewSheetOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function MoreIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
    </svg>
  );
}
