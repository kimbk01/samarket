"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ChatDetailView } from "@/components/chats/ChatDetailView";
import { getCurrentUserIdForDb, getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { ChatRoom } from "@/lib/types/chat";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { VIEWPORT_HEIGHT_MINUS_BOTTOM_NAV_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { fetchChatRoomDetailApi, peekChatRoomDetailMemory } from "@/lib/chats/fetch-chat-room-detail-api";
import { warmChatRoomEntryById } from "@/lib/chats/prewarm-chat-room-route";
import { logClientPerf, perfNow } from "@/lib/performance/samarket-perf";

export function ChatRoomScreen({
  roomId,
  openReviewOnMount = false,
  listHref,
  onListNavigate,
  embedded = false,
  embeddedFill = false,
  tradeHubColumnLayout = false,
  ownerStoreOrderModalChrome = false,
}: {
  roomId: string | null;
  openReviewOnMount?: boolean;
  /** 오류·빈 화면에서 «목록으로» 링크 */
  listHref: string;
  /** 라우팅 없이 거래채팅 목록(시트 등)으로 복귀 */
  onListNavigate?: () => void;
  embedded?: boolean;
  /** embedded일 때 세로 풀 높이(모임방 전체 화면) */
  embeddedFill?: boolean;
  /** `/mypage/trade/chat/[room]` — 거래 허브 탭 아래 컬럼 높이 + 스티키 보정 */
  tradeHubColumnLayout?: boolean;
  /** 매장 주문 관리 모달 — 상단 탭(채팅·주문)만 표시 */
  ownerStoreOrderModalChrome?: boolean;
}) {
  const { t } = useI18n();
  /**
   * `undefined`: 세션 확인 전
   * 프로필 캐시·테스트 세션이 있으면 첫 페인트부터 문자열로 두어 방 상세 fetch·UI 가 한 틱 빨리 진행
   */
  const [resolvedUserId, setResolvedUserId] = useState<string | null | undefined>(() => {
    const sync = getSyncViewerUserIdForClient();
    return sync ?? undefined;
  });

  const [room, setRoom] = useState<ChatRoom | null>(() =>
    roomId ? peekChatRoomDetailMemory(roomId) : null
  );
  const [loading, setLoading] = useState(() => Boolean(roomId && !peekChatRoomDetailMemory(roomId)));
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
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
    if (!hadPeek) setLoading(true);
    setErr(null);
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
      logClientPerf("chat-room-screen.reload", {
        roomId,
        result: "ok",
        detailCache: result.cache,
        elapsedMs: Math.round(perfNow() - startedAt),
      });
    } finally {
      setLoading(false);
    }
  }, [roomId, resolvedUserId]);

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

  /** 인증 확인과 병행해 방·메시지 캐시 선채움 — `reload`·`ChatDetailView` 초기 로드가 single-flight 로 합류 */
  useEffect(() => {
    if (!roomId?.trim()) return;
    warmChatRoomEntryById(roomId);
  }, [roomId]);

  /** 라우트 roomId 변경 시 메모리 peek 로 즉시 복원 — 다른 방으로 바꿀 때만 */
  useEffect(() => {
    if (!roomId?.trim()) {
      setRoom(null);
      setLoading(false);
      setErr(null);
      return;
    }
    const peeked = peekChatRoomDetailMemory(roomId);
    setRoom(peeked);
    setErr(null);
    if (peeked) setLoading(false);
  }, [roomId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useRefetchOnPageShowRestore(() => {
    void reload();
  });

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
          onRoomReload={() => void reload()}
          openReviewOnMount={openReviewOnMount}
          listHref={listHref}
          onListNavigate={onListNavigate}
          embedded={embedded}
          embeddedFill={embeddedFill}
          tradeHubColumnLayout={tradeHubColumnLayout}
          ownerStoreOrderModalChrome={ownerStoreOrderModalChrome}
        />
      </div>
    );
  }

  if (resolvedUserId === undefined && !getSyncViewerUserIdForClient() && !room) {
    return (
      <div className={`flex items-center justify-center text-sm text-muted ${embeddedEmptyClass}`}>{t("common_loading")}</div>
    );
  }

  if (loading && !room) {
    return (
      <div className={`flex items-center justify-center text-sm text-muted ${embeddedEmptyClass}`}>{t("common_loading")}</div>
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
      <div className={`flex items-center justify-center text-sm text-muted ${embeddedEmptyClass}`}>{t("common_loading")}</div>
    );
  }

  return (
    <div className={`flex items-center justify-center text-sm text-muted ${embeddedEmptyClass}`}>{t("common_loading")}</div>
  );
}
