"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTradeChatResolvedViewer } from "@/components/chats/use-trade-chat-resolved-viewer";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ChatDetailView } from "@/components/chats/ChatDetailView";
import { getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";
import type { ChatMessage, ChatRoom, ChatRoomSource } from "@/lib/types/chat";
import { cancelScheduledWhenBrowserIdle, scheduleWhenBrowserIdle } from "@/lib/ui/network-policy";
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
import {
  patchTradeChatEntryMark,
  readTradeChatEntryMark,
} from "@/lib/chats/trade-chat-entry-client";
import { logClientPerf, perfNow } from "@/lib/performance/samarket-perf";
import { TradeChatLoadingShell } from "@/components/chats/TradeChatLoadingShell";
import { useNotificationSurfaceTradeChatRoom } from "@/lib/ui/use-notification-surface-explicit-chat-rooms";

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
  /** 통합 채팅 Realtime — 부트스트랩·캐시 준비 후에만 true (단일 진입 경로) */
  const [tradeChatBootstrapReady, setTradeChatBootstrapReady] = useState(() => {
    if (serverBootstrap?.room) return true;
    if (roomId && peekChatRoomDetailMemory(roomId)) return true;
    return false;
  });
  const chatEntryShellLoggedRef = useRef(false);
  const chatEntryRoomReadyLoggedRef = useRef<string | null>(null);
  /** `lite` 부트스트랩 후 `full` 보강 예약 취소용 */
  const bootstrapFullIdleIdRef = useRef<number | null>(null);

  useNotificationSurfaceTradeChatRoom(roomId);

  useTradeChatResolvedViewer(initialViewerUserId, setResolvedUserId);

  useEffect(() => {
    return () => {
      if (bootstrapFullIdleIdRef.current != null) {
        cancelScheduledWhenBrowserIdle(bootstrapFullIdleIdRef.current);
        bootstrapFullIdleIdRef.current = null;
      }
    };
  }, [roomId]);

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
    if (!hadPeek && !options?.bypassPeek) setTradeChatBootstrapReady(false);
    setErr(null);
    if (bootstrapFullIdleIdRef.current != null) {
      cancelScheduledWhenBrowserIdle(bootstrapFullIdleIdRef.current);
      bootstrapFullIdleIdRef.current = null;
    }

    const failBootstrap = (
      result: Extract<Awaited<ReturnType<typeof fetchChatRoomBootstrapApi>>, { ok: false }>
    ) => {
      setBootstrapMessages(null);
      setTradeChatBootstrapReady(false);
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
    };

    const applyBootstrapOk = (
      result: Extract<Awaited<ReturnType<typeof fetchChatRoomBootstrapApi>>, { ok: true }>,
      bootstrapPhase: "lite" | "full" | "full_rescue"
    ) => {
      setRoom(result.room);
      setBootstrapMessages(result.messages);
      updateChatRoomDetailMemory(roomId, result.room);
      if (result.room.source === "chat_room") {
        updateIntegratedChatRoomMessagesCache(result.room.id, result.messages);
      } else {
        updateLegacyChatRoomMessagesCache(result.room.id, result.messages);
      }
      setTradeChatBootstrapReady(true);
      setLoading(false);
      logClientPerf("chat-room-screen.reload", {
        roomId,
        result: "ok",
        detailCache: result.cache,
        elapsedMs: Math.round(perfNow() - startedAt),
        bootstrapPhase,
      });
    };

    try {
      const hard = options?.bypassPeek === true;
      if (hard) {
        const result = await fetchChatRoomBootstrapApi(roomId, chatRoomSourceHint, {
          bypassPeek: true,
          phase: "full",
        });
        if (!result.ok) {
          failBootstrap(result);
          return;
        }
        applyBootstrapOk(result, "full");
        return;
      }

      const lite = await fetchChatRoomBootstrapApi(roomId, chatRoomSourceHint, {
        bypassPeek: false,
        phase: "lite",
      });
      if (!lite.ok) {
        const rescue = await fetchChatRoomBootstrapApi(roomId, chatRoomSourceHint, {
          bypassPeek: false,
          phase: "full",
        });
        if (!rescue.ok) {
          failBootstrap(rescue);
          return;
        }
        applyBootstrapOk(rescue, "full_rescue");
        return;
      }

      applyBootstrapOk(lite, "lite");

      const idleId = scheduleWhenBrowserIdle(() => {
        bootstrapFullIdleIdRef.current = null;
        void (async () => {
          const full = await fetchChatRoomBootstrapApi(roomId, chatRoomSourceHint, {
            bypassPeek: true,
            phase: "full",
          });
          if (!full.ok) return;
          setRoom(full.room);
          setBootstrapMessages(full.messages);
          updateChatRoomDetailMemory(roomId, full.room);
          if (full.room.source === "chat_room") {
            updateIntegratedChatRoomMessagesCache(full.room.id, full.messages);
          } else {
            updateLegacyChatRoomMessagesCache(full.room.id, full.messages);
          }
          logClientPerf("chat-room-screen.bootstrap-full-merge", {
            roomId,
            elapsedMs: Math.round(perfNow() - startedAt),
          });
        })();
      }, 1800);
      bootstrapFullIdleIdRef.current = idleId;
      return;
    } catch {
      setBootstrapMessages(null);
      /* bootstrap fallback below */
    }
    try {
      const result = await fetchChatRoomDetailApi(roomId);
      if (!result.ok) {
        setTradeChatBootstrapReady(false);
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
      setBootstrapMessages([]);
      setTradeChatBootstrapReady(true);
      logClientPerf("chat-room-screen.reload", {
        roomId,
        result: "ok_degraded_detail_only",
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

  /**
   * 라우트 roomId 변경 시 복원.
   * - RSC `serverBootstrap` 이 있으면 peek·메모리보다 우선(레이스로 빈 로딩 상태가 덮어쓰지 않게).
   * - 부모 `key={roomId}` 로 방 전환 시 마운트가 갈리므로 state 초기값과 이 effect 가 일치하기 쉬움.
   */
  useEffect(() => {
    if (!roomId?.trim()) {
      setRoom(null);
      setLoading(false);
      setErr(null);
      setBootstrapMessages(null);
      setTradeChatBootstrapReady(false);
      return;
    }
    const id = roomId.trim();
    if (serverBootstrap?.room?.id === id) {
      setErr(null);
      setRoom(serverBootstrap.room);
      setBootstrapMessages(serverBootstrap.messages);
      setTradeChatBootstrapReady(true);
      setLoading(false);
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
      setTradeChatBootstrapReady(true);
      setLoading(false);
    } else {
      setRoom(null);
      setBootstrapMessages(null);
      setTradeChatBootstrapReady(false);
      setLoading(true);
    }
    /* `serverBootstrap` 전체를 deps 에 넣으면 부모가 매 렌더 새 객체를 넘길 때 상태 루프 위험 — RSC 는 room.id 단위로 일관 */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roomId + serverBootstrap.room.id 만으로 동기화
  }, [roomId, serverBootstrap?.room?.id]);

  useEffect(() => {
    if (!roomId?.trim() || resolvedUserId === null) return;
    const id = roomId.trim();

    /**
     * RSC가 이미 `loadChatRoomBootstrapForUser`(entry)로 방·메시지를 내려준 경우
     * 마운트 직후 동일 `/bootstrap` GET을 다시 하지 않음 — DB·네트워크 이중화와 체감 지연 방지.
     * 후기 제출 여부 등 `full` 메타는 탭 복귀·bfcache 시 `useRefetchOnPageShowRestore`로 보강.
     * `serverBootstrap.room` 참조만 바뀌는 경우 effect 재실행으로 레이스 나지 않게 `room.id` 기준.
     */
    if (serverBootstrap?.room?.id === id) return;

    void reload();
  }, [roomId, resolvedUserId, serverBootstrap?.room?.id, reload]);

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
        ? "min-h-[240px] rounded-ui-rect border border-sam-border-soft bg-sam-surface"
        : "min-h-[50vh]";

  if (!roomId) {
    return (
      <div className={`flex flex-col items-center justify-center px-4 text-center ${embeddedEmptyClass}`}>
        <p className="text-sm text-sam-muted">{t("common_invalid_chat_room")}</p>
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
        <p className="text-sm text-sam-muted">{t("common_login_required")}</p>
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
        ? `flex min-h-0 flex-1 flex-col overflow-hidden ${igDmOuter ? "bg-sam-surface" : "bg-[#e8e4df]"}`
        : tradeHubColumnLayout && !embedded
          ? `flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${igDmOuter ? "bg-sam-surface" : "bg-[#e8e4df]"}`
          : `${igDmOuter ? "bg-sam-surface" : "bg-[#e8e4df]"} ${
              embedded ? "overflow-hidden rounded-ui-rect border border-sam-border-soft shadow-sm" : viewportClass
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
          tradeChatBootstrapReady={tradeChatBootstrapReady}
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
        <p className="text-sm text-sam-muted">{t("common_chat_room_not_found")}</p>
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
          <button type="button" onClick={onListNavigate} className="mt-2 text-sm text-sam-muted underline">
            {t("common_to_list")}
          </button>
        ) : (
          <Link href={listHref} replace scroll={false} className="mt-2 text-sm text-sam-muted underline">
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
