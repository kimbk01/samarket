"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ChatDetailView } from "@/components/chats/ChatDetailView";
import { getCurrentUserIdForDb, getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { ChatMessage, ChatRoom, ChatRoomSource } from "@/lib/types/chat";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { VIEWPORT_HEIGHT_MINUS_BOTTOM_NAV_CLASS } from "@/lib/main-menu/bottom-nav-config";
import {
  fetchChatRoomDetailApi,
  peekChatRoomDetailMemory,
  updateChatRoomDetailMemory,
} from "@/lib/chats/fetch-chat-room-detail-api";
import {
  peekIntegratedChatRoomMessagesCache,
  peekLegacyChatRoomMessagesCache,
  updateIntegratedChatRoomMessagesCache,
  updateLegacyChatRoomMessagesCache,
} from "@/lib/chats/fetch-chat-room-messages-api";
import { fetchChatRoomBootstrapApi } from "@/lib/chats/fetch-chat-room-bootstrap-api";
import { warmChatRoomEntryById } from "@/lib/chats/prewarm-chat-room-route";
import {
  patchTradeChatEntryMark,
  readTradeChatEntryMark,
} from "@/lib/chats/trade-chat-entry-client";
import { logClientPerf, perfNow } from "@/lib/performance/samarket-perf";
import { TradeChatLoadingShell } from "@/components/chats/TradeChatLoadingShell";

export function ChatRoomScreen({
  roomId,
  openReviewOnMount = false,
  listHref,
  initialViewerUserId,
  onListNavigate,
  embedded = false,
  embeddedFill = false,
  tradeHubColumnLayout = false,
  ownerStoreOrderModalChrome = false,
  /** 부트스트랩 시 `?source=` — 상세·메시지 병렬 로드(힌트 일치 시) */
  chatRoomSourceHint = null,
  /** RSC에서 이미 로드한 방·메시지 — 첫 페인트 전 클라이언트 fetch 대기 제거 */
  serverBootstrap = null,
}: {
  roomId: string | null;
  openReviewOnMount?: boolean;
  /** 오류·빈 화면에서 «목록으로» 링크 */
  listHref: string;
  /** 서버에서 이미 확인한 로그인 사용자 ID — 첫 진입 지연 감소용 */
  initialViewerUserId?: string | null;
  /** 라우팅 없이 거래채팅 목록(시트 등)으로 복귀 */
  onListNavigate?: () => void;
  embedded?: boolean;
  /** embedded일 때 세로 풀 높이(모임방 전체 화면) */
  embeddedFill?: boolean;
  /** `/mypage/trade/chat/[room]` — 거래 허브 탭 아래 컬럼 높이 + 스티키 보정 */
  tradeHubColumnLayout?: boolean;
  /** 매장 주문 관리 모달 — 상단 탭(채팅·주문)만 표시 */
  ownerStoreOrderModalChrome?: boolean;
  chatRoomSourceHint?: ChatRoomSource | null;
  serverBootstrap?: { room: ChatRoom; messages: ChatMessage[] } | null;
}) {
  const { t } = useI18n();
  /**
   * `undefined`: 세션 확인 전
   * 프로필 캐시·테스트 세션이 있으면 첫 페인트부터 문자열로 두어 방 상세 fetch·UI 가 한 틱 빨리 진행
   */
  const [resolvedUserId, setResolvedUserId] = useState<string | null | undefined>(() => {
    if (typeof initialViewerUserId === "string" && initialViewerUserId.trim()) {
      return initialViewerUserId.trim();
    }
    if (initialViewerUserId === null) {
      return null;
    }
    const sync = getSyncViewerUserIdForClient();
    return sync ?? undefined;
  });

  const [room, setRoom] = useState<ChatRoom | null>(() => {
    if (serverBootstrap?.room) return serverBootstrap.room;
    return roomId ? peekChatRoomDetailMemory(roomId) : null;
  });
  const [loading, setLoading] = useState(() => {
    if (serverBootstrap?.room) return false;
    return Boolean(roomId && !peekChatRoomDetailMemory(roomId));
  });
  const [err, setErr] = useState<string | null>(null);
  /** 부트스트랩 응답 메시지 — `ChatDetailView` 가 동일 GET 을 다시 하지 않도록 직접 전달 */
  const [bootstrapMessages, setBootstrapMessages] = useState<ChatMessage[] | null>(() =>
    serverBootstrap?.room ? serverBootstrap.messages : null
  );
  const chatEntryShellLoggedRef = useRef(false);
  const chatEntryRoomReadyLoggedRef = useRef<string | null>(null);

  const reload = useCallback(async (options?: { bypassPeek?: boolean }) => {
    const startedAt = perfNow();
    if (!roomId) {
      setErr("bad_room");
      setRoom(null);
      setLoading(false);
      logClientPerf("chat-room-screen.reload", {
        roomId: roomId ?? null,
        result: "bad_room",
        elapsedMs: Math.round(perfNow() - startedAt),
      });
      return;
    }
    /** 확정 로그아웃만 차단 — `undefined` 일 때도 상세 GET 은 세션 쿠키로 진행(인증·fetch 병렬) */
    if (resolvedUserId === null) {
      setLoading(false);
      setRoom(null);
      setErr(null);
      logClientPerf("chat-room-screen.reload", {
        roomId,
        result: "no_current_user",
        elapsedMs: Math.round(perfNow() - startedAt),
      });
      return;
    }
    const hadPeek = Boolean(peekChatRoomDetailMemory(roomId));
    if (!hadPeek && !options?.bypassPeek) setLoading(true);
    setErr(null);
    try {
      const result = await fetchChatRoomBootstrapApi(roomId, chatRoomSourceHint, {
        bypassPeek: options?.bypassPeek === true,
      });
      if (!result.ok) {
        setBootstrapMessages(null);
        if (result.code === "not_found") {
          setErr("not_found");
          setRoom(null);
          setLoading(false);
          logClientPerf("chat-room-screen.reload", {
            roomId,
            result: "not_found",
            elapsedMs: Math.round(perfNow() - startedAt),
          });
          return;
        }
        if (result.code === "auth") {
          setErr("auth");
          setRoom(null);
          setLoading(false);
          logClientPerf("chat-room-screen.reload", {
            roomId,
            result: "auth",
            elapsedMs: Math.round(perfNow() - startedAt),
          });
          return;
        }
        if (result.code === "load_failed") {
          setErr("load_failed");
          setRoom(null);
          setLoading(false);
          logClientPerf("chat-room-screen.reload", {
            roomId,
            result: "load_failed",
            elapsedMs: Math.round(perfNow() - startedAt),
          });
          return;
        }
        setErr("network");
        setRoom(null);
        setLoading(false);
        logClientPerf("chat-room-screen.reload", {
          roomId,
          result: "network",
          elapsedMs: Math.round(perfNow() - startedAt),
        });
        return;
      }
      setRoom(result.room);
      setBootstrapMessages(result.messages);
      setLoading(false);
      logClientPerf("chat-room-screen.reload", {
        roomId,
        result: "ok",
        detailCache: result.cache,
        elapsedMs: Math.round(perfNow() - startedAt),
      });
      return;
    } catch {
      setBootstrapMessages(null);
      /* bootstrap fallback below */
    }
    try {
      const result = await fetchChatRoomDetailApi(roomId);
      if (!result.ok) {
        if (result.code === "not_found") {
          setErr("not_found");
          setRoom(null);
          logClientPerf("chat-room-screen.reload", {
            roomId,
            result: "not_found",
            elapsedMs: Math.round(perfNow() - startedAt),
          });
          return;
        }
        if (result.code === "auth") {
          setErr("auth");
          setRoom(null);
          logClientPerf("chat-room-screen.reload", {
            roomId,
            result: "auth",
            elapsedMs: Math.round(perfNow() - startedAt),
          });
          return;
        }
        if (result.code === "load_failed") {
          setErr("load_failed");
          setRoom(null);
          logClientPerf("chat-room-screen.reload", {
            roomId,
            result: "load_failed",
            elapsedMs: Math.round(perfNow() - startedAt),
          });
          return;
        }
        setErr("network");
        setRoom(null);
        logClientPerf("chat-room-screen.reload", {
          roomId,
          result: "network",
          elapsedMs: Math.round(perfNow() - startedAt),
        });
        return;
      }
      setRoom(result.room);
      setBootstrapMessages(null);
      logClientPerf("chat-room-screen.reload", {
        roomId,
        result: "ok",
        detailCache: result.cache,
        elapsedMs: Math.round(perfNow() - startedAt),
      });
    } finally {
      setLoading(false);
    }
  }, [roomId, resolvedUserId, chatRoomSourceHint]);

  const hardRefreshBootstrap = useCallback(async () => {
    if (!roomId?.trim() || resolvedUserId === null) return;
    await reload({ bypassPeek: true });
  }, [roomId, resolvedUserId, reload]);

  /** 서버(RSC)에서 받은 데이터를 클라이언트 peek 캐시에 넣어 목록·재진입과 일치 */
  useLayoutEffect(() => {
    const id = roomId?.trim();
    if (!id || !serverBootstrap?.room) return;
    const r = serverBootstrap.room;
    updateChatRoomDetailMemory(id, r);
    if (r.source === "chat_room") {
      updateIntegratedChatRoomMessagesCache(r.id, serverBootstrap.messages);
    } else {
      updateLegacyChatRoomMessagesCache(r.id, serverBootstrap.messages);
    }
  }, [roomId, serverBootstrap]);

  /** useEffect 보다 먼저 세션 확인을 시작 — 페인트 직전에 Promise 가 돎 */
  useLayoutEffect(() => {
    let cancelled = false;
    const resolveViewer = async () => {
      const id = (await getCurrentUserIdForDb())?.trim() || null;
      if (!cancelled) setResolvedUserId(id);
    };
    void resolveViewer();
    const onTestAuthChange = () => {
      void resolveViewer();
    };
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, onTestAuthChange);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void resolveViewer();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const sb = getSupabaseClient();
    const authSub = sb?.auth.onAuthStateChange(() => {
      void resolveViewer();
    });
    return () => {
      cancelled = true;
      window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onTestAuthChange);
      document.removeEventListener("visibilitychange", onVisibility);
      authSub?.data.subscription.unsubscribe();
    };
  }, []);

  /** 인증 확인과 병행해 방·메시지 캐시 선채움 — RSC에서 이미 내려준 경우 중복 요청 생략 */
  useEffect(() => {
    if (!roomId?.trim() || serverBootstrap?.room) return;
    warmChatRoomEntryById(roomId, chatRoomSourceHint);
  }, [roomId, chatRoomSourceHint, serverBootstrap?.room]);

  useEffect(() => {
    if (chatEntryShellLoggedRef.current) return;
    const mark = readTradeChatEntryMark();
    if (!mark || mark.shellShownAt) return;
    const next = patchTradeChatEntryMark({ shellShownAt: Date.now() });
    if (!next?.shellShownAt) return;
    chatEntryShellLoggedRef.current = true;
    logClientPerf("chat-entry.shell-open", {
      mode: next.mode,
      productId: next.productId,
      roomId: next.roomId ?? roomId,
      elapsedMs: Math.max(0, next.shellShownAt - next.startedAt),
    });
  }, [roomId]);

  /** 라우트 roomId 변경 시 메모리 peek 로 즉시 복원(메시지 캐시까지) */
  useEffect(() => {
    if (!roomId?.trim()) {
      setRoom(null);
      setLoading(false);
      setErr(null);
      setBootstrapMessages(null);
      return;
    }
    const peeked = peekChatRoomDetailMemory(roomId);
    setErr(null);
    if (peeked) {
      setRoom(peeked);
      const msgs =
        peeked.source === "chat_room"
          ? peekIntegratedChatRoomMessagesCache(peeked.id)
          : peekLegacyChatRoomMessagesCache(peeked.id);
      setBootstrapMessages(msgs ?? null);
      setLoading(false);
    } else {
      setRoom(null);
      setBootstrapMessages(null);
      setLoading(true);
    }
  }, [roomId]);

  useEffect(() => {
    if (!roomId?.trim() || resolvedUserId === null) return;

    if (serverBootstrap?.room) {
      let cancelled = false;
      const run = () => {
        if (cancelled) return;
        void hardRefreshBootstrap();
      };
      if (typeof requestIdleCallback !== "undefined") {
        const ricId = requestIdleCallback(run, { timeout: 800 });
        return () => {
          cancelled = true;
          cancelIdleCallback(ricId);
        };
      }
      const tid = window.setTimeout(run, 0);
      return () => {
        cancelled = true;
        clearTimeout(tid);
      };
    }

    void reload();
  }, [roomId, resolvedUserId, serverBootstrap?.room, reload, hardRefreshBootstrap]);

  useRefetchOnPageShowRestore(() => {
    void hardRefreshBootstrap();
  });

  /** 거래 채팅 진입 마커 — early return 앞에 두어 hooks 순서 고정 */
  useEffect(() => {
    const viewerForChat = (resolvedUserId ?? getSyncViewerUserIdForClient()) ?? null;
    if (!room || !viewerForChat) return;
    if (chatEntryRoomReadyLoggedRef.current === room.id) return;
    chatEntryRoomReadyLoggedRef.current = room.id;
    const mark = readTradeChatEntryMark();
    if (!mark || mark.roomResolvedAt) return;
    const next = patchTradeChatEntryMark({ roomResolvedAt: Date.now(), roomId: room.id });
    if (!next?.roomResolvedAt) return;
    logClientPerf("chat-entry.room-ready", {
      mode: next.mode,
      productId: next.productId,
      roomId: room.id,
      source: room.source ?? null,
      elapsedMs: Math.max(0, next.roomResolvedAt - next.startedAt),
    });
  }, [room, resolvedUserId]);

  const viewportClass =
    embedded && embeddedFill ? "" : embedded ? "" : VIEWPORT_HEIGHT_MINUS_BOTTOM_NAV_CLASS;

  const embeddedEmptyClass =
    embedded && embeddedFill
      ? "flex min-h-[180px] flex-1 flex-col items-center justify-center px-4 text-center"
      : embedded
        ? "min-h-[240px] rounded-ui-rect border border-gray-100 bg-white"
        : "min-h-[50vh]";

  if (!roomId) {
    return (
      <div className={`flex flex-col items-center justify-center px-4 text-center ${embeddedEmptyClass}`}>
        <p className="text-sm text-gray-600">{t("common_invalid_chat_room")}</p>
        {onListNavigate ? (
          <button type="button" onClick={onListNavigate} className="mt-3 font-medium text-signature underline">
            {t("common_to_list")}
          </button>
        ) : (
          <Link href={listHref} className="mt-3 font-medium text-signature underline" replace scroll={false}>
            {t("common_to_list")}
          </Link>
        )}
      </div>
    );
  }

  if (resolvedUserId === null) {
    return (
      <div className={`flex flex-col items-center justify-center px-4 text-center ${embeddedEmptyClass}`}>
        <p className="text-sm text-gray-600">{t("common_login_required")}</p>
        <Link href="/login" className="mt-3 font-medium text-signature underline">
          {t("common_login")}
        </Link>
      </div>
    );
  }

  /** 비동기 `getCurrentUserIdForDb` 가 끝나기 전에도 프로필 캐시·테스트 세션이 있으면 즉시 사용 */
  const viewerForChat = (resolvedUserId ?? getSyncViewerUserIdForClient()) ?? null;

  /** 메모리 peek + 뷰어 ID가 있으면 상세·메시지 로드와 병행해 바로 채팅 UI 표시 */
  if (room && viewerForChat) {
    const isStoreOrderChat = room.generalChat?.kind === "store_order";
    const igDmOuter = isStoreOrderChat || !room.generalChat;
    const outerClassReady =
      embedded && embeddedFill
        ? `flex min-h-0 flex-1 flex-col overflow-hidden ${igDmOuter ? "bg-white" : "bg-[#e8e4df]"}`
        : tradeHubColumnLayout && !embedded
          ? `flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${igDmOuter ? "bg-white" : "bg-[#e8e4df]"}`
          : `${igDmOuter ? "bg-white" : "bg-[#e8e4df]"} ${
              embedded ? "overflow-hidden rounded-ui-rect border border-gray-100 shadow-sm" : viewportClass
            }`;

    return (
      <div
        className={outerClassReady}
        data-samarket-chat-room-id={room.id}
        data-samarket-trade-chat-surface={tradeHubColumnLayout ? "trade-hub" : embedded ? "embedded" : "full"}
      >
        <ChatDetailView
          room={room}
          currentUserId={viewerForChat}
          onRoomReload={() => void reload({ bypassPeek: true })}
          openReviewOnMount={openReviewOnMount}
          listHref={listHref}
          onListNavigate={onListNavigate}
          embedded={embedded}
          embeddedFill={embeddedFill}
          tradeHubColumnLayout={tradeHubColumnLayout}
          ownerStoreOrderModalChrome={ownerStoreOrderModalChrome}
          initialBootstrapMessages={bootstrapMessages}
        />
      </div>
    );
  }

  if (resolvedUserId === undefined && !getSyncViewerUserIdForClient() && !room) {
    return (
      <div className={`min-h-0 flex-1 ${embeddedEmptyClass}`}>
        <TradeChatLoadingShell
          label={t("common_loading")}
          description="채팅 화면을 준비 중이에요."
          className="min-h-[50vh]"
        />
      </div>
    );
  }

  if (loading && !room && !err) {
    return (
      <div className={`min-h-0 flex-1 ${embeddedEmptyClass}`}>
        <TradeChatLoadingShell
          label={t("common_loading")}
          description="대화 내용을 불러오는 중이에요."
          className="min-h-[50vh]"
        />
      </div>
    );
  }

  if (err === "not_found") {
    return (
      <div className={`flex flex-col items-center justify-center px-4 text-center ${embeddedEmptyClass}`}>
        <p className="text-sm text-gray-600">{t("common_chat_room_not_found")}</p>
        {onListNavigate ? (
          <button type="button" onClick={onListNavigate} className="mt-3 font-medium text-signature underline">
            {t("common_to_list")}
          </button>
        ) : (
          <Link href={listHref} className="mt-3 font-medium text-signature underline" replace scroll={false}>
            {t("common_to_list")}
          </Link>
        )}
      </div>
    );
  }

  if (err || !room) {
    return (
      <div className={`flex flex-col items-center justify-center px-4 text-center ${embeddedEmptyClass}`}>
        <p className="text-sm text-red-600">
          {err === "auth" ? t("common_access_denied") : t("common_chat_room_load_failed")}
        </p>
        <button type="button" onClick={() => void reload()} className="mt-3 font-medium text-signature underline">
          {t("common_retry")}
        </button>
        {onListNavigate ? (
          <button type="button" onClick={onListNavigate} className="mt-2 text-sm text-gray-600 underline">
            {t("common_to_list")}
          </button>
        ) : (
          <Link href={listHref} replace scroll={false} className="mt-2 text-sm text-gray-600 underline">
            {t("common_to_list")}
          </Link>
        )}
      </div>
    );
  }

  if (room && !viewerForChat) {
    return (
      <div className={`min-h-0 flex-1 ${embeddedEmptyClass}`}>
        <TradeChatLoadingShell
          label={t("common_loading")}
          description="채팅 화면을 이어서 준비 중이에요."
          className="min-h-[50vh]"
        />
      </div>
    );
  }

  return (
    <div className={`min-h-0 flex-1 ${embeddedEmptyClass}`}>
      <TradeChatLoadingShell
        label={t("common_loading")}
        description="채팅 화면을 준비 중이에요."
        className="min-h-[50vh]"
      />
    </div>
  );
}
