"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { CommunityMessengerHeaderActions } from "@/components/community-messenger/CommunityMessengerHeaderActions";
import { CommunityMessengerHomeListPane } from "@/components/community-messenger/CommunityMessengerHomeListPane";
import { CommunityMessengerPrivateGroupCreatePanel } from "@/components/community-messenger/CommunityMessengerPrivateGroupCreatePanel";
import { DiscoverableOpenGroupCard } from "@/components/community-messenger/home/DiscoverableOpenGroupCard";
import { MeetingJoinPreviewFullScreen } from "@/components/community-messenger/meetings/MeetingJoinPreviewFullScreen";
import type { MessengerMenuAnchorRect } from "@/components/community-messenger/MessengerChatListItem";
import { MessengerHomeBottomSheetShell } from "@/components/community-messenger/MessengerSheetUi";
import type { MessengerFriendAddTab } from "@/components/community-messenger/MessengerFriendAddSheet";
import {
  MessengerChatRoomActionSheet,
  MessengerFriendAddSheet,
  MessengerFriendProfileSheet,
  MessengerFriendsPrivacySheet,
  MessengerNewConversationSheet,
  MessengerNotificationCenterSheet,
  MessengerSearchSheet,
  MessengerSettingsSheet,
} from "@/components/community-messenger/community-messenger-home-lazy-sheets";
import { samTier1HeaderRightColumn } from "@/lib/ui/tier1-header-icon";
import { tryRedirectMessengerHomeAuthBlocked } from "@/lib/community-messenger/home/messenger-home-auth-blocked-redirect";
import {
  resolveImportantRoomHighlightReason,
  type MessengerNotificationCenterItem,
} from "@/lib/community-messenger/messenger-notification-center-model";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  type CommunityMessengerLocalSettings,
  setCommunityMessengerIncomingCallBannerEnabled,
  setCommunityMessengerIncomingCallSoundEnabled,
  writeCommunityMessengerLocalSettings,
} from "@/lib/community-messenger/preferences";
import { messengerMonitorUnreadListSync } from "@/lib/community-messenger/monitoring/client";
import {
  invalidateMeNotificationSettingsGetFlight,
} from "@/lib/me/fetch-me-notification-settings-client";
import type {
  CommunityMessengerSettingsBackup,
  FriendSheetState,
  MessengerNotificationSettings,
} from "@/lib/community-messenger/home/community-messenger-home-types";
import { messengerHomeActionErrorMessage } from "@/lib/community-messenger/home/messenger-home-action-error-message";
import { scoreKeywordMatch } from "@/lib/community-messenger/home/score-keyword-match";
import { attachMessengerHydrationSchedulerSurface } from "@/lib/community-messenger/background-hydration-scheduler";
import { initLongSessionStabilityMonitor } from "@/lib/ops/long-session-stability";
import {
  markMessengerShellVisible,
  resetMessengerAppShellFastPathClock,
} from "@/lib/community-messenger/app-shell-fast-path-log";
import { commitHomeListPatch } from "@/lib/community-messenger/home-list-patch";
import { useCommunityMessengerHomeRealtimeBootstrapList } from "@/lib/community-messenger/home/use-community-messenger-home-realtime-bootstrap-list";
import { useCommunityMessengerTradePostListingRealtime } from "@/lib/community-messenger/home/use-community-messenger-trade-post-listing-realtime";
import {
  onCommunityMessengerBusEvent,
  postCommunityMessengerBusEvent,
} from "@/lib/community-messenger/multi-tab-bus";
import { requestMessengerHubBadgeResync } from "@/lib/community-messenger/notifications/messenger-notification-contract";
import { useCommunityMessengerHomeBootstrap } from "@/lib/community-messenger/home/use-community-messenger-home-bootstrap";
import { useTradeChatListMetaHydration } from "@/lib/community-messenger/use-trade-chat-list-meta-hydration";
import { mergeDiscoverableGroupsFromOpenGroupsClient } from "@/lib/community-messenger/merge-discoverable-open-groups-client";
import { bumpMessengerRenderPerf } from "@/lib/runtime/samarket-runtime-debug";
import { guardedRouterReplace } from "@/lib/dev/network-loop-guard";
import {
  cmCallLatencyInfo,
  cmCallLatencyMarkClick,
  setCmCallLatencyContext,
} from "@/lib/community-messenger/cm-call-debug";
import {
  launchOutgoingDirectCall,
} from "@/lib/community-messenger/call-session-navigation-seed";
import {
  guardInstantOutgoingCallStart,
  navigateBlockedOutgoingCall,
} from "@/lib/call/outgoing-call-start-guard";
import { MessengerOutgoingCallConfirmDialog } from "@/components/community-messenger/MessengerOutgoingCallConfirmDialog";
import {
  mergeCommunityMessengerProfileFromBootstrap,
  resolveMessengerFriendAddCta,
} from "@/lib/community-messenger/messenger-friend-add-cta";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import {
  readPreferredCommunityMessengerDeviceIds,
  writePreferredCommunityMessengerDeviceIds,
} from "@/lib/community-messenger/media-preflight";
import {
  enqueueRoomPrefetch,
  messengerRoomPrefetchPriorityScore,
  MESSENGER_HOME_LIST_PREFETCH_SEED_COUNT,
} from "@/lib/community-messenger/room-prefetch-queue";
import {
  invalidateRoomSnapshot,
  peekRoomSnapshot,
  prefetchCommunityMessengerRoomSnapshot,
  primeHotRoomSnapshot,
  primeRoomSnapshot,
} from "@/lib/community-messenger/room-snapshot-cache";
import {
  communityMessengerRoomHref,
  MESSENGER_ENTRY_ORIGIN_QUERY_KEY,
} from "@/lib/community-messenger/messenger-entry-origin";
import { communityMessengerRoomResourcePath } from "@/lib/community-messenger/messenger-room-bootstrap";
import {
  buildCommunityMessengerMarkReadPatchBody,
  communityMessengerMarkReadFetchInitBase,
  parseCommunityMessengerMarkReadResponse,
} from "@/lib/community-messenger/room/community-messenger-mark-read-fetch";
import { CommunityMessengerHomeReturnConsume } from "@/components/community-messenger/CommunityMessengerHomeReturnConsume";
import { getSwipeLeaveConfirmMessage } from "@/lib/messenger-policy/chat-room-swipe-actions";
import { toMessengerPolicyRoomType } from "@/lib/messenger-policy/messenger-policy-room-type";
import { defaultTradeChatRoomHref } from "@/lib/chats/trade-chat-notification-href";
import {
  type MessengerChatInboxFilter,
  type MessengerChatKindFilter,
  type MessengerArchiveSection,
  type MessengerChatListContext,
  type MessengerMainSection,
  messengerRoomMenuItemId,
  resolveMessengerChatFilters,
  resolveMessengerSection,
} from "@/lib/community-messenger/messenger-ia";
import { MESSENGER_SCROLL_OVERLAY_IDLE_MS } from "@/lib/community-messenger/messenger-transient-ui-policy";
import {
  buildGeneralDirectRoomByPeerMap,
  communityMessengerRoomIsDelivery,
  communityMessengerRoomIsTrade,
  pickGeneralDirectRoomForPeer,
} from "@/lib/community-messenger/messenger-room-domain";
import {
  communityMessengerRoomIsInboxHidden,
  type CommunityMessengerBootstrap,
  type CommunityMessengerCallLog,
  type CommunityMessengerDiscoverableGroupSummary,
  type CommunityMessengerProfileLite,
  type CommunityMessengerRoomSnapshot,
  type CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";
import {
  COMMUNITY_MESSENGER_USER_SEARCH_MIN_LENGTH,
  type CommunityMessengerUserSearchResult,
} from "@/lib/community-messenger/user-public-id-search";
import { useIncomingFriendRequestPopupStore } from "@/lib/community-messenger/stores/incoming-friend-request-popup-store";
import {
  countAllPendingMessengerFriendRequests,
  countReceivedPendingMessengerFriendRequests,
} from "@/lib/community-messenger/partition-messenger-friend-requests";
import {
  type UnifiedRoomListItem,
  useCommunityMessengerHomeState,
} from "@/lib/community-messenger/use-community-messenger-home-state";
import {
  writeDismissedCommunityMessengerNotificationIds,
} from "@/lib/community-messenger/community-messenger-home-notification-dismiss-storage";
import {
  useCommunityMessengerHomeNavigation,
  type NavigateToCommunityRoomOptions,
} from "@/lib/community-messenger/home/use-community-messenger-home-navigation";
import { fetchMeetingDeeplink } from "@/lib/community-messenger/home/fetch-meeting-deeplink";
import { useCommunityMessengerHomeShellEffects } from "@/lib/community-messenger/home/use-community-messenger-home-shell-effects";
import { usePhilifeHeaderMessengerStack } from "@/contexts/PhilifeHeaderMessengerStackContext";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { APP_MAIN_HEADER_INNER_CLASS } from "@/lib/ui/app-content-layout";
import { philifeAppPaths } from "@domain/philife/paths";
import {
  cmReadBadgeLog,
  refreshLocalReadGuardServerAck,
  setLocalReadGuard,
} from "@/lib/community-messenger/read/local-read-guard";
import { applyCmReadUiBadgeZero } from "@/lib/community-messenger/read/cm-read-ui-patch";
import {
  applyCmHomeOptimisticMarkRead,
  rollbackCmHomeOptimisticMarkRead,
} from "@/lib/community-messenger/read/cm-home-optimistic-mark-read";
import { findHomeListRoomRow } from "@/lib/community-messenger/home-list-patch";
import { seedMessengerRealtimeViewerFromBootstrap } from "@/lib/community-messenger/stores/messenger-realtime-store";
import {
  cmRtRoomSubLog,
  messengerRealtimeGetSubscribedMessageRoomIds,
  normalizeCmRealtimeSubscribeRoomId,
} from "@/lib/community-messenger/realtime/cm-rt-room-sub-log";
import { cmRtStableSubLog } from "@/lib/community-messenger/realtime/cm-rt-stable-sub-log";
import {
  cmRtHs4DiagnosisLog,
  cmRtHs4FingerprintDigest,
} from "@/lib/community-messenger/realtime/cm-rt-hs4-diagnosis";
import { resolveCommunityMessengerRoomIdFromChatRow } from "@/lib/community-messenger/realtime/resolve-community-messenger-room-id-from-chat-row";
import { capVisibleRoomIdsForTradeRealtime } from "@/lib/trade/trade-realtime-subscribe-policy";
import {
  getTradeVisibleRoomSubscribeIds,
  mergeHomeAndTradeVisibleRealtimeRoomIds,
  pruneTradeVisibleRoomRegistry,
  setTradeVisibleRoomRealtimePinnedIds,
  setTradeVisibleRoomRealtimeReportingEnabled,
  subscribeTradeVisibleRoomRealtimeSubscribeSet,
} from "@/lib/trade/trade-visible-room-realtime-registry";
import {
  cmEventLoopDiagnosticsEnabled,
  logCmMemoPropEqual,
  useCmDevRenderTrace,
  useCmHomeRenderSourceProbe,
  useCmStrictModeEffectProbe,
} from "@/lib/community-messenger/dev/cm-event-loop-dev";

type CommunityMessengerHomeOverlayKind =
  | "composer"
  | "requests"
  | "search"
  | "friends-privacy"
  | "settings"
  | "public-group-find";

type CommunityMessengerHomeProps = {
  initialTab?: string;
  initialSection?: string;
  initialFilter?: string;
  initialKind?: string;
  initialServerBootstrap?: CommunityMessengerBootstrap | null;
  fromPhilifeHeaderStack?: boolean;
  pillar?: "trade" | "delivery" | null;
};

/** `use-community-messenger-home-state` 의 `directRoomMapsEqual` 과 동일 — peer→room Map 참조 안정화 */
function directRoomMapsEqual(
  a: Map<string, CommunityMessengerRoomSummary>,
  b: Map<string, CommunityMessengerRoomSummary>
): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of b) {
    if (a.get(k) !== v) return false;
  }
  return true;
}

type CommunityMessengerHomePropsMemoDiffEntry = {
  prev: string | boolean | null | undefined;
  next: string | boolean | null | undefined;
  /** 참조만 바뀌고 표시값은 동일할 수 있음 */
  refChurn: boolean;
  /** primitive 값 자체가 다름 */
  valueChange: boolean;
};

function bootstrapPropsMemoRefLabel(value: CommunityMessengerBootstrap | null | undefined): string | null {
  if (value == null) return null;
  return `ref:me=${value.me?.id ?? "none"}`;
}

const cmHomePropsMemoDiffLastLogAt = { at: 0 };

function logCommunityMessengerHomePropsMemoDiff(
  reasons: string[],
  propDiff: Partial<Record<keyof CommunityMessengerHomeProps, CommunityMessengerHomePropsMemoDiffEntry>>
): void {
  if (!cmEventLoopDiagnosticsEnabled() || reasons.length === 0) return;
  const now = Date.now();
  if (now - cmHomePropsMemoDiffLastLogAt.at < 280) return;
  cmHomePropsMemoDiffLastLogAt.at = now;
  // eslint-disable-next-line no-console -- gated Home props memo diagnostics
  console.debug("[cm-memo-diff]", {
    component: "CommunityMessengerHome",
    entityIdSuffix: "props",
    reasons,
    memo_equal: false,
    propDiff,
  });
}

function communityMessengerHomePropsEqual(
  prev: CommunityMessengerHomeProps,
  next: CommunityMessengerHomeProps
): boolean {
  const reasons: string[] = [];
  const propDiff: Partial<Record<keyof CommunityMessengerHomeProps, CommunityMessengerHomePropsMemoDiffEntry>> =
    {};

  const checkPrimitive = (
    key: "initialTab" | "initialSection" | "initialFilter" | "initialKind",
    prevValue: string | undefined,
    nextValue: string | undefined
  ) => {
    if (prevValue === nextValue) return;
    reasons.push(key);
    propDiff[key] = {
      prev: prevValue,
      next: nextValue,
      refChurn: false,
      valueChange: true,
    };
  };

  checkPrimitive("initialTab", prev.initialTab, next.initialTab);
  checkPrimitive("initialSection", prev.initialSection, next.initialSection);
  checkPrimitive("initialFilter", prev.initialFilter, next.initialFilter);
  checkPrimitive("initialKind", prev.initialKind, next.initialKind);

  if (prev.initialServerBootstrap !== next.initialServerBootstrap) {
    reasons.push("initialServerBootstrap");
    propDiff.initialServerBootstrap = {
      prev: bootstrapPropsMemoRefLabel(prev.initialServerBootstrap),
      next: bootstrapPropsMemoRefLabel(next.initialServerBootstrap),
      refChurn:
        prev.initialServerBootstrap != null &&
        next.initialServerBootstrap != null &&
        prev.initialServerBootstrap !== next.initialServerBootstrap,
      valueChange: prev.initialServerBootstrap == null || next.initialServerBootstrap == null,
    };
  }

  if (prev.fromPhilifeHeaderStack !== next.fromPhilifeHeaderStack) {
    reasons.push("fromPhilifeHeaderStack");
    propDiff.fromPhilifeHeaderStack = {
      prev: prev.fromPhilifeHeaderStack,
      next: next.fromPhilifeHeaderStack,
      refChurn: false,
      valueChange: true,
    };
  }

  if (prev.pillar !== next.pillar) {
    reasons.push("pillar");
    propDiff.pillar = {
      prev: prev.pillar,
      next: next.pillar,
      refChurn: false,
      valueChange: true,
    };
  }

  if (reasons.length > 0) {
    logCommunityMessengerHomePropsMemoDiff(reasons, propDiff);
    return false;
  }
  logCmMemoPropEqual("CommunityMessengerHome", "props");
  return true;
}

/** pillar 서브 라우트·인박스별 목록 pathname — `usePathname` 구독 없이 navigation·auth redirect 에 사용 */
function resolveCommunityMessengerHomeListPathname(pillar: "trade" | "delivery" | null): string {
  if (pillar === "trade") return "/community-messenger/trade-chats";
  if (pillar === "delivery") return "/community-messenger/delivery-chats";
  return "/community-messenger";
}

function readMessengerEntryOriginFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(MESSENGER_ENTRY_ORIGIN_QUERY_KEY);
}

function buildCommunityMessengerHomeProbeSearchQueryString(args: {
  initialTab?: string;
  initialSection?: string;
  initialFilter?: string;
  initialKind?: string;
  entryOriginQuery: string | null;
}): string {
  const qs = new URLSearchParams();
  if (args.initialTab) qs.set("tab", args.initialTab);
  if (args.initialSection) qs.set("section", args.initialSection);
  if (args.initialFilter) qs.set("filter", args.initialFilter);
  if (args.initialKind) qs.set("kind", args.initialKind);
  if (args.entryOriginQuery) qs.set(MESSENGER_ENTRY_ORIGIN_QUERY_KEY, args.entryOriginQuery);
  return qs.toString();
}

type CommunityMessengerHomeRouterEffectsHostProps = {
  onEntryOriginQueryChange: (next: string | null) => void;
  openHomeOverlay: (overlay: CommunityMessengerHomeOverlayKind) => void;
  setMainSection: Dispatch<SetStateAction<MessengerMainSection>>;
  setMainTier1Extras: ReturnType<typeof useSetMainTier1ExtrasOptional>;
  headerActionsNode: ReactNode;
  roomActionSheetOpen: boolean;
  setRoomActionSheet: () => void;
  setOpenedMenuItemId: Dispatch<SetStateAction<string | null>>;
  setIncomingCallSoundEnabled: Dispatch<SetStateAction<boolean>>;
  setIncomingCallBannerEnabled: Dispatch<SetStateAction<boolean>>;
  setLocalSettings: Dispatch<SetStateAction<CommunityMessengerLocalSettings>>;
  setRecentSearches: Dispatch<SetStateAction<string[]>>;
  recentSearches: string[];
  setDismissedNotificationIds: Dispatch<SetStateAction<string[]>>;
  openSettingsSheet: () => void;
  setChatInboxFilter: Dispatch<SetStateAction<MessengerChatInboxFilter>>;
  setChatKindFilter: Dispatch<SetStateAction<MessengerChatKindFilter>>;
  setNotificationSettings: Dispatch<SetStateAction<MessengerNotificationSettings>>;
  data: CommunityMessengerBootstrap | null;
  fromPhilifeHeaderStack: boolean;
  mainSection: MessengerMainSection;
  pillar: "trade" | "delivery" | null;
};

/** Router context(`useSearchParams`) 구독·URL 동기 effect — Home 본문 리렌더 전파 차단 */
function CommunityMessengerHomeRouterEffectsHost({
  onEntryOriginQueryChange,
  openHomeOverlay,
  setMainSection,
  setMainTier1Extras,
  headerActionsNode,
  roomActionSheetOpen,
  setRoomActionSheet,
  setOpenedMenuItemId,
  setIncomingCallSoundEnabled,
  setIncomingCallBannerEnabled,
  setLocalSettings,
  setRecentSearches,
  recentSearches,
  setDismissedNotificationIds,
  openSettingsSheet,
  setChatInboxFilter,
  setChatKindFilter,
  setNotificationSettings,
  data,
  fromPhilifeHeaderStack,
  mainSection,
  pillar,
}: CommunityMessengerHomeRouterEffectsHostProps): null {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchQueryString = searchParams.toString();
  const meetingIdParam = searchParams.get("meetingId")?.trim() ?? "";
  const openParam = searchParams.get("open")?.trim() ?? "";
  const fromParam = searchParams.get(MESSENGER_ENTRY_ORIGIN_QUERY_KEY);

  useLayoutEffect(() => {
    onEntryOriginQueryChange(fromParam);
  }, [fromParam, onEntryOriginQueryChange]);

  useCommunityMessengerHomeShellEffects({
    router,
    searchParams,
    setMainTier1Extras,
    headerActionsNode,
    roomActionSheetOpen,
    setRoomActionSheet,
    setOpenedMenuItemId,
    setIncomingCallSoundEnabled,
    setIncomingCallBannerEnabled,
    setLocalSettings,
    setRecentSearches,
    recentSearches,
    setDismissedNotificationIds,
    openSettingsSheet,
    setMainSection,
    setChatInboxFilter,
    setChatKindFilter,
    setNotificationSettings,
    data,
    fromPhilifeHeaderStack,
    mainSection,
    pillar,
  });

  const messengerMeetingDeeplinkSeq = useRef(0);
  useEffect(() => {
    if (!meetingIdParam) return;
    const seq = ++messengerMeetingDeeplinkSeq.current;
    const ac = new AbortController();
    const strip = () => {
      guardedRouterReplace(router, "/community-messenger?section=open_chat", {
        source: "community-messenger-home",
        reason: "meeting_deeplink_strip",
        scroll: false,
      });
    };
    void (async () => {
      try {
        const resolved = await fetchMeetingDeeplink(meetingIdParam, ac.signal);
        if (seq !== messengerMeetingDeeplinkSeq.current) return;
        if (resolved.kind === "room") {
          try {
            await fetch(
              `/api/community-messenger/rooms/${encodeURIComponent(resolved.roomId)}/meeting-ensure-participant`,
              { method: "POST", credentials: "include", signal: ac.signal }
            );
          } catch {
            /* */
          }
          guardedRouterReplace(
            router,
            `/community-messenger/rooms/${encodeURIComponent(resolved.roomId)}`,
            {
              source: "community-messenger-home",
              reason: "meeting_deeplink_room",
            }
          );
          return;
        }
        if (resolved.kind === "post") {
          guardedRouterReplace(router, philifeAppPaths.post(resolved.postId), {
            source: "community-messenger-home",
            reason: "meeting_deeplink_post",
          });
          return;
        }
        strip();
      } catch {
        if (seq !== messengerMeetingDeeplinkSeq.current || ac.signal.aborted) return;
        strip();
      }
    })();
    return () => {
      ac.abort();
    };
  }, [meetingIdParam, router]);

  useEffect(() => {
    if (openParam !== "public-group-find") return;
    setMainSection("open_chat");
    openHomeOverlay("public-group-find");
    const next = new URLSearchParams(searchQueryString);
    next.delete("open");
    if (next.get("section") !== "open_chat") {
      next.set("section", "open_chat");
    }
    const qs = next.toString();
    const target = qs ? `/community-messenger?${qs}` : "/community-messenger?section=open_chat";
    guardedRouterReplace(router, target, {
      source: "community-messenger-home",
      reason: "open_public_group_find",
      scroll: false,
    });
  }, [openParam, openHomeOverlay, router, searchQueryString, setMainSection]);

  return null;
}

export const CommunityMessengerHome = memo(function CommunityMessengerHome({
  initialTab,
  initialSection,
  initialFilter,
  initialKind,
  /**
   * `/community-messenger` RSC 는 부트스트랩을 내리지 않는다(null).
   * 클라이언트는 `peekBootstrapCache`·`GET /api/community-messenger/bootstrap`(lite/full) 단일 경로로 동기화한다.
   */
  initialServerBootstrap = null,
  /** `/philife` 헤더 메신저 푸시 스택(하단 탭과 별도) */
  fromPhilifeHeaderStack = false,
  /**
   * 거래/배달 전용 서브 라우트(`/community-messenger/trade-chats`, `/delivery-chats`).
   * - 채팅 목록을 해당 pillar 의 방으로 강제 한정.
   * - 상단 묶음 행·기타 main section(친구/모임/보관함) 은 표시하지 않음.
   * - 1단 헤더 제목은 해당 채팅 scope 로 표기.
   */
  pillar = null,
}: CommunityMessengerHomeProps) {
  useCmDevRenderTrace("CommunityMessengerHome");
  useCmStrictModeEffectProbe("CommunityMessengerHome");
  bumpMessengerRenderPerf("messenger_home_render");
  const { t, language } = useI18n();
  const router = useRouter();
  const messengerListPathname = useMemo(
    () => resolveCommunityMessengerHomeListPathname(pillar),
    [pillar]
  );
  const [entryOriginQuery, setEntryOriginQuery] = useState<string | null>(() => {
    if (pillar) return null;
    return readMessengerEntryOriginFromLocation();
  });
  const onEntryOriginQueryChange = useCallback((next: string | null) => {
    setEntryOriginQuery((prev) => (prev === next ? prev : next));
  }, []);
  const { requestClose: closePhilifeHeaderMessenger, isOpen: philifeHeaderStackIsOpen } =
    usePhilifeHeaderMessengerStack();
  /** 언어 전환 시에도 부트스트랩 effect 가 재실행되지 않도록 번역 함수만 최신으로 유지 */
  const tRef = useRef(t) as MutableRefObject<(key: string) => string>;
  tRef.current = t as (key: string) => string;
  const {
    data,
    setData,
    loading,
    listAwaitingCritical,
    authRequired,
    setAuthRequired,
    pageError,
    setPageError,
    refresh,
    homeRealtimeGateOpen,
    hydrateDeferredCallLogs,
    hydrateMessengerFriends,
  } = useCommunityMessengerHomeBootstrap({ initialServerBootstrap, tRef });
  useLayoutEffect(() => {
    markMessengerShellVisible();
    return () => resetMessengerAppShellFastPathClock();
  }, []);
  /** 백그라운드 hydrate 스케줄러 표면 활성 — 언마운트 시 큐·실행 중 작업 정리 */
  useEffect(() => {
    attachMessengerHydrationSchedulerSurface(true);
    return () => attachMessengerHydrationSchedulerSurface(false);
  }, []);
  useEffect(() => {
    initLongSessionStabilityMonitor();
  }, []);
  useEffect(() => {
    return onCommunityMessengerBusEvent((ev) => {
      if (ev.type === "cm.home.social_sync") void refresh(true);
    });
  }, [refresh]);
  /** 초기 부트스트랩 HTTP 는 훅 내부 `refreshRef` 로 마운트당 1회만( `refresh` 함수 참조 변경으로 재요청 없음 ). */
  /** home-sync critical 은 trade meta 를 defer — 목록·거래 탭 모두 silent `trade-chat-list-meta` 보강 */
  useTradeChatListMetaHydration({
    enabled: Boolean(data?.me?.id),
    viewerUserId: data?.me?.id ?? null,
    chats: data?.chats,
    setData,
  });
  /** 발신 다이얼 `router.push` 동기 연타 방지 */
  const outgoingDialSyncGuardRef = useRef(false);
  const setMainTier1Extras = useSetMainTier1ExtrasOptional();
  const [activeOverlay, setActiveOverlay] = useState<CommunityMessengerHomeOverlayKind | null>(
    initialTab === "settings" ? "settings" : null
  );
  const [friendManagerOpen, setFriendManagerOpen] = useState(false);
  const [friendAddTab, setFriendAddTab] = useState<MessengerFriendAddTab>("id");
  const [friendUserSearchAttempted, setFriendUserSearchAttempted] = useState(false);
  const [friendSheet, setFriendSheet] = useState<FriendSheetState | null>(null);
  const friendSearchRef = useRef<HTMLInputElement | null>(null);
  const [mainSection, setMainSection] = useState<MessengerMainSection>(() =>
    pillar ? "chats" : resolveMessengerSection(initialSection, initialTab)
  );
  const [chatInboxFilter, setChatInboxFilter] = useState<MessengerChatInboxFilter>(() => {
    const { inbox } = resolveMessengerChatFilters(initialFilter, initialKind, initialTab);
    return inbox;
  });
  const [chatKindFilter, setChatKindFilter] = useState<MessengerChatKindFilter>(() => {
    const { kind } = resolveMessengerChatFilters(initialFilter, initialKind, initialTab);
    return kind;
  });
  const [roomActionSheet, setRoomActionSheet] = useState<{
    item: UnifiedRoomListItem;
    listContext: MessengerChatListContext;
    anchorRect: MessengerMenuAnchorRect | null;
  } | null>(null);
  const [openedSwipeItemId, setOpenedSwipeItemId] = useState<string | null>(null);
  const [openedMenuItemId, setOpenedMenuItemId] = useState<string | null>(null);
  const [messengerOverlayGeneration, setMessengerOverlayGeneration] = useState(0);
  /** Tab swipe between friends/chats/archive; avoid parent re-render when friends quick menu toggles. */
  const friendQuickMenuBlocksTabSwipeRef = useRef(false);
  const [selectedArchiveSection, setSelectedArchiveSection] = useState<MessengerArchiveSection | null>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const isScrollingRef = useRef(false);
  const scrollResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Coalesce swipe/menu dismiss during list scroll (see `messenger-transient-ui-policy.ts`). */
  const listScrollDismissRafRef = useRef<number | null>(null);
  const composerOpen = activeOverlay === "composer";
  const requestSheetOpen = activeOverlay === "requests";
  const searchSheetOpen = activeOverlay === "search";
  const friendsPrivacySheetOpen = activeOverlay === "friends-privacy";
  const settingsSheetOpen = activeOverlay === "settings";
  const publicGroupFindOpen = activeOverlay === "public-group-find";

  const openHomeOverlay = useCallback((overlay: CommunityMessengerHomeOverlayKind) => {
    setActiveOverlay((current) => (current === overlay ? current : overlay));
  }, []);

  const closeHomeOverlay = useCallback((overlay?: CommunityMessengerHomeOverlayKind) => {
    setActiveOverlay((current) => {
      if (overlay && current !== overlay) return current;
      return null;
    });
  }, []);

  const resetMessengerTransientUi = useCallback(() => {
    setOpenedSwipeItemId((prev) => (prev === null ? prev : null));
    setOpenedMenuItemId((prev) => (prev === null ? prev : null));
    setRoomActionSheet((prev) => (prev === null ? prev : null));
    setMessengerOverlayGeneration((g) => g + 1);
  }, []);

  const notifyMessengerListScroll = useCallback(() => {
    if (!isScrollingRef.current) {
      isScrollingRef.current = true;
      setIsScrolling((prev) => (prev ? prev : true));
    }
    if (scrollResetTimerRef.current != null) {
      clearTimeout(scrollResetTimerRef.current);
    }
    scrollResetTimerRef.current = setTimeout(() => {
      isScrollingRef.current = false;
      setIsScrolling((prev) => (prev ? false : prev));
      scrollResetTimerRef.current = null;
    }, MESSENGER_SCROLL_OVERLAY_IDLE_MS);

    if (listScrollDismissRafRef.current != null) return;
    listScrollDismissRafRef.current = requestAnimationFrame(() => {
      listScrollDismissRafRef.current = null;
      setOpenedSwipeItemId((s) => (s == null ? s : null));
      setOpenedMenuItemId((m) => (m == null ? m : null));
      setRoomActionSheet((current) => (current == null ? current : null));
    });
  }, []);

  useEffect(() => {
    return () => {
      if (listScrollDismissRafRef.current != null) {
        cancelAnimationFrame(listScrollDismissRafRef.current);
        listScrollDismissRafRef.current = null;
      }
    };
  }, []);

  const openMessengerMenuItem = useCallback((id: string) => {
    setOpenedSwipeItemId((prev) => (prev === null ? prev : null));
    setOpenedMenuItemId(id);
    setRoomActionSheet((prev) => (prev === null ? prev : null));
  }, []);

  const closeMessengerMenuItem = useCallback((id?: string) => {
    setOpenedMenuItemId((current) => {
      if (!id) return null;
      return current === id ? null : current;
    });
  }, []);

  const openRoomActions = useCallback(
    (
      item: UnifiedRoomListItem,
      listContext: MessengerChatListContext,
      anchorRect: MessengerMenuAnchorRect | null
    ) => {
      setOpenedSwipeItemId((prev) => (prev === null ? prev : null));
      setOpenedMenuItemId(messengerRoomMenuItemId(item.room.id, listContext));
      setRoomActionSheet({ item, listContext, anchorRect });
    },
    []
  );

  const { navigateToCommunityRoom, onPrimarySectionChange, onChatListChipChange } =
    useCommunityMessengerHomeNavigation({
      router,
      chatInboxFilter,
      chatKindFilter,
      resetMessengerTransientUi,
      setMainSection,
      setChatInboxFilter,
      setChatKindFilter,
      pathname: messengerListPathname,
      messengerEntryOrigin: entryOriginQuery,
    });
  const messengerViewerUserId = data?.me?.id?.trim() || null;
  const navigateToCommunityRoomWithViewer = useCallback(
    (roomId: string, options?: NavigateToCommunityRoomOptions) => {
      navigateToCommunityRoom(roomId, {
        ...options,
        viewerUserId: options?.viewerUserId ?? messengerViewerUserId,
      });
    },
    [navigateToCommunityRoom, messengerViewerUserId]
  );
  /** 통화 탭 — `deferredCallLog` 1200ms follow-up 대기 없이 즉시 보강 */
  useEffect(() => {
    if (mainSection !== "call_logs") return;
    if (!data?.deferredCallLog) return;
    void hydrateDeferredCallLogs();
  }, [mainSection, data?.deferredCallLog, hydrateDeferredCallLogs]);
  /** 친구 탭 — lite/critical 에 friends 가 비었을 때 DB fallback hydrate */
  useEffect(() => {
    if (mainSection !== "friends") return;
    void hydrateMessengerFriends();
  }, [mainSection, hydrateMessengerFriends, data?.clientHydrationTier, data?.friends?.length]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [roomSearchKeyword, setRoomSearchKeyword] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<string[]>([]);
  const groupInviteNotifications = useIncomingFriendRequestPopupStore((s) => s.groupInviteList);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchResults, setSearchResults] = useState<CommunityMessengerUserSearchResult[]>([]);
  const [friendUserSearchBusy, setFriendUserSearchBusy] = useState(false);
  const friendUserSearchSeqRef = useRef(0);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [groupInviteSearchQuery, setGroupInviteSearchQuery] = useState("");
  const [groupInviteSearchResults, setGroupInviteSearchResults] = useState<CommunityMessengerProfileLite[]>([]);
  const [groupInviteSearchBusy, setGroupInviteSearchBusy] = useState(false);
  const [groupInviteSearchFailed, setGroupInviteSearchFailed] = useState(false);
  const [groupSelectedProfiles, setGroupSelectedProfiles] = useState<Record<string, CommunityMessengerProfileLite>>({});
  const groupInviteSearchSeqRef = useRef(0);
  const [groupCreateStep, setGroupCreateStep] = useState<"closed" | "select" | "private_group" | "open_group">("closed");
  const [openGroupTitle, setOpenGroupTitle] = useState("");
  const [openGroupSummary, setOpenGroupSummary] = useState("");
  const [openGroupPassword, setOpenGroupPassword] = useState("");
  const [openGroupMemberLimit, setOpenGroupMemberLimit] = useState("200");
  const [openGroupDiscoverable, setOpenGroupDiscoverable] = useState(true);
  const [openGroupJoinPolicy, setOpenGroupJoinPolicy] = useState<"password" | "free">("password");
  const [openGroupIdentityPolicy, setOpenGroupIdentityPolicy] = useState<"real_name" | "alias_allowed">("alias_allowed");
  const [openGroupCreatorIdentityMode, setOpenGroupCreatorIdentityMode] = useState<"real_name" | "alias">("real_name");
  const [openGroupCreatorAliasName, setOpenGroupCreatorAliasName] = useState("");
  const [openGroupCreatorAliasBio, setOpenGroupCreatorAliasBio] = useState("");
  const [openGroupCreatorAliasAvatarUrl, setOpenGroupCreatorAliasAvatarUrl] = useState("");
  const [openGroupSearch, setOpenGroupSearch] = useState("");
  const [joinTargetGroup, setJoinTargetGroup] = useState<CommunityMessengerDiscoverableGroupSummary | null>(null);
  const [joinPassword, setJoinPassword] = useState("");
  const [joinIdentityMode, setJoinIdentityMode] = useState<"real_name" | "alias">("real_name");
  const [joinAliasName, setJoinAliasName] = useState("");
  const [joinAliasBio, setJoinAliasBio] = useState("");
  const [joinAliasAvatarUrl, setJoinAliasAvatarUrl] = useState("");
  const resetFriendSearchState = useCallback(() => {
    setSearchKeyword((prev) => (prev === "" ? prev : ""));
    setSearchResults([]);
    setFriendUserSearchAttempted((prev) => (prev ? false : prev));
  }, []);
  const resetGroupCreateDraft = useCallback(() => {
    setGroupTitle((prev) => (prev === "" ? prev : ""));
    setGroupMembers((prev) => (prev.length === 0 ? prev : []));
    setGroupInviteSearchQuery((prev) => (prev === "" ? prev : ""));
    setGroupInviteSearchResults((prev) => (prev.length === 0 ? prev : []));
    setGroupInviteSearchBusy((prev) => (prev ? false : prev));
    setGroupInviteSearchFailed((prev) => (prev ? false : prev));
    setGroupSelectedProfiles((prev) => (Object.keys(prev).length === 0 ? prev : {}));
    setOpenGroupTitle((prev) => (prev === "" ? prev : ""));
    setOpenGroupSummary((prev) => (prev === "" ? prev : ""));
    setOpenGroupPassword((prev) => (prev === "" ? prev : ""));
    setOpenGroupMemberLimit((prev) => (prev === "200" ? prev : "200"));
    setOpenGroupDiscoverable((prev) => (prev ? prev : true));
    setOpenGroupJoinPolicy((prev) => (prev === "password" ? prev : "password"));
    setOpenGroupIdentityPolicy((prev) => (prev === "alias_allowed" ? prev : "alias_allowed"));
    setOpenGroupCreatorIdentityMode((prev) => (prev === "real_name" ? prev : "real_name"));
    setOpenGroupCreatorAliasName((prev) => (prev === "" ? prev : ""));
    setOpenGroupCreatorAliasBio((prev) => (prev === "" ? prev : ""));
    setOpenGroupCreatorAliasAvatarUrl((prev) => (prev === "" ? prev : ""));
  }, []);
  const resetJoinOpenGroupDraft = useCallback(() => {
    setJoinPassword("");
    setJoinIdentityMode("real_name");
    setJoinAliasName("");
    setJoinAliasBio("");
    setJoinAliasAvatarUrl("");
  }, []);
  const closeJoinOpenGroupModal = useCallback(() => {
    resetJoinOpenGroupDraft();
    setJoinTargetGroup((prev) => (prev === null ? prev : null));
  }, [resetJoinOpenGroupDraft]);
  const [incomingCallSoundEnabled, setIncomingCallSoundEnabled] = useState(true);
  const [incomingCallBannerEnabled, setIncomingCallBannerEnabled] = useState(true);
  const [outgoingCallConfirm, setOutgoingCallConfirm] = useState<null | {
    peerUserId: string;
    peerLabel: string;
    kind: "voice" | "video";
  }>(null);
  const [localSettings, setLocalSettings] = useState<CommunityMessengerLocalSettings>({
    phoneFriendAddEnabled: true,
    contactAutoAddEnabled: false,
    groupJoinPreviewEnabled: true,
    mediaAutoSaveEnabled: false,
    linkPreviewEnabled: true,
  });
  const [notificationSettings, setNotificationSettings] = useState<MessengerNotificationSettings>({
    trade_chat_enabled: true,
    community_chat_enabled: true,
    order_enabled: true,
    store_enabled: true,
    sound_enabled: true,
    vibration_enabled: true,
  });
  const notificationSettingsMountRef = useRef(notificationSettings);
  const notificationSettingsLoadedProbeRef = useRef(false);
  if (
    !notificationSettingsLoadedProbeRef.current &&
    notificationSettings !== notificationSettingsMountRef.current
  ) {
    notificationSettingsLoadedProbeRef.current = true;
  }
  useCmHomeRenderSourceProbe({
    pathname: messengerListPathname,
    searchQueryString: buildCommunityMessengerHomeProbeSearchQueryString({
      initialTab,
      initialSection,
      initialFilter,
      initialKind,
      entryOriginQuery,
    }),
    language,
    philifeHeaderStackIsOpen,
    loading,
    listAwaitingCritical,
    homeRealtimeGateOpen,
    notificationSettingsLoaded: notificationSettingsLoadedProbeRef.current,
    data,
  });
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const incomingRequestCount = useMemo(
    () => countAllPendingMessengerFriendRequests(data?.requests),
    [data?.requests]
  );
  const receivedFriendRequestCount = useMemo(
    () => countReceivedPendingMessengerFriendRequests(data?.requests),
    [data?.requests]
  );
  const friendProfileForSheet = useMemo(() => {
    if (!friendSheet || friendSheet.mode !== "profile") return null;
    if (data) return mergeCommunityMessengerProfileFromBootstrap(friendSheet.profile, data);
    return friendSheet.profile;
  }, [friendSheet, data]);

  const friendAddCtaForSheet = useMemo(() => {
    if (!friendProfileForSheet || !data?.me?.id) return undefined;
    return resolveMessengerFriendAddCta(friendProfileForSheet);
  }, [friendProfileForSheet, data?.me?.id]);

  const savedFriendIds = useMemo(
    () => new Set((data?.friends ?? []).map((friend) => friend.id.trim()).filter(Boolean)),
    [data?.friends]
  );

  const homeRoomIds = useMemo(
    () => [...(data?.chats ?? []), ...(data?.groups ?? [])].map((room) => room.id),
    [data?.chats, data?.groups]
  );

  const messengerTradePostIds = useMemo(() => {
    const ids = new Set<string>();
    for (const room of [...(data?.chats ?? []), ...(data?.groups ?? [])]) {
      const m = room.contextMeta;
      if (!m || m.kind !== "trade") continue;
      const pid = String(m.postId ?? "").trim();
      if (pid) ids.add(pid);
    }
    return [...ids];
  }, [data?.chats, data?.groups]);

  useEffect(() => {
    seedMessengerRealtimeViewerFromBootstrap(data);
  }, [data]);

  const directRoomMapStableRef = useRef<Map<string, CommunityMessengerRoomSummary>>(new Map());
  const directRoomByPeerId = useMemo(() => {
    const map = buildGeneralDirectRoomByPeerMap(data?.chats ?? []);
    const prevStable = directRoomMapStableRef.current;
    if (directRoomMapsEqual(prevStable, map)) {
      return prevStable;
    }
    directRoomMapStableRef.current = map;
    return map;
  }, [data?.chats]);

  const messengerInviteUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/community-messenger?section=friends`;
  }, []);

  const getMessengerActionErrorMessage = useCallback(
    (error?: string) => messengerHomeActionErrorMessage(t, error),
    [t]
  );

  useEffect(() => {
    if (!localSettings.phoneFriendAddEnabled && friendAddTab === "contacts") {
      setFriendAddTab("id");
    }
  }, [friendAddTab, localSettings.phoneFriendAddEnabled]);

  useEffect(() => {
    if (!friendManagerOpen) return;
    setFriendUserSearchAttempted(false);
    setSearchResults([]);
  }, [friendManagerOpen]);

  useEffect(() => {
    if (friendManagerOpen) return;
    resetFriendSearchState();
  }, [friendManagerOpen, resetFriendSearchState]);

  useEffect(() => {
    if (activeOverlay === "search") return;
    setRoomSearchKeyword("");
  }, [activeOverlay]);

  useEffect(() => {
    if (activeOverlay === "public-group-find") return;
    setOpenGroupSearch("");
  }, [activeOverlay]);

  useEffect(() => {
    if (groupCreateStep !== "closed") return;
    resetGroupCreateDraft();
  }, [groupCreateStep, resetGroupCreateDraft]);

  useEffect(() => {
    if (groupCreateStep !== "private_group") return;
    void refresh(true);
  }, [groupCreateStep, refresh]);

  useEffect(() => {
    if (joinTargetGroup) return;
    resetJoinOpenGroupDraft();
  }, [joinTargetGroup, resetJoinOpenGroupDraft]);

  const closeRoomActionSheet = useCallback(() => setRoomActionSheet(null), []);

  useCommunityMessengerTradePostListingRealtime({
    viewerUserId: data?.me?.id ?? null,
    tradePostIds: messengerTradePostIds,
    enabled: Boolean(data?.me?.id) && homeRealtimeGateOpen && messengerTradePostIds.length > 0,
    setData,
  });

  const reviveDirectRoomForEntry = useCallback(
    async (room: CommunityMessengerRoomSummary) => {
      if (room.roomType !== "direct" || !communityMessengerRoomIsInboxHidden(room)) return true;
      const res = await fetch(communityMessengerRoomResourcePath(room.id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive", archived: false }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setActionError(getMessengerActionErrorMessage(json.error ?? "room_archive_update_failed"));
        return false;
      }
      commitHomeListPatch(
        setData,
        {
          kind: "room_update",
          roomId: room.id,
          updater: (current) => ({ ...current, isArchivedByViewer: false }),
        },
        "bootstrap"
      );
      return true;
    },
    [getMessengerActionErrorMessage, setData]
  );

  const maybePrefetchDirectRoom = useCallback(
    (peerUserId: string) => {
      const existing = pickGeneralDirectRoomForPeer(data?.chats ?? [], peerUserId);
      if (existing) void prefetchCommunityMessengerRoomSnapshot(existing.id);
    },
    [data?.chats]
  );

  const startDirectRoom = useCallback(
    async (peerUserId: string) => {
      setActionError(null);
      const viewerUserId = data?.me?.id?.trim() || null;
      const existingRoom = pickGeneralDirectRoomForPeer(data?.chats ?? [], peerUserId);
      if (existingRoom) {
        const revived = await reviveDirectRoomForEntry(existingRoom);
        if (!revived) return;
        if (!peekRoomSnapshot(existingRoom.id, viewerUserId ?? undefined)) {
          void prefetchCommunityMessengerRoomSnapshot(existingRoom.id);
        }
        navigateToCommunityRoomWithViewer(existingRoom.id, {
          roomForPrime: existingRoom,
        });
        return;
      }
      setBusyId(`room:${peerUserId}`);
      try {
        const res = await fetch("/api/community-messenger/direct/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetUserId: peerUserId }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          roomId?: string;
          error?: string;
          snapshot?: CommunityMessengerRoomSnapshot;
        };
        if (res.ok && json.ok && json.roomId) {
          if (json.snapshot) {
            primeRoomSnapshot(json.roomId, json.snapshot);
            primeHotRoomSnapshot(json.roomId, json.snapshot);
            const uid = viewerUserId;
            const { description: _desc, ...roomSummary } = json.snapshot.room;
            commitHomeListPatch(
              setData,
              { kind: "merge_room_summary", summary: roomSummary },
              "bootstrap"
            );
            if (uid) {
              postCommunityMessengerBusEvent({
                type: "cm.home.merge_room_summary",
                viewerUserId: uid,
                summary: roomSummary,
                at: Date.now(),
              });
            }
            requestMessengerHubBadgeResync("direct_room_created");
          }
          navigateToCommunityRoomWithViewer(json.roomId, {
            roomForPrime: json.snapshot?.room,
          });
          return;
        }
        if (
          tryRedirectMessengerHomeAuthBlocked(router, res, json, {
            nextPath: messengerListPathname,
            loginRequiredMessage: t("common_login_required"),
          })
        ) {
          return;
        }
        if (res.status === 401 || res.status === 403) {
          setAuthRequired(true);
          setPageError(t("nav_messenger_login_required"));
          return;
        }
        setActionError(getMessengerActionErrorMessage(json.error));
      } finally {
        setBusyId(null);
      }
    },
    [
      data?.chats,
      data?.me?.id,
      getMessengerActionErrorMessage,
      navigateToCommunityRoomWithViewer,
      messengerListPathname,
      reviveDirectRoomForEntry,
      router,
      setAuthRequired,
      setData,
      setPageError,
      t,
    ]
  );

  /** 1:1 발신 — 즉시 `/calls/outgoing` 셸로 이동 후 세션 POST·`/calls/:sessionId` (`OutgoingDialPageClient`). */
  const startDirectCall = useCallback(
    (peerUserId: string, kind: "voice" | "video", peerLabelForDial?: string | null): boolean => {
      if (outgoingDialSyncGuardRef.current) return false;
      const guard = guardInstantOutgoingCallStart({
        peerUserId,
        kind,
      });
      if (!guard.ok) {
        if (guard.blockedCallId) navigateBlockedOutgoingCall(router, guard.blockedCallId);
        else showMessengerSnackbar(guard.userMessage, { variant: "error" });
        return false;
      }
      outgoingDialSyncGuardRef.current = true;
      setActionError(null);
      cmCallLatencyMarkClick({ surface: "messenger_home", callKind: kind });
      const existingRoom = pickGeneralDirectRoomForPeer(data?.chats ?? [], peerUserId);
      if (existingRoom && communityMessengerRoomIsInboxHidden(existingRoom)) {
        void reviveDirectRoomForEntry(existingRoom);
      }

      const roomId = existingRoom?.id?.trim() ? existingRoom.id.trim() : null;
      const peer = peerUserId.trim();
      setCmCallLatencyContext({
        role: "initiator",
        callKind: kind,
        roomId: roomId ?? undefined,
      });
      cmCallLatencyInfo("outgoing_route_push_start", {
        peerUserId: peer,
        roomId: roomId ?? undefined,
        callKind: kind,
        role: "initiator",
      });
      const releaseDialGuard = () => {
        if (typeof window !== "undefined") {
          window.setTimeout(() => {
            outgoingDialSyncGuardRef.current = false;
          }, 0);
        } else {
          outgoingDialSyncGuardRef.current = false;
        }
      };
      void (async () => {
        const result = await launchOutgoingDirectCall(
          roomId
            ? { kind, roomId, peerUserId: peer, peerLabel: peerLabelForDial?.trim() || undefined }
            : { kind, peerUserId: peer, peerLabel: peerLabelForDial?.trim() || undefined },
          router
        );
        releaseDialGuard();
        if (!result.ok) {
          showMessengerSnackbar(result.userMessage, { variant: "error" });
        }
      })();
      return true;
    },
    [data?.chats, reviveDirectRoomForEntry, router, t]
  );

  const refreshFriendSearch = useCallback(async (keyword: string) => {
    const q = keyword.trim();
    if (q.length < COMMUNITY_MESSENGER_USER_SEARCH_MIN_LENGTH) {
      setSearchResults([]);
      setFriendUserSearchAttempted(true);
      return;
    }
    setFriendUserSearchBusy(true);
    try {
      const res = await fetch(`/api/community-messenger/users?q=${encodeURIComponent(q)}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as { ok?: boolean; users?: CommunityMessengerUserSearchResult[] };
      setSearchResults(res.ok && json.ok ? json.users ?? [] : []);
      setFriendUserSearchAttempted(true);
    } finally {
      setFriendUserSearchBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!friendManagerOpen) return;
    const keyword = searchKeyword.trim();
    if (!keyword || keyword.length < COMMUNITY_MESSENGER_USER_SEARCH_MIN_LENGTH) {
      friendUserSearchSeqRef.current += 1;
      setSearchResults([]);
      setFriendUserSearchBusy(false);
      if (!keyword) setFriendUserSearchAttempted(false);
      return;
    }
    const seq = ++friendUserSearchSeqRef.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        setFriendUserSearchBusy(true);
        try {
          const res = await fetch(`/api/community-messenger/users?q=${encodeURIComponent(keyword)}`, {
            cache: "no-store",
          });
          if (seq !== friendUserSearchSeqRef.current) return;
          const json = (await res.json()) as { ok?: boolean; users?: CommunityMessengerUserSearchResult[] };
          setSearchResults(res.ok && json.ok ? json.users ?? [] : []);
          setFriendUserSearchAttempted(true);
        } finally {
          if (seq === friendUserSearchSeqRef.current) {
            setFriendUserSearchBusy(false);
          }
        }
      })();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [friendManagerOpen, searchKeyword]);

  useEffect(() => {
    if (groupCreateStep !== "private_group") return;
    const keyword = groupInviteSearchQuery.trim();
    if (!keyword) {
      groupInviteSearchSeqRef.current += 1;
      setGroupInviteSearchResults([]);
      setGroupInviteSearchBusy(false);
      setGroupInviteSearchFailed(false);
      return;
    }
    const viewerId = data?.me?.id ?? "";
    const seq = ++groupInviteSearchSeqRef.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        setGroupInviteSearchBusy(true);
        setGroupInviteSearchFailed(false);
        try {
          const res = await fetch(`/api/community-messenger/users?q=${encodeURIComponent(keyword)}`, {
            cache: "no-store",
          });
          if (seq !== groupInviteSearchSeqRef.current) return;
          const json = (await res.json()) as { ok?: boolean; users?: CommunityMessengerUserSearchResult[] };
          if (!res.ok || !json.ok) {
            setGroupInviteSearchResults([]);
            setGroupInviteSearchFailed(true);
            return;
          }
          const users = (json.users ?? []).map(
            (row): CommunityMessengerProfileLite => ({
              id: row.id,
              label: row.displayName,
              subtitle: row.publicId ? `@${row.publicId}` : undefined,
              avatarUrl: row.avatarUrl,
              following: false,
              blocked: row.isBlockedByMe || row.isBlockedByPeer,
              isFriend: row.isFriend,
              isFavoriteFriend: false,
            })
          );
          setGroupInviteSearchResults(viewerId ? users.filter((user) => user.id !== viewerId) : users);
        } catch {
          if (seq !== groupInviteSearchSeqRef.current) return;
          setGroupInviteSearchResults([]);
          setGroupInviteSearchFailed(true);
        } finally {
          if (seq === groupInviteSearchSeqRef.current) {
            setGroupInviteSearchBusy(false);
          }
        }
      })();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [data?.me?.id, groupCreateStep, groupInviteSearchQuery]);

  const addFriendSaved = useCallback(
    async (targetUserId: string) => {
      setBusyId(`friend-add:${targetUserId}`);
      try {
        const res = await fetch("/api/community-messenger/friend-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetUserId }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
        if (res.ok && json.ok) {
          showMessengerSnackbar(t("cm_ui_sent_friend_request"), { variant: "success" });
          void refresh(true);
        } else {
          showMessengerSnackbar(t("cm_ui_friend_request_send_failed"), { variant: "error" });
        }
      } finally {
        setBusyId(null);
      }
    },
    [refresh, t]
  );

  const respondRequest = useCallback(
    async (requestId: string, action: "accept" | "reject" | "cancel") => {
      const effectiveId = String(requestId ?? "").trim();
      if (!effectiveId) return;
      setBusyId(`request:${effectiveId}:${action}`);
      try {
        const res = await fetch(`/api/community-messenger/friend-requests/${encodeURIComponent(effectiveId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
        if (res.ok && json.ok) {
          void refresh(true);
        }
      } finally {
        setBusyId(null);
      }
    },
    [refresh]
  );

  const resolvePeerBlockedState = useCallback(
    (targetUserId: string): boolean => {
      const fromSearch = searchResults.find((p) => p.id === targetUserId);
      if (fromSearch) return fromSearch.isBlockedByMe || fromSearch.isBlockedByPeer;
      const pools = [
        ...(data?.friends ?? []),
        ...(data?.hidden ?? []),
        ...(data?.blocked ?? []),
        ...(data?.following ?? []),
      ];
      const hit = pools.find((p) => p.id === targetUserId);
      if (hit) return Boolean(hit.blocked);
      if (friendSheet?.profile.id === targetUserId) return Boolean(friendSheet.profile.blocked);
      return false;
    },
    [data?.blocked, data?.following, data?.friends, data?.hidden, friendSheet, searchResults]
  );

  const toggleFavoriteFriend = useCallback(
    async (friendUserId: string) => {
      setBusyId(`favorite:${friendUserId}`);
      try {
        const res = await fetch(`/api/community-messenger/friends/${encodeURIComponent(friendUserId)}/favorite`, {
          method: "POST",
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          isFavorite?: boolean;
          error?: string;
          code?: string;
        };
        if (res.ok && json.ok) {
          const nextFavorite = json.isFavorite === true;
          setData((prev) => {
            if (!prev) return prev;
            const patchList = (list: CommunityMessengerProfileLite[]) =>
              list.map((profile) => (profile.id === friendUserId ? { ...profile, isFavoriteFriend: nextFavorite } : profile));
            return {
              ...prev,
              friends: patchList(prev.friends),
              hidden: patchList(prev.hidden),
              following: patchList(prev.following),
              blocked: patchList(prev.blocked),
            };
          });
          setSearchResults((prev) =>
            prev.map((profile) => (profile.id === friendUserId ? { ...profile, isFavoriteFriend: nextFavorite } : profile))
          );
          setFriendSheet((prev) =>
            prev?.profile.id === friendUserId
              ? { ...prev, profile: { ...prev.profile, isFavoriteFriend: nextFavorite } }
              : prev
          );
          void refresh(true);
          return;
        }
        if (
          tryRedirectMessengerHomeAuthBlocked(router, res, json, {
            nextPath: messengerListPathname,
            loginRequiredMessage: t("common_login_required"),
          })
        ) {
          return;
        }
        if (res.status === 401 || res.status === 403) {
          setAuthRequired(true);
          setPageError(t("nav_messenger_login_required"));
          return;
        }
        setActionError(getMessengerActionErrorMessage(json.error));
      } finally {
        setBusyId(null);
      }
    },
    [getMessengerActionErrorMessage, messengerListPathname, refresh, router, setAuthRequired, setData, setPageError, t]
  );

  const toggleHiddenFriend = useCallback(
    async (friendUserId: string) => {
      setBusyId(`hidden:${friendUserId}`);
      try {
        const res = await fetch(`/api/community-messenger/friends/${encodeURIComponent(friendUserId)}/hidden`, {
          method: "POST",
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; isHidden?: boolean };
        if (res.ok && json.ok) {
          const nextHidden = json.isHidden === true;
          setData((prev) => {
            if (!prev) return prev;
            const patchList = (list: CommunityMessengerProfileLite[]) =>
              list.map((profile) => (profile.id === friendUserId ? { ...profile, isHiddenFriend: nextHidden } : profile));
            const sourceProfile =
              prev.friends.find((profile) => profile.id === friendUserId) ??
              prev.hidden.find((profile) => profile.id === friendUserId) ??
              null;
            const nextProfile = sourceProfile ? { ...sourceProfile, isHiddenFriend: nextHidden } : null;
            const nextFriendsBase = patchList(prev.friends).filter((profile) => profile.id !== friendUserId);
            const nextHiddenBase = patchList(prev.hidden).filter((profile) => profile.id !== friendUserId);
            const nextFriends = nextHidden ? nextFriendsBase : nextProfile ? [...nextFriendsBase, nextProfile] : nextFriendsBase;
            const nextHiddenList = nextHidden ? (nextProfile ? [...nextHiddenBase, nextProfile] : nextHiddenBase) : nextHiddenBase;
            return {
              ...prev,
              tabs: { ...prev.tabs, friends: nextFriends.length },
              friends: nextFriends,
              hidden: nextHiddenList,
              following: patchList(prev.following),
              blocked: patchList(prev.blocked),
            };
          });
          setSearchResults((prev) =>
            prev.map((profile) => (profile.id === friendUserId ? { ...profile, isHiddenFriend: nextHidden } : profile))
          );
          setFriendSheet((prev) =>
            prev?.profile.id === friendUserId
              ? { ...prev, profile: { ...prev.profile, isHiddenFriend: nextHidden } }
              : prev
          );
          void refresh(true);
        }
      } finally {
        setBusyId(null);
      }
    },
    [refresh, setData]
  );

  const toggleBlock = useCallback(
    async (targetUserId: string, options?: { blockSource?: "friend_list" | "chat_room" | "profile" | "incoming_call" | "call_log" }) => {
      setBusyId(`block:${targetUserId}`);
      try {
        const isBlocked = resolvePeerBlockedState(targetUserId);
        const res = await fetch("/api/community-messenger/relations/block", {
          method: isBlocked ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isBlocked
              ? { targetUserId }
              : { targetUserId, blockSource: options?.blockSource ?? "profile" }
          ),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; unblocked?: boolean };
        if (res.ok && json.ok) {
          if (isBlocked) {
            showMessengerSnackbar(t("cm_social_unblock_success"), { variant: "success" });
          }
          void refresh(true);
          void refreshFriendSearch(searchKeyword);
          return;
        }
        if (
          tryRedirectMessengerHomeAuthBlocked(router, res, json, {
            nextPath: messengerListPathname,
            loginRequiredMessage: t("common_login_required"),
          })
        ) {
          return;
        }
        if (res.status === 401 || res.status === 403) {
          setAuthRequired(true);
          setPageError(t("nav_messenger_login_required"));
          return;
        }
        setActionError(getMessengerActionErrorMessage(json.error));
      } finally {
        setBusyId(null);
      }
    },
    [
      getMessengerActionErrorMessage,
      messengerListPathname,
      refresh,
      refreshFriendSearch,
      resolvePeerBlockedState,
      router,
      searchKeyword,
      setAuthRequired,
      setPageError,
      t,
    ]
  );

  const createPrivateGroup = useCallback(async () => {
    const memberIds = [...new Set(groupMembers.filter(Boolean))];
    if (memberIds.length === 0) return;
    setActionError((prev) => (prev === null ? prev : null));
    setBusyId("create-private-group");
    try {
      const res = await fetch("/api/community-messenger/groups/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupType: "private_group",
          title: groupTitle,
          memberIds,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; roomId?: string; error?: string };
      if (res.ok && json.ok && json.roomId) {
        void refresh(true);
        resetGroupCreateDraft();
        setGroupCreateStep("closed");
        navigateToCommunityRoomWithViewer(json.roomId);
        return;
      }
      if (
        tryRedirectMessengerHomeAuthBlocked(router, res, json, {
          nextPath: messengerListPathname,
          loginRequiredMessage: t("common_login_required"),
        })
      ) {
        return;
      }
      if (res.status === 401 || res.status === 403) {
        setAuthRequired(true);
        setPageError(t("nav_messenger_login_required"));
        return;
      }
      setActionError(getMessengerActionErrorMessage(json.error));
    } finally {
      setBusyId(null);
    }
  }, [
    getMessengerActionErrorMessage,
    groupMembers,
    groupTitle,
    navigateToCommunityRoomWithViewer,
    messengerListPathname,
    refresh,
    resetGroupCreateDraft,
    router,
    setAuthRequired,
    setPageError,
    t,
  ]);

  const createOpenGroup = useCallback(async () => {
    if (!openGroupTitle.trim()) return;
    if (openGroupJoinPolicy === "password" && !openGroupPassword.trim()) return;
    if (openGroupCreatorIdentityMode === "alias" && !openGroupCreatorAliasName.trim()) return;
    setActionError(null);
    setBusyId("create-open-group");
    try {
      const res = await fetch("/api/community-messenger/groups/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupType: "open_group",
          title: openGroupTitle,
          summary: openGroupSummary,
          password: openGroupPassword,
          memberLimit: Number(openGroupMemberLimit || "200"),
          isDiscoverable: openGroupDiscoverable,
          joinPolicy: openGroupJoinPolicy,
          identityPolicy: openGroupIdentityPolicy,
          creatorIdentityMode: openGroupCreatorIdentityMode,
          creatorAliasProfile: {
            displayName: openGroupCreatorAliasName,
            bio: openGroupCreatorAliasBio,
            avatarUrl: openGroupCreatorAliasAvatarUrl,
          },
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; roomId?: string; error?: string };
      if (res.ok && json.ok && json.roomId) {
        void refresh(true);
        resetGroupCreateDraft();
        setGroupCreateStep("closed");
        navigateToCommunityRoomWithViewer(json.roomId);
        return;
      }
      if (
        tryRedirectMessengerHomeAuthBlocked(router, res, json, {
          nextPath: messengerListPathname,
          loginRequiredMessage: t("common_login_required"),
        })
      ) {
        return;
      }
      if (res.status === 401 || res.status === 403) {
        setAuthRequired(true);
        setPageError(t("nav_messenger_login_required"));
        return;
      }
      setActionError(getMessengerActionErrorMessage(json.error));
    } finally {
      setBusyId(null);
    }
  }, [
    getMessengerActionErrorMessage,
    navigateToCommunityRoomWithViewer,
    openGroupCreatorAliasAvatarUrl,
    openGroupCreatorAliasBio,
    openGroupCreatorAliasName,
    openGroupCreatorIdentityMode,
    openGroupDiscoverable,
    openGroupIdentityPolicy,
    openGroupJoinPolicy,
    openGroupMemberLimit,
    openGroupPassword,
    openGroupSummary,
    openGroupTitle,
    messengerListPathname,
    refresh,
    resetGroupCreateDraft,
    router,
    setAuthRequired,
    setPageError,
    t,
  ]);

  const joinOpenGroup = useCallback(async (targetGroup?: CommunityMessengerDiscoverableGroupSummary | null) => {
    const nextTargetGroup = targetGroup ?? joinTargetGroup;
    if (!nextTargetGroup) return;
    if (nextTargetGroup.joinPolicy === "password" && !joinPassword.trim()) return;
    if (joinIdentityMode === "alias" && !joinAliasName.trim()) return;
    setActionError(null);
    setBusyId(`join-open-group:${nextTargetGroup.id}`);
    try {
      const res = await fetch(`/api/community-messenger/open-groups/${encodeURIComponent(nextTargetGroup.id)}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: joinPassword,
          identityMode: joinIdentityMode,
          aliasProfile: {
            displayName: joinAliasName,
            bio: joinAliasBio,
            avatarUrl: joinAliasAvatarUrl,
          },
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; roomId?: string; error?: string };
      if (res.ok && json.ok && json.roomId) {
        void refresh(true);
        closeJoinOpenGroupModal();
        closeHomeOverlay("public-group-find");
        navigateToCommunityRoomWithViewer(json.roomId);
        return;
      }
      setActionError(getMessengerActionErrorMessage(json.error));
    } finally {
      setBusyId(null);
    }
  }, [
    closeJoinOpenGroupModal,
    closeHomeOverlay,
    getMessengerActionErrorMessage,
    joinAliasAvatarUrl,
    joinAliasBio,
    joinAliasName,
    joinIdentityMode,
    joinPassword,
    joinTargetGroup,
    navigateToCommunityRoomWithViewer,
    refresh,
  ]);

  const openJoinModal = useCallback(
    async (groupId: string) => {
      setActionError(null);
      setBusyId(`preview-open-group:${groupId}`);
      try {
        const res = await fetch(`/api/community-messenger/open-groups/${encodeURIComponent(groupId)}/preview-join`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          group?: CommunityMessengerDiscoverableGroupSummary;
          error?: string;
        };
        if (!res.ok || !json.ok || !json.group) {
          setActionError(getMessengerActionErrorMessage(json.error));
          return;
        }
        setJoinTargetGroup(json.group);
        resetJoinOpenGroupDraft();
        setJoinIdentityMode(json.group.identityPolicy === "alias_allowed" ? "alias" : "real_name");
        if (
          !localSettings.groupJoinPreviewEnabled &&
          json.group.joinPolicy === "free" &&
          json.group.identityPolicy !== "alias_allowed"
        ) {
          await joinOpenGroup(json.group);
        }
      } finally {
        setBusyId(null);
      }
    },
    [getMessengerActionErrorMessage, joinOpenGroup, localSettings.groupJoinPreviewEnabled, resetJoinOpenGroupDraft]
  );

  const {
    favoriteFriendIds,
    sortedFriends,
    friendSortEpochMs,
    sortedCalls,
    filteredDiscoverableGroups,
    baseChatListItems,
    openChatJoinedItems,
    searchSheetRoomItems,
    primaryListItems,
    friendStateModel,
  } = useCommunityMessengerHomeState({
    data,
    mainSection,
    chatInboxFilter,
    chatKindFilter,
    roomSearchKeyword,
    openGroupSearch,
    pillar,
  });

  /** Home 마운트 경로에서는 room 서브 pathname 이 없음 — realtime 은 `homeRoomIds` 만 사용 */
  const routeOpenMessengerRoomIdNorm = null;

  /** A+B: 부트스트랩 홈 방 + URL 라우트 방 — `roomOrder`·리스트 행과 분리해 fingerprint 안정 */
  const homeRouteRealtimeRoomIds = useMemo(() => {
    const set = new Set<string>();
    for (const id of homeRoomIds) {
      const n = normalizeCmRealtimeSubscribeRoomId(id);
      if (n) set.add(n);
    }
    if (routeOpenMessengerRoomIdNorm) set.add(routeOpenMessengerRoomIdNorm);
    return [...set].sort();
  }, [homeRoomIds, routeOpenMessengerRoomIdNorm]);

  const visiblePillarChatRoomIdsFingerprintRef = useRef<string>("");
  const [visiblePillarChatRoomIds, setVisiblePillarChatRoomIds] = useState<string[]>([]);

  const primaryListVisibleRoomIds = useMemo(() => {
    const ids = primaryListItems
      .map((row) => {
        const raw = resolveCommunityMessengerRoomIdFromChatRow(row);
        return raw ? normalizeCmRealtimeSubscribeRoomId(raw) : "";
      })
      .filter(Boolean);
    return [...new Set(ids)].sort();
  }, [primaryListItems]);

  const applyVisiblePillarChatRoomIds = useCallback(
    (ids: string[], reason: string) => {
      const fp = [...ids].sort().join("\0");
      if (fp === visiblePillarChatRoomIdsFingerprintRef.current) return;
      cmRtHs4DiagnosisLog("pillar_visible_room_fp_changed", {
        pillar,
        mainSection,
        reason,
        ...cmRtHs4FingerprintDigest(fp),
        prevFp: cmRtHs4FingerprintDigest(visiblePillarChatRoomIdsFingerprintRef.current),
        rowCount: primaryListItems.length,
      });
      visiblePillarChatRoomIdsFingerprintRef.current = fp;
      setVisiblePillarChatRoomIds(ids);
    },
    [mainSection, pillar, primaryListItems.length]
  );

  /** C: 거래=viewport IO+debounce / 배달=기존 전체 목록 — fingerprint 동일 시 setState 생략 */
  useEffect(() => {
    const pillarHasVisibleRows = pillar === "trade" || pillar === "delivery";
    if (!pillarHasVisibleRows || mainSection !== "chats") {
      setTradeVisibleRoomRealtimeReportingEnabled(false);
      if (visiblePillarChatRoomIdsFingerprintRef.current !== "") {
        visiblePillarChatRoomIdsFingerprintRef.current = "";
        setVisiblePillarChatRoomIds([]);
      }
      return;
    }

    if (pillar === "delivery") {
      setTradeVisibleRoomRealtimeReportingEnabled(false);
      applyVisiblePillarChatRoomIds(primaryListVisibleRoomIds, "delivery_list_all_rows");
      return;
    }

    const ioSupported = typeof IntersectionObserver !== "undefined";
    setTradeVisibleRoomRealtimeReportingEnabled(ioSupported);
    setTradeVisibleRoomRealtimePinnedIds(
      routeOpenMessengerRoomIdNorm ? [routeOpenMessengerRoomIdNorm] : []
    );

    const syncFromRegistry = () => {
      const ids = ioSupported
        ? getTradeVisibleRoomSubscribeIds()
        : capVisibleRoomIdsForTradeRealtime(primaryListVisibleRoomIds);
      applyVisiblePillarChatRoomIds(ids, ioSupported ? "trade_viewport_registry" : "trade_list_io_fallback");
    };

    pruneTradeVisibleRoomRegistry(primaryListVisibleRoomIds);
    syncFromRegistry();
    if (!ioSupported) {
      return () => setTradeVisibleRoomRealtimeReportingEnabled(false);
    }

    const unsubRegistry = subscribeTradeVisibleRoomRealtimeSubscribeSet(syncFromRegistry);
    return () => {
      unsubRegistry();
      setTradeVisibleRoomRealtimeReportingEnabled(false);
    };
  }, [
    applyVisiblePillarChatRoomIds,
    mainSection,
    pillar,
    primaryListVisibleRoomIds,
    routeOpenMessengerRoomIdNorm,
  ]);

  const messengerRealtimeSubscribeMergedRoomIds = useMemo(
    () =>
      pillar === "trade"
        ? mergeHomeAndTradeVisibleRealtimeRoomIds(homeRouteRealtimeRoomIds, visiblePillarChatRoomIds)
        : [...new Set([...homeRouteRealtimeRoomIds, ...visiblePillarChatRoomIds])].sort(),
    [homeRouteRealtimeRoomIds, pillar, visiblePillarChatRoomIds]
  );

  /**
   * 메시지 INSERT Realtime → `patchBootstrapRoomListForRealtimeMessageInsert`(프리뷰·최근순 정렬·낙관 unread) +
   * `use-community-messenger-realtime` 의 `notifyMessengerHomeRealtimeMessageInsert`(배지 resync·탭 숨김 톤).
   */
  useCommunityMessengerHomeRealtimeBootstrapList({
    userId: data?.me?.id,
    roomIds: homeRouteRealtimeRoomIds,
    extraRoomIds: visiblePillarChatRoomIds,
    bootstrapListLoading: listAwaitingCritical,
    homeRealtimeGateOpen,
    refresh,
    setData,
  });

  useEffect(() => {
    if (pillar !== "trade" && pillar !== "delivery") return;
    const rows = primaryListItems.map((item) => {
      const r = item.room;
      const tradeMeta = r.contextMeta?.kind === "trade" ? r.contextMeta : null;
      const deliveryMeta = r.contextMeta?.kind === "delivery" ? r.contextMeta : null;
      const resolved = resolveCommunityMessengerRoomIdFromChatRow(item);
      return {
        communityMessengerRoomId: r.id,
        resolvedMessengerRoomId: resolved ? normalizeCmRealtimeSubscribeRoomId(resolved) : "",
        rowTitle: typeof r.title === "string" ? r.title : "",
        contextKind: tradeMeta ? ("trade" as const) : deliveryMeta ? ("delivery" as const) : null,
        postId: tradeMeta?.postId ?? null,
        productChatId: tradeMeta?.productChatId ?? null,
        directKey: r.messengerDirectKey ?? null,
      };
    });
    cmRtRoomSubLog("trade_list_room_ids", { pillar, rows, rowCount: rows.length });
    const subscribedActual = messengerRealtimeGetSubscribedMessageRoomIds();
    cmRtRoomSubLog("subscribed_message_room_ids", {
      roomIds: subscribedActual,
      roomCount: subscribedActual.length,
      source: "home_diag_snapshot",
    });
    const subscribedNorm = new Set(subscribedActual.map((x) => normalizeCmRealtimeSubscribeRoomId(x)));
    const missingRows = rows.filter((row) => {
      const key =
        (row.resolvedMessengerRoomId && normalizeCmRealtimeSubscribeRoomId(row.resolvedMessengerRoomId)) ||
        normalizeCmRealtimeSubscribeRoomId(row.communityMessengerRoomId);
      return Boolean(key) && !subscribedNorm.has(key);
    });
    cmRtRoomSubLog("missing_subscription_room_ids", {
      roomIds: missingRows.map(
        (row) =>
          row.resolvedMessengerRoomId || normalizeCmRealtimeSubscribeRoomId(row.communityMessengerRoomId) || ""
      ),
      missingRowTitles: missingRows.map((row) => row.rowTitle || null),
      listRowCount: rows.length,
      tradeRowCount: rows.length,
      subscribedRoomCount: subscribedActual.length,
      subscribeMergedRoomIds: messengerRealtimeSubscribeMergedRoomIds,
    });
    if (mainSection === "chats") {
      const subscribedNormSet = new Set(subscribedActual.map((x) => normalizeCmRealtimeSubscribeRoomId(x)));
      const missingVisible = visiblePillarChatRoomIds.filter((id) =>
        !subscribedNormSet.has(normalizeCmRealtimeSubscribeRoomId(id))
      );
      cmRtStableSubLog("missing_visible_trade_room_ids", {
        pillar,
        visible_trade_room_count: visiblePillarChatRoomIds.length,
        missing_visible_trade_room_ids: missingVisible,
        subscribed_room_count: subscribedActual.length,
        subscribed_room_ids: [...subscribedActual],
      });
    }
  }, [
    pillar,
    mainSection,
    primaryListItems,
    messengerRealtimeSubscribeMergedRoomIds,
    visiblePillarChatRoomIds,
  ]);

  const listPrefetchSeedSig = useMemo(() => {
    if (mainSection !== "chats" && mainSection !== "open_chat" && mainSection !== "archive") return "";
    return primaryListItems
      .slice(0, MESSENGER_HOME_LIST_PREFETCH_SEED_COUNT)
      .map((it) => `${it.room.id}:${it.room.lastMessageAt}`)
      .join(",");
  }, [mainSection, primaryListItems]);

  useEffect(() => {
    if (!listPrefetchSeedSig) return;
    if (!data?.me?.id) return;
    const top = primaryListItems.slice(0, MESSENGER_HOME_LIST_PREFETCH_SEED_COUNT);
    for (const it of top) {
      enqueueRoomPrefetch(it.room.id, messengerRoomPrefetchPriorityScore(it.room.lastMessageAt));
    }
  }, [data?.me?.id, listPrefetchSeedSig, primaryListItems]);

  useEffect(() => {
    if (!publicGroupFindOpen || !data?.me?.id) return;
    if (openGroupSearch.trim()) return;
    if ((data.discoverableGroups?.length ?? 0) > 0) return;
    void mergeDiscoverableGroupsFromOpenGroupsClient(setData, "fill_if_empty");
  }, [publicGroupFindOpen, data?.me?.id, data?.discoverableGroups, openGroupSearch, setData]);

  const openOutgoingCallConfirm = useCallback(
    (peerUserId: string, kind: "voice" | "video") => {
      const fromFriend = sortedFriends.find((f) => f.id === peerUserId)?.label?.trim();
      const room = pickGeneralDirectRoomForPeer(data?.chats ?? [], peerUserId);
      const peerLabel = fromFriend || room?.title?.trim() || t("cm_ui_chat_peer_fallback");
      setOutgoingCallConfirm({ peerUserId, peerLabel, kind });
    },
    [sortedFriends, data?.chats, t]
  );

  const onFriendRowVoiceCallStable = useCallback(
    (userId: string) => {
      void openOutgoingCallConfirm(userId, "voice");
    },
    [openOutgoingCallConfirm]
  );
  const onFriendRowVideoCallStable = useCallback(
    (userId: string) => {
      void openOutgoingCallConfirm(userId, "video");
    },
    [openOutgoingCallConfirm]
  );
  const searchKeywordNormalized = roomSearchKeyword.trim().toLowerCase();
  const searchFriendMatches = useMemo(() => {
    if (!searchKeywordNormalized) return [];
    return [...sortedFriends]
      .filter((friend) => [friend.label, friend.subtitle ?? ""].join(" ").toLowerCase().includes(searchKeywordNormalized))
      .sort(
        (a, b) =>
          scoreKeywordMatch([b.label, b.subtitle], searchKeywordNormalized) -
          scoreKeywordMatch([a.label, a.subtitle], searchKeywordNormalized)
      )
      .slice(0, 8);
  }, [searchKeywordNormalized, sortedFriends]);
  const searchRoomMatches = useMemo(() => {
    if (!searchKeywordNormalized) return [];
    return [...searchSheetRoomItems]
      .sort(
        (a, b) =>
          scoreKeywordMatch([b.room.title, b.room.subtitle, b.room.summary, b.preview], searchKeywordNormalized) -
          scoreKeywordMatch([a.room.title, a.room.subtitle, a.room.summary, a.preview], searchKeywordNormalized)
      )
      .slice(0, 8);
  }, [searchKeywordNormalized, searchSheetRoomItems]);
  const searchMessageMatches = useMemo(() => {
    if (!searchKeywordNormalized) return [];
    return [...searchSheetRoomItems]
      .filter((item) => item.preview.toLowerCase().includes(searchKeywordNormalized))
      .sort(
        (a, b) =>
          scoreKeywordMatch([b.preview, b.room.title], searchKeywordNormalized) -
          scoreKeywordMatch([a.preview, a.room.title], searchKeywordNormalized)
      )
      .slice(0, 8);
  }, [searchKeywordNormalized, searchSheetRoomItems]);
  const searchOpenChatMatches = useMemo(() => {
    if (!searchKeywordNormalized) return [];
    return [...filteredDiscoverableGroups]
      .filter((group) => [group.title, group.summary, group.ownerLabel].join(" ").toLowerCase().includes(searchKeywordNormalized))
      .sort(
        (a, b) =>
          scoreKeywordMatch([b.title, b.ownerLabel, b.summary], searchKeywordNormalized) -
          scoreKeywordMatch([a.title, a.ownerLabel, a.summary], searchKeywordNormalized)
      )
      .slice(0, 8);
  }, [filteredDiscoverableGroups, searchKeywordNormalized]);
  const favoriteManageFriends = useMemo(() => {
    const seen = new Set<string>();
    return [...(data?.friends ?? []), ...(data?.hidden ?? [])].filter((friend) => {
      if (!friend.isFavoriteFriend || seen.has(friend.id)) return false;
      seen.add(friend.id);
      return true;
    });
  }, [data?.friends, data?.hidden]);
  const commitRecentSearch = useCallback((value: string) => {
    const keyword = value.trim();
    if (!keyword) return;
    setRecentSearches((prev) => [keyword, ...prev.filter((item) => item !== keyword)].slice(0, 8));
  }, []);
  const removeRecentSearch = useCallback((value: string) => {
    const keyword = value.trim();
    if (!keyword) return;
    setRecentSearches((prev) => prev.filter((item) => item !== keyword));
  }, []);
  const dismissNotification = useCallback((id: string) => {
    setDismissedNotificationIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      writeDismissedCommunityMessengerNotificationIds(next);
      return next;
    });
  }, []);
  const resolvePeerProfileForRoom = useCallback(
    (peerId: string | null | undefined) => {
      if (!peerId?.trim() || !data) return null;
      const id = peerId.trim();
      const pool = [...(data.friends ?? []), ...(data.hidden ?? [])];
      return pool.find((p) => p.id === id) ?? null;
    },
    [data]
  );
  const groupInviteFriendIdSet = useMemo(() => {
    const ids = new Set<string>();
    for (const friend of data?.friends ?? []) ids.add(friend.id);
    for (const friend of data?.hidden ?? []) ids.add(friend.id);
    return ids;
  }, [data?.friends, data?.hidden]);
  const groupSelectableFriends = useMemo(() => {
    const visible = sortedFriends;
    const hiddenSelected = groupMembers
      .map((id) => (data?.hidden ?? []).find((friend) => friend.id === id))
      .filter((friend): friend is CommunityMessengerProfileLite => Boolean(friend));
    const seen = new Set<string>();
    return [...visible, ...hiddenSelected].filter((friend) => {
      if (seen.has(friend.id)) return false;
      seen.add(friend.id);
      return true;
    });
  }, [data?.hidden, groupMembers, sortedFriends]);
  const groupInviteSearchNormalized = groupInviteSearchQuery.trim().toLowerCase();
  const filteredGroupSelectableFriends = useMemo(() => {
    if (!groupInviteSearchNormalized) return groupSelectableFriends;
    return groupSelectableFriends.filter((friend) =>
      [friend.label, friend.subtitle ?? ""].join(" ").toLowerCase().includes(groupInviteSearchNormalized)
    );
  }, [groupInviteSearchNormalized, groupSelectableFriends]);
  const groupInviteNonFriendResults = useMemo(() => {
    if (!groupInviteSearchQuery.trim()) return [];
    return groupInviteSearchResults.filter((user) => !groupInviteFriendIdSet.has(user.id));
  }, [groupInviteFriendIdSet, groupInviteSearchQuery, groupInviteSearchResults]);
  const selectedGroupMemberProfiles = useMemo(() => {
    const friendMap = new Map(
      [...(data?.friends ?? []), ...(data?.hidden ?? [])].map((friend) => [friend.id, friend] as const)
    );
    const searchMap = new Map(groupInviteSearchResults.map((user) => [user.id, user] as const));
    return groupMembers
      .map((id) => {
        const known = groupSelectedProfiles[id] ?? friendMap.get(id) ?? searchMap.get(id);
        if (known) return known;
        return {
          id,
          label: t("cm_svc_member_fallback", { id: id.slice(0, 8) }),
          avatarUrl: null,
          following: false,
          blocked: false,
          isFriend: false,
          isFavoriteFriend: false,
        } satisfies CommunityMessengerProfileLite;
      });
  }, [data?.friends, data?.hidden, groupInviteSearchResults, groupMembers, groupSelectedProfiles, t]);
  const groupTitlePreview = useMemo(() => {
    const explicitTitle = groupTitle.trim();
    if (explicitTitle) return explicitTitle;
    if (selectedGroupMemberProfiles.length === 0) return "";
    const labels = selectedGroupMemberProfiles.map((member) => member.label).filter(Boolean).slice(0, 3);
    if (groupMembers.length > labels.length) {
      return t("cm_ui_group_members_and_others", {
        names: labels.join(", "),
        count: groupMembers.length - labels.length,
      });
    }
    return labels.join(", ");
  }, [groupMembers.length, groupTitle, selectedGroupMemberProfiles, t]);
  const showGroupInviteSearchEmpty = Boolean(
    groupInviteSearchQuery.trim() &&
      !groupInviteSearchBusy &&
      !groupInviteSearchFailed &&
      !groupInviteSearchResults.length
  );
  const togglePrivateGroupMember = useCallback((user: CommunityMessengerProfileLite, checked: boolean) => {
    setGroupMembers((prev) =>
      checked ? (prev.includes(user.id) ? prev : [...prev, user.id]) : prev.filter((id) => id !== user.id)
    );
    setGroupSelectedProfiles((prev) => {
      if (!checked) {
        if (!prev[user.id]) return prev;
        const next = { ...prev };
        delete next[user.id];
        return next;
      }
      return { ...prev, [user.id]: user };
    });
  }, []);
  const clearPrivateGroupSelection = useCallback(() => {
    setGroupMembers([]);
    setGroupSelectedProfiles({});
  }, []);

  const notificationCenterItemsAll = useMemo<MessengerNotificationCenterItem[]>(() => {
    const pending = (data?.requests ?? []).filter((request) => request.status === "pending");
    const requestItems: MessengerNotificationCenterItem[] = pending
      .filter((request) => request.direction === "incoming" || request.direction === "outgoing")
      .map((request) => ({
        id: `request:${request.id}`,
        kind: "request" as const,
        createdAt: request.createdAt,
        request,
      }));
    const missedCallItems: MessengerNotificationCenterItem[] = sortedCalls
      .filter((call) => call.status === "missed")
      .map((call) => ({
        id: `missed:${call.id}`,
        kind: "missed_call",
        createdAt: call.startedAt,
        call,
      }));
    const groupInviteItems: MessengerNotificationCenterItem[] = groupInviteNotifications.map((invite) => ({
      id: `group_invite:${invite.id}`,
      kind: "group_invite" as const,
      createdAt: invite.createdAt,
      invite,
    }));
    const importantRoomItems: MessengerNotificationCenterItem[] = baseChatListItems
      .filter((item) => {
        const r = item.room;
        if (r.unreadCount < 1) return false;
        if (communityMessengerRoomIsInboxHidden(r)) return false;
        return Boolean(r.isPinned) || communityMessengerRoomIsTrade(r) || communityMessengerRoomIsDelivery(r);
      })
      .sort((a, b) => new Date(b.lastEventAt).getTime() - new Date(a.lastEventAt).getTime())
      .slice(0, 6)
      .map((item) => ({
        id: `important:${item.room.id}`,
        kind: "important_room" as const,
        createdAt: item.lastEventAt,
        room: item.room,
        preview: item.preview,
        highlightReason: resolveImportantRoomHighlightReason(item.room),
      }));
    return [...requestItems, ...groupInviteItems, ...missedCallItems, ...importantRoomItems].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [baseChatListItems, data?.requests, groupInviteNotifications, sortedCalls]);
  const notificationCenterItems = useMemo(
    () => notificationCenterItemsAll.filter((item) => !dismissedNotificationIds.includes(item.id)),
    [dismissedNotificationIds, notificationCenterItemsAll]
  );
  const notificationCenterSummary = useMemo(
    () => ({
      requestCount: notificationCenterItems.filter((item) => item.kind === "request").length,
      groupInviteCount: notificationCenterItems.filter((item) => item.kind === "group_invite").length,
      missedCallCount: notificationCenterItems.filter((item) => item.kind === "missed_call").length,
      importantCount: notificationCenterItems.filter((item) => item.kind === "important_room").length,
    }),
    [notificationCenterItems]
  );
  const onOpenFriendManagerStable = useCallback(() => {
    setFriendManagerOpen(true);
  }, []);
  const headerActionsNode = useMemo(
    () => (
      <div className={`${samTier1HeaderRightColumn} max-w-[min(100vw-96px,300px)]`}>
        <CommunityMessengerHeaderActions
          messengerAlertSummary={notificationCenterSummary}
          onOpenFriendAdd={onOpenFriendManagerStable}
          onOpenSearch={() => openHomeOverlay("search")}
          onOpenNotificationCenter={() => openHomeOverlay("requests")}
          onOpenSettings={() => openHomeOverlay("settings")}
        />
      </div>
    ),
    [notificationCenterSummary, onOpenFriendManagerStable, openHomeOverlay]
  );
  const updateRoomSummaryState = useCallback(
    (roomId: string, updater: (room: CommunityMessengerRoomSummary) => CommunityMessengerRoomSummary) => {
      commitHomeListPatch(setData, { kind: "room_update", roomId, updater }, "bootstrap");
    },
    [setData]
  );
  const removeRoomFromBootstrapState = useCallback(
    (roomId: string) => {
      commitHomeListPatch(setData, { kind: "remove_room", roomId }, "bootstrap");
    },
    [setData]
  );
  const updateRoomParticipantState = useCallback(
    async (roomId: string, patch: { isPinned?: boolean; isMuted?: boolean }) => {
      const actionKey = `room-settings:${roomId}`;
      setBusyId(actionKey);
      setActionError(null);
      try {
        const res = await fetch(communityMessengerRoomResourcePath(roomId), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "participant_settings", ...patch }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          setActionError(getMessengerActionErrorMessage(json.error ?? "room_settings_update_failed"));
          return;
        }
        updateRoomSummaryState(roomId, (room) => ({
          ...room,
          ...(typeof patch.isPinned === "boolean" ? { isPinned: patch.isPinned } : null),
          ...(typeof patch.isMuted === "boolean" ? { isMuted: patch.isMuted } : null),
        }));
      } finally {
        setBusyId(null);
      }
    },
    [getMessengerActionErrorMessage, updateRoomSummaryState]
  );
  const markRoomRead = useCallback(
    async (roomId: string) => {
      const actionKey = `room-read:${roomId}`;
      setBusyId(actionKey);
      setActionError(null);
      const summary = findHomeListRoomRow(data, roomId);
      const viewerUserId = data?.me?.id?.trim() ?? "";
      if (!viewerUserId) {
        setBusyId(null);
        return;
      }
      const preUnread = Math.max(0, Math.floor(Number(summary?.unreadCount) || 0));
      const tradeMeta = summary?.contextMeta?.kind === "trade" ? summary.contextMeta : null;
      const tradePostId = tradeMeta?.postId?.trim() ?? null;
      const tradeProductChatId = summary?.contextMeta?.productChatId?.trim() ?? null;

      setLocalReadGuard({
        roomId,
        referenceLastMessageAt: String(summary?.lastMessageAt ?? ""),
        source: "manual",
      });

      const alignMs = applyCmHomeOptimisticMarkRead({
        roomId,
        viewerUserId,
        beforeUnread: preUnread,
        reason: "home_mark_read",
        postId: tradePostId,
        productChatId: tradeProductChatId,
      });
      updateRoomSummaryState(roomId, (room) => ({ ...room, unreadCount: 0 }));
      if (typeof performance !== "undefined") {
        messengerMonitorUnreadListSync(roomId, alignMs, "mark_read");
      }

      cmReadBadgeLog("mark_read_patch_start", { roomId, flushOpen: true, path: "home_mark_read" });
      try {
        const res = await fetch(communityMessengerRoomResourcePath(roomId), {
          ...communityMessengerMarkReadFetchInitBase,
          body: JSON.stringify(buildCommunityMessengerMarkReadPatchBody()),
        });
        const parsed = await parseCommunityMessengerMarkReadResponse(res);
        const json = parsed.json;
        if (!parsed.okHttp || json.ok !== true) {
          cmReadBadgeLog("mark_read_patch_fail", {
            roomId,
            path: "home_mark_read",
            status: parsed.status,
            networkError: false,
            okHttp: parsed.okHttp,
            jsonOk: json.ok,
            apiError: json.error ?? null,
            responseBody: parsed.rawPreview,
          });
          rollbackCmHomeOptimisticMarkRead({
            roomId,
            viewerUserId,
            restoreUnread: preUnread,
            reason: "patch_fail",
            postId: tradePostId,
          });
          if (preUnread > 0) {
            updateRoomSummaryState(roomId, (room) => ({ ...room, unreadCount: preUnread }));
          }
          setActionError(getMessengerActionErrorMessage(json.error ?? "room_read_failed"));
          return;
        }
        refreshLocalReadGuardServerAck(roomId);
        cmReadBadgeLog("mark_read_patch_done", { roomId, path: "home_mark_read" });
        applyCmReadUiBadgeZero({
          roomId,
          viewerUserId,
          phase: "patch_done",
          reason: "home_mark_read",
          beforeUnread: preUnread,
          postId: tradePostId,
          productChatId: tradeProductChatId,
        });
        queueMicrotask(() => requestMessengerHubBadgeResync("room_open_mark_read", { roomId }));
      } catch (err) {
        cmReadBadgeLog("mark_read_patch_fail", {
          roomId,
          path: "home_mark_read",
          networkError: true,
          error: err instanceof Error ? err.message : String(err),
        });
        rollbackCmHomeOptimisticMarkRead({
          roomId,
          viewerUserId,
          restoreUnread: preUnread,
          reason: "patch_network_fail",
          postId: tradePostId,
        });
        if (preUnread > 0) {
          updateRoomSummaryState(roomId, (room) => ({ ...room, unreadCount: preUnread }));
        }
        setActionError(getMessengerActionErrorMessage("room_read_failed"));
      } finally {
        setBusyId(null);
      }
    },
    [data, getMessengerActionErrorMessage, updateRoomSummaryState]
  );
  const toggleRoomArchive = useCallback(
    async (roomId: string, archived: boolean) => {
      const actionKey = `room-archive:${roomId}`;
      setBusyId(actionKey);
      setActionError(null);
      try {
        const res = await fetch(communityMessengerRoomResourcePath(roomId), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "archive", archived }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          setActionError(getMessengerActionErrorMessage(json.error ?? "room_archive_update_failed"));
          return;
        }
        updateRoomSummaryState(roomId, (room) => ({
          ...room,
          isArchivedByViewer: archived,
        }));
      } finally {
        setBusyId(null);
      }
    },
    [getMessengerActionErrorMessage, updateRoomSummaryState]
  );

  const handleMessengerHomeMarkRoomRead = useCallback((room: CommunityMessengerRoomSummary) => {
    void markRoomRead(room.id);
  }, [markRoomRead]);

  const handleMessengerHomeToggleRoomArchive = useCallback((room: CommunityMessengerRoomSummary) => {
    void toggleRoomArchive(room.id, !communityMessengerRoomIsInboxHidden(room));
  }, [toggleRoomArchive]);

  const handleMessengerHomeTogglePin = useCallback((room: CommunityMessengerRoomSummary) => {
    void updateRoomParticipantState(room.id, { isPinned: !room.isPinned });
  }, [updateRoomParticipantState]);

  const handleMessengerHomeToggleMute = useCallback((room: CommunityMessengerRoomSummary) => {
    void updateRoomParticipantState(room.id, { isMuted: !room.isMuted });
  }, [updateRoomParticipantState]);

  const getFriendDirectRoomMutedStable = useCallback(
    (userId: string) => directRoomByPeerId.get(userId)?.isMuted,
    [directRoomByPeerId]
  );

  const getFriendDirectRoomKindStable = useCallback((_userId: string) => null, []);

  const friendNotificationsBusyStable = useCallback(
    (userId: string) =>
      Boolean(directRoomByPeerId.get(userId)) &&
      busyId === `room-settings:${directRoomByPeerId.get(userId)?.id ?? ""}`,
    [directRoomByPeerId, busyId]
  );

  const onFriendToggleRoomMuteStable = useCallback(
    (userId: string) => {
      const room = directRoomByPeerId.get(userId);
      if (room) void updateRoomParticipantState(room.id, { isMuted: !room.isMuted });
    },
    [directRoomByPeerId, updateRoomParticipantState]
  );

  const friendHasDirectRoomStable = useCallback((userId: string) => Boolean(directRoomByPeerId.get(userId)), [directRoomByPeerId]);

  const onOpenFriendsPrivacySummaryStable = useCallback(() => {
    resetMessengerTransientUi();
    openHomeOverlay("friends-privacy");
  }, [openHomeOverlay, resetMessengerTransientUi]);

  const onOpenProfileForMessengerMainStable = useCallback(
    (profile: CommunityMessengerProfileLite) => {
      resetMessengerTransientUi();
      setFriendSheet({ mode: "profile", profile });
    },
    [resetMessengerTransientUi]
  );

  const onCreateGroupStable = useCallback(() => {
    resetMessengerTransientUi();
    setGroupCreateStep("private_group");
  }, [resetMessengerTransientUi]);

  const onCreateOpenGroupStable = useCallback(() => {
    resetMessengerTransientUi();
    setGroupCreateStep("open_group");
  }, [resetMessengerTransientUi]);

  const notificationRoomMuteToggle = useCallback(
    async (room: CommunityMessengerRoomSummary) => {
      await updateRoomParticipantState(room.id, { isMuted: !Boolean(room.isMuted) });
    },
    [updateRoomParticipantState]
  );
  const notificationArchiveRoom = useCallback(
    async (room: CommunityMessengerRoomSummary) => {
      await toggleRoomArchive(room.id, true);
    },
    [toggleRoomArchive]
  );
  const updateNotificationSetting = useCallback(
    async (key: keyof MessengerNotificationSettings, value: boolean) => {
      const actionKey = `notification-setting:${key}`;
      setBusyId(actionKey);
      try {
        const res = await fetch("/api/me/notification-settings", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [key]: value }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
        if (!res.ok || !json.ok) return;
        invalidateMeNotificationSettingsGetFlight();
        setNotificationSettings((prev) => ({ ...prev, [key]: value }));
      } finally {
        setBusyId(null);
      }
    },
    []
  );
  const updateLocalSetting = useCallback((key: keyof CommunityMessengerLocalSettings, value: boolean) => {
    setLocalSettings((prev) => {
      const next = writeCommunityMessengerLocalSettings({ ...prev, [key]: value });
      return next;
    });
  }, []);
  const exportSettingsBackup = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const backup: CommunityMessengerSettingsBackup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        notificationSettings,
        incomingCallSoundEnabled,
        incomingCallBannerEnabled,
        localSettings,
        recentSearches: recentSearches.slice(0, 8),
        devices: readPreferredCommunityMessengerDeviceIds(),
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `samarket-messenger-settings-${backup.exportedAt.slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setActionError(t("cm_ui_settings_backup_export_failed"));
    }
  }, [incomingCallBannerEnabled, incomingCallSoundEnabled, localSettings, notificationSettings, recentSearches, t]);
  const importSettingsBackup = useCallback(
    async (backup: CommunityMessengerSettingsBackup) => {
      const importedLocalSettings = writeCommunityMessengerLocalSettings(backup.localSettings ?? {});
      setLocalSettings(importedLocalSettings);
      setRecentSearches(
        Array.isArray(backup.recentSearches)
          ? backup.recentSearches
              .map((item) => (typeof item === "string" ? item.trim() : ""))
              .filter(Boolean)
              .slice(0, 8)
          : []
      );
      setIncomingCallSoundEnabled(Boolean(backup.incomingCallSoundEnabled));
      setCommunityMessengerIncomingCallSoundEnabled(Boolean(backup.incomingCallSoundEnabled));
      setIncomingCallBannerEnabled(Boolean(backup.incomingCallBannerEnabled));
      setCommunityMessengerIncomingCallBannerEnabled(Boolean(backup.incomingCallBannerEnabled));
      writePreferredCommunityMessengerDeviceIds(
        backup.devices?.audioDeviceId ?? null,
        backup.devices?.videoDeviceId ?? null
      );
      const nextNotifications = backup.notificationSettings ?? {};
      for (const key of Object.keys(notificationSettings) as (keyof MessengerNotificationSettings)[]) {
        if (typeof nextNotifications[key] !== "boolean") continue;
        if (notificationSettings[key] === nextNotifications[key]) continue;
        await updateNotificationSetting(key, nextNotifications[key]);
      }
    },
    [notificationSettings, updateNotificationSetting]
  );
  const onBackupFileSelected = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as Partial<CommunityMessengerSettingsBackup>;
        if (parsed.version !== 1 || !parsed.localSettings || !parsed.notificationSettings) {
          setActionError(t("cm_ui_invalid_backup_format"));
          return;
        }
        await importSettingsBackup(parsed as CommunityMessengerSettingsBackup);
      } catch {
        setActionError(t("cm_ui_failed_to_load_backup"));
      }
    },
    [importSettingsBackup, t]
  );
  const removeFriend = useCallback(
    async (friendUserId: string, options?: { confirm?: boolean }) => {
      const shouldConfirm = options?.confirm !== false;
      if (shouldConfirm && !window.confirm(t("cm_ui_confirm_remove_friend_keep_chat"))) {
        return;
      }
      setBusyId(`remove-friend:${friendUserId}`);
      try {
        const res = await fetch(`/api/community-messenger/friends/${encodeURIComponent(friendUserId)}`, {
          method: "DELETE",
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (res.ok && json.ok) {
          setData((prev) => {
            if (!prev) return prev;
            const nextFriends = prev.friends.filter((friend) => friend.id !== friendUserId);
            const nextHidden = prev.hidden.filter((friend) => friend.id !== friendUserId);
            return {
              ...prev,
              tabs: { ...prev.tabs, friends: nextFriends.length },
              friends: nextFriends,
              hidden: nextHidden,
            };
          });
          setSearchResults((prev) =>
            prev.map((user) =>
              user.id === friendUserId ? { ...user, isFriend: false, isFavoriteFriend: false, isHiddenFriend: false } : user
            )
          );
          setFriendSheet((prev) => (prev?.profile.id === friendUserId ? null : prev));
          return;
        }
        setActionError(getMessengerActionErrorMessage(json.error ?? "friend_remove_failed"));
      } finally {
        setBusyId(null);
      }
    },
    [getMessengerActionErrorMessage, setData, t]
  );

  const reportCommunityUser = useCallback(async (userId: string) => {
    const detail = window.prompt(t("cm_ui_prompt_report_detail"))?.trim() ?? "";
    if (!detail) return;
    setBusyId(`report:${userId}`);
    try {
      const res = await fetch("/api/community-messenger/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportType: "user",
          reportedUserId: userId,
          reasonType: "etc",
          reasonDetail: detail,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (res.ok && json.ok) {
        showMessengerSnackbar(t("cm_ui_report_received"), { variant: "success" });
        setFriendSheet(null);
      } else {
        setActionError(t("cm_ui_report_failed"));
      }
    } finally {
      setBusyId(null);
    }
  }, [t]);

  const reportCommunityRoom = useCallback(async (roomId: string) => {
    const detail = window.prompt(t("cm_ui_prompt_report_detail"))?.trim() ?? "";
    if (!detail) return;
    setBusyId(`report-room:${roomId}`);
    try {
      const res = await fetch("/api/community-messenger/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportType: "room",
          roomId,
          reasonType: "etc",
          reasonDetail: detail,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (res.ok && json.ok) {
        showMessengerSnackbar(t("cm_ui_report_received"), { variant: "success" });
        setRoomActionSheet(null);
      } else {
        setActionError(t("cm_ui_report_failed"));
      }
    } finally {
      setBusyId(null);
    }
  }, [t]);

  const leaveMessengerRoom = useCallback(
    async (room: CommunityMessengerRoomSummary) => {
      const policy = toMessengerPolicyRoomType({
        roomType: room.roomType,
        contextMeta: room.contextMeta ?? null,
      });
      if (!window.confirm(getSwipeLeaveConfirmMessage(policy))) return;
      const roomId = room.id;
      setBusyId(`room-leave:${roomId}`);
      setActionError(null);
      removeRoomFromBootstrapState(roomId);
      try {
        const res = await fetch(`${communityMessengerRoomResourcePath(roomId)}/leave`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quiet: false }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (res.ok && json.ok) {
          setRoomActionSheet(null);
        } else {
          setActionError(getMessengerActionErrorMessage(json.error ?? "leave_failed"));
          void refresh(true);
        }
      } finally {
        setBusyId(null);
      }
    },
    [getMessengerActionErrorMessage, refresh, removeRoomFromBootstrapState]
  );

  const clearLocalRoomPreview = useCallback((roomId: string) => {
    invalidateRoomSnapshot(roomId);
    setRoomActionSheet(null);
    showMessengerSnackbar(t("cm_ui_cleared_local_preview_cache"));
  }, [t]);

  const onListPaneToggleFavoriteFriend = useCallback(
    (userId: string) => {
      void toggleFavoriteFriend(userId);
    },
    [toggleFavoriteFriend]
  );
  const onListPaneToggleHiddenFriend = useCallback(
    (userId: string) => {
      void toggleHiddenFriend(userId);
    },
    [toggleHiddenFriend]
  );
  const onListPaneRemoveFriend = useCallback(
    (userId: string) => {
      void removeFriend(userId);
    },
    [removeFriend]
  );
  const onListPaneToggleBlock = useCallback(
    (userId: string) => {
      void toggleBlock(userId, { blockSource: "friend_list" });
    },
    [toggleBlock]
  );
  const onListPaneStartDirectRoom = useCallback(
    (userId: string) => {
      void startDirectRoom(userId);
    },
    [startDirectRoom]
  );
  const onMessengerHomeRetryStable = useCallback(() => {
    void refresh();
  }, [refresh]);
  const messengerHomeBootstrapCalls = useMemo(() => data?.calls ?? [], [data?.calls]);
  const onBootstrapCallsChange = useCallback(
    (calls: CommunityMessengerCallLog[]) => {
      setData((prev) => {
        if (!prev) return prev;
        return prev.calls === calls ? prev : { ...prev, calls };
      });
    },
    [setData]
  );

  return (
    <div
      data-messenger-shell
      data-cm-messenger-home-root
      className={
        fromPhilifeHeaderStack
          ? "min-h-0 space-y-2 bg-[color:var(--messenger-bg)] px-0 pt-0 pb-[calc(7rem+env(safe-area-inset-bottom,0px))] text-[color:var(--messenger-text)]"
          : "min-h-0 space-y-2 bg-[color:var(--messenger-bg)] px-0 py-2 pb-[calc(7rem+env(safe-area-inset-bottom,0px))] text-[color:var(--messenger-text)]"
      }
    >
      <CommunityMessengerHomeReturnConsume />
      <CommunityMessengerHomeRouterEffectsHost
        onEntryOriginQueryChange={onEntryOriginQueryChange}
        openHomeOverlay={openHomeOverlay}
        setMainSection={setMainSection}
        setMainTier1Extras={setMainTier1Extras}
        headerActionsNode={headerActionsNode}
        roomActionSheetOpen={Boolean(roomActionSheet)}
        setRoomActionSheet={closeRoomActionSheet}
        setOpenedMenuItemId={setOpenedMenuItemId}
        setIncomingCallSoundEnabled={setIncomingCallSoundEnabled}
        setIncomingCallBannerEnabled={setIncomingCallBannerEnabled}
        setLocalSettings={setLocalSettings}
        setRecentSearches={setRecentSearches}
        recentSearches={recentSearches}
        setDismissedNotificationIds={setDismissedNotificationIds}
        openSettingsSheet={() => openHomeOverlay("settings")}
        setChatInboxFilter={setChatInboxFilter}
        setChatKindFilter={setChatKindFilter}
        setNotificationSettings={setNotificationSettings}
        data={data}
        fromPhilifeHeaderStack={fromPhilifeHeaderStack}
        mainSection={mainSection}
        pillar={pillar}
      />
      {fromPhilifeHeaderStack ? (
        <header className="sticky top-0 z-30 w-full min-w-0 max-w-full shrink-0 border-b border-sam-border/80 bg-[color:var(--messenger-bg,#ffffff)]/95 backdrop-blur-[10px] text-[color:var(--messenger-fg,#0f0f0f)]">
          <div
            className={`flex h-12 min-w-0 items-center gap-2 overflow-hidden text-[color:var(--messenger-fg,#0f0f0f)] ${APP_MAIN_HEADER_INNER_CLASS}`}
          >
            <div className="flex w-10 min-w-10 shrink-0 justify-start">
              <AppBackButton onBack={closePhilifeHeaderMessenger} ariaLabel={t("nav_back")} />
            </div>
            <div className="min-w-0 flex-1 overflow-hidden px-1 text-center">
              <h1 className="flex min-w-0 w-full items-center justify-center overflow-hidden text-[color:var(--messenger-fg,#0f0f0f)]">
                <span className="truncate sam-text-section-title font-semibold">{t("nav_bottom_messenger")}</span>
              </h1>
            </div>
            <div className="flex min-w-0 max-w-[min(200px,50vw)] shrink-0 items-center justify-end pr-0.5">
              {headerActionsNode}
            </div>
          </div>
        </header>
      ) : null}
      <CommunityMessengerHomeListPane
        loading={loading}
        listPlaceholder={listAwaitingCritical}
        authRequired={authRequired}
        data={data}
        actionError={actionError}
        mainSection={mainSection}
        onPrimarySectionChange={onPrimarySectionChange}
        openedSwipeItemId={openedSwipeItemId}
        openedMenuItemId={openedMenuItemId}
        friendQuickMenuBlocksTabSwipeRef={friendQuickMenuBlocksTabSwipeRef}
        messengerOverlayGeneration={messengerOverlayGeneration}
        selectedArchiveSection={selectedArchiveSection}
        isScrolling={isScrolling}
        resetMessengerTransientUi={resetMessengerTransientUi}
        notifyMessengerListScroll={notifyMessengerListScroll}
        openMessengerMenuItem={openMessengerMenuItem}
        closeMessengerMenuItem={closeMessengerMenuItem}
        setOpenedSwipeItemId={setOpenedSwipeItemId}
        setSelectedArchiveSection={setSelectedArchiveSection}
        sortedFriends={sortedFriends}
        friendSortEpochMs={friendSortEpochMs}
        friendStateModel={friendStateModel}
        busyId={busyId}
        onOpenFriendsPrivacySummary={onOpenFriendsPrivacySummaryStable}
        onOpenProfile={onOpenProfileForMessengerMainStable}
        toggleFavoriteFriend={onListPaneToggleFavoriteFriend}
        toggleHiddenFriend={onListPaneToggleHiddenFriend}
        removeFriend={onListPaneRemoveFriend}
        toggleBlock={onListPaneToggleBlock}
        startDirectRoom={onListPaneStartDirectRoom}
        onFriendRowVoiceCallStable={onFriendRowVoiceCallStable}
        onFriendRowVideoCallStable={onFriendRowVideoCallStable}
        getFriendDirectRoomMutedStable={getFriendDirectRoomMutedStable}
        getFriendDirectRoomKindStable={getFriendDirectRoomKindStable}
        friendNotificationsBusyStable={friendNotificationsBusyStable}
        onFriendToggleRoomMuteStable={onFriendToggleRoomMuteStable}
        friendHasDirectRoomStable={friendHasDirectRoomStable}
        primaryListItems={primaryListItems}
        favoriteFriendIds={favoriteFriendIds}
        savedFriendIds={savedFriendIds}
        handleMessengerHomeTogglePin={handleMessengerHomeTogglePin}
        handleMessengerHomeToggleMute={handleMessengerHomeToggleMute}
        handleMessengerHomeMarkRoomRead={handleMessengerHomeMarkRoomRead}
        handleMessengerHomeToggleRoomArchive={handleMessengerHomeToggleRoomArchive}
        handleMessengerHomeLeaveRoom={leaveMessengerRoom}
        openRoomActions={openRoomActions}
        chatInboxFilter={chatInboxFilter}
        chatKindFilter={chatKindFilter}
        onChatListChipChange={onChatListChipChange}
        openChatJoinedItems={openChatJoinedItems}
        onCreateGroupStable={onCreateGroupStable}
        onCreateOpenGroupStable={onCreateOpenGroupStable}
        incomingRequestCount={incomingRequestCount}
        receivedFriendRequestCount={receivedFriendRequestCount}
        pageError={pageError}
        loginRequiredText={t("nav_messenger_login_required")}
        retryText={t("common_try_again_later")}
        onRetry={onMessengerHomeRetryStable}
        entryOriginQuery={entryOriginQuery}
        bootstrapCalls={messengerHomeBootstrapCalls}
        callsHydrating={Boolean(data?.deferredCallLog)}
        onStartDirectCall={startDirectCall}
        onBootstrapCallsChange={onBootstrapCallsChange}
        chatListVisual={pillar === "trade" ? "trade" : pillar === "delivery" ? "delivery" : "default"}
        showSectionTabs={!listAwaitingCritical && !authRequired && !fromPhilifeHeaderStack && pillar == null}
      />

      {outgoingCallConfirm ? (
        <MessengerOutgoingCallConfirmDialog
          open
          peerLabel={outgoingCallConfirm.peerLabel}
          kind={outgoingCallConfirm.kind}
          onCancel={() => setOutgoingCallConfirm(null)}
          onConfirm={() => {
            const next = outgoingCallConfirm;
            if (!next) return;
            if (startDirectCall(next.peerUserId, next.kind, next.peerLabel)) setOutgoingCallConfirm(null);
          }}
        />
      ) : null}

      {friendSheet?.mode === "profile" && friendProfileForSheet ? (
        <MessengerFriendProfileSheet
          key={friendProfileForSheet.id}
          profile={friendProfileForSheet}
          busyId={busyId}
          onClose={() => setFriendSheet(null)}
          onVoiceCall={() => {
            const id = friendProfileForSheet.id;
            setFriendSheet(null);
            void openOutgoingCallConfirm(id, "voice");
          }}
          onVideoCall={() => {
            const id = friendProfileForSheet.id;
            setFriendSheet(null);
            void openOutgoingCallConfirm(id, "video");
          }}
          onChat={() => {
            const id = friendProfileForSheet.id;
            setFriendSheet(null);
            void startDirectRoom(id);
          }}
          onToggleFavorite={() => {
            void toggleFavoriteFriend(friendProfileForSheet.id);
          }}
          onToggleHidden={
            friendProfileForSheet.isFriend && friendProfileForSheet.id !== data?.me?.id
              ? () => void toggleHiddenFriend(friendProfileForSheet.id)
              : undefined
          }
          onInviteToGroup={
            friendProfileForSheet.isFriend
              ? () => {
                  const id = friendProfileForSheet.id;
                  setFriendSheet(null);
                  setGroupMembers((prev) => (prev.includes(id) ? prev : [id, ...prev]));
                  setGroupCreateStep("private_group");
                }
              : undefined
          }
          directRoomMuted={directRoomByPeerId.get(friendProfileForSheet.id)?.isMuted}
          notificationsBusy={
            Boolean(friendProfileForSheet.isFriend && directRoomByPeerId.get(friendProfileForSheet.id)) &&
            busyId === `room-settings:${directRoomByPeerId.get(friendProfileForSheet.id)?.id ?? ""}`
          }
          onToggleMuteNotifications={
            friendProfileForSheet.isFriend && directRoomByPeerId.get(friendProfileForSheet.id)
              ? () => {
                  const room = directRoomByPeerId.get(friendProfileForSheet.id);
                  if (room) void updateRoomParticipantState(room.id, { isMuted: !room.isMuted });
                }
              : undefined
          }
          onRemoveFriend={friendProfileForSheet.isFriend ? () => void removeFriend(friendProfileForSheet.id) : undefined}
          onBlock={friendProfileForSheet.id !== data?.me?.id ? () => void toggleBlock(friendProfileForSheet.id) : undefined}
          onReport={friendProfileForSheet.id !== data?.me?.id ? () => void reportCommunityUser(friendProfileForSheet.id) : undefined}
          friendAddCta={data?.me?.id ? friendAddCtaForSheet : undefined}
          onFriendAdd={
            friendSheet.allowFriendRequest !== false && data?.me?.id
              ? () => void addFriendSaved(friendProfileForSheet.id)
              : undefined
          }
        />
      ) : null}

      {roomActionSheet && data ? (
        <MessengerChatRoomActionSheet
          item={roomActionSheet.item}
          listContext={roomActionSheet.listContext}
          anchorRect={roomActionSheet.anchorRect}
          busyId={busyId}
          onClose={() => {
            setRoomActionSheet(null);
            setOpenedMenuItemId((current) => (current?.startsWith("room:menu:") ? null : current));
          }}
          onEnterRoom={() => {
            const id = roomActionSheet.item.room.id;
            setRoomActionSheet(null);
            setOpenedMenuItemId((current) => (current?.startsWith("room:menu:") ? null : current));
            navigateToCommunityRoomWithViewer(id, { roomForPrime: roomActionSheet.item.room });
          }}
          onTogglePin={() => {
            setRoomActionSheet(null);
            setOpenedMenuItemId((current) => (current?.startsWith("room:menu:") ? null : current));
            void updateRoomParticipantState(roomActionSheet.item.room.id, {
              isPinned: !roomActionSheet.item.room.isPinned,
            });
          }}
          onToggleMute={() => {
            setRoomActionSheet(null);
            setOpenedMenuItemId((current) => (current?.startsWith("room:menu:") ? null : current));
            void updateRoomParticipantState(roomActionSheet.item.room.id, {
              isMuted: !roomActionSheet.item.room.isMuted,
            });
          }}
          onMarkRead={() => void markRoomRead(roomActionSheet.item.room.id)}
          onToggleArchive={() => {
            setRoomActionSheet(null);
            setOpenedMenuItemId((current) => (current?.startsWith("room:menu:") ? null : current));
            void toggleRoomArchive(
              roomActionSheet.item.room.id,
              !communityMessengerRoomIsInboxHidden(roomActionSheet.item.room)
            );
          }}
          onViewFriendProfile={(() => {
            const room = roomActionSheet.item.room;
            if (room.roomType !== "direct" || !room.peerUserId) return undefined;
            const profile = resolvePeerProfileForRoom(room.peerUserId);
            if (!profile) return undefined;
            return () => {
              setRoomActionSheet(null);
              setFriendSheet({ mode: "profile", profile });
            };
          })()}
          onViewGroupInfo={
            roomActionSheet.item.room.roomType === "private_group"
              ? () => {
                  const id = roomActionSheet.item.room.id;
                  setRoomActionSheet(null);
                  const base = communityMessengerRoomHref(
                    id,
                    readMessengerEntryOriginFromLocation(),
                    pillar === "trade" ? "trade" : pillar === "delivery" ? "delivery" : "inbox"
                  );
                  router.push(`${base}${base.includes("?") ? "&" : "?"}sheet=info`);
                }
              : undefined
          }
          onViewOpenChatInfo={
            roomActionSheet.item.room.roomType === "open_group"
              ? () => {
                  const id = roomActionSheet.item.room.id;
                  setRoomActionSheet(null);
                  const base = communityMessengerRoomHref(
                    id,
                    readMessengerEntryOriginFromLocation(),
                    pillar === "trade" ? "trade" : pillar === "delivery" ? "delivery" : "inbox"
                  );
                  router.push(`${base}${base.includes("?") ? "&" : "?"}sheet=info`);
                }
              : undefined
          }
          onViewRelatedCommerce={(() => {
            const room = roomActionSheet.item.room;
            const pid = room.contextMeta?.productChatId?.trim();
            if (!pid || (!communityMessengerRoomIsTrade(room) && !communityMessengerRoomIsDelivery(room))) {
              return undefined;
            }
            return () => {
              setRoomActionSheet(null);
              router.push(defaultTradeChatRoomHref(pid, "product_chat"));
            };
          })()}
          onBlock={
            roomActionSheet.item.room.roomType === "direct" &&
            roomActionSheet.item.room.peerUserId &&
            roomActionSheet.item.room.peerUserId !== data.me?.id
              ? () => {
                  const pid = roomActionSheet.item.room.peerUserId!;
                  setRoomActionSheet(null);
                  void toggleBlock(pid);
                }
              : undefined
          }
          onLeave={() => {
            setRoomActionSheet(null);
            setOpenedMenuItemId((current) => (current?.startsWith("room:menu:") ? null : current));
            void leaveMessengerRoom(roomActionSheet.item.room);
          }}
          onClearLocalPreview={() => clearLocalRoomPreview(roomActionSheet.item.room.id)}
          onReportRoom={() => void reportCommunityRoom(roomActionSheet.item.room.id)}
        />
      ) : null}

      {friendsPrivacySheetOpen && data ? (
        <MessengerFriendsPrivacySheet
          model={friendStateModel}
          busyId={busyId}
          onClose={() => closeHomeOverlay("friends-privacy")}
          onToggleHidden={(userId) => void toggleHiddenFriend(userId)}
          onToggleBlock={(userId) => void toggleBlock(userId)}
          onToggleMute={(userId) => onFriendToggleRoomMuteStable(userId)}
          friendNotificationsBusy={friendNotificationsBusyStable}
          onOpenChat={(userId) => {
            closeHomeOverlay("friends-privacy");
            void startDirectRoom(userId);
          }}
        />
      ) : null}

      {searchSheetOpen ? (
        <MessengerSearchSheet
          keyword={roomSearchKeyword}
          viewerUserId={data?.me?.id ?? null}
          onKeywordChange={setRoomSearchKeyword}
          onClose={() => closeHomeOverlay("search")}
          onCommitRecentSearch={commitRecentSearch}
          onRemoveRecentSearch={removeRecentSearch}
          recentSearches={recentSearches}
          queryActive={Boolean(searchKeywordNormalized)}
          searchFriendMatches={searchFriendMatches}
          searchRoomMatches={searchRoomMatches}
          searchMessageMatches={searchMessageMatches}
          searchOpenChatMatches={searchOpenChatMatches}
          favoriteFriendIds={favoriteFriendIds}
        savedFriendIds={savedFriendIds}
          busyId={busyId}
          onTogglePin={handleMessengerHomeTogglePin}
          onToggleMute={handleMessengerHomeToggleMute}
          onMarkRead={handleMessengerHomeMarkRoomRead}
          onToggleArchive={handleMessengerHomeToggleRoomArchive}
          onSelectFriend={(friend) => setFriendSheet({ mode: "profile", profile: friend })}
          onSelectOpenGroup={(groupId) => void openJoinModal(groupId)}
          onSelectMessageRoom={(roomId) => navigateToCommunityRoomWithViewer(roomId)}
        />
      ) : null}

      {composerOpen ? (
        <MessengerNewConversationSheet
          onClose={() => closeHomeOverlay("composer")}
          onFriendChatStart={() => setMainSection("friends")}
          onFriendAdd={() => {
            closeHomeOverlay("composer");
            setFriendAddTab("id");
            setFriendManagerOpen(true);
            requestAnimationFrame(() => friendSearchRef.current?.focus());
          }}
          onCreateGroup={() => setGroupCreateStep("private_group")}
          onFindOpenChat={() => openHomeOverlay("public-group-find")}
        />
      ) : null}

      {friendManagerOpen && data ? (
        <MessengerFriendAddSheet
          onClose={() => setFriendManagerOpen(false)}
          friendAddTab={friendAddTab}
          onFriendAddTabChange={setFriendAddTab}
          localSettings={localSettings}
          updateLocalSetting={updateLocalSetting}
          searchKeyword={searchKeyword}
          onSearchKeywordChange={setSearchKeyword}
          friendSearchRef={friendSearchRef}
          onSearchUsers={() => void refreshFriendSearch(searchKeyword)}
          searchBusy={friendUserSearchBusy}
          friendUserSearchAttempted={friendUserSearchAttempted}
          searchResults={searchResults}
          viewerUserId={data.me?.id ?? null}
          busyId={busyId}
          onPrefetchDirectRoom={(userId) => maybePrefetchDirectRoom(userId)}
          onStartDirectChat={(userId) => void startDirectRoom(userId)}
          inviteUrl={messengerInviteUrl}
        />
      ) : null}

      {requestSheetOpen ? (
        <MessengerNotificationCenterSheet
          onClose={() => closeHomeOverlay("requests")}
          summary={notificationCenterSummary}
          items={notificationCenterItems}
          busyId={busyId}
          onRespondRequest={respondRequest}
          onOpenMissedCall={(call) => {
            if (call.roomId) {
              navigateToCommunityRoomWithViewer(call.roomId);
            }
          }}
          onOpenImportantRoom={(roomId) => navigateToCommunityRoomWithViewer(roomId)}
          onOpenGroupInvite={(roomId, inviteId) => {
            useIncomingFriendRequestPopupStore.getState().dismissGroupInviteIfId(inviteId);
            dismissNotification(`group_invite:${inviteId}`);
            navigateToCommunityRoomWithViewer(roomId);
          }}
          onDismissNotification={(id) => {
            if (id.startsWith("group_invite:")) {
              useIncomingFriendRequestPopupStore.getState().dismissGroupInviteIfId(id.slice("group_invite:".length));
            }
            dismissNotification(id);
          }}
          onMarkRoomRead={markRoomRead}
          onToggleRoomMute={notificationRoomMuteToggle}
          onArchiveRoom={notificationArchiveRoom}
        />
      ) : null}

      {settingsSheetOpen && data ? (
        <MessengerSettingsSheet
          onClose={() => closeHomeOverlay("settings")}
          busyId={busyId}
          blocked={data.blocked}
          hidden={data.hidden}
          favoriteManageFriends={favoriteManageFriends}
          favoriteCount={favoriteManageFriends.length}
          notificationSettings={notificationSettings}
          updateNotificationSetting={updateNotificationSetting}
          incomingCallSoundEnabled={incomingCallSoundEnabled}
          onIncomingCallSoundChange={(next) => {
            setIncomingCallSoundEnabled(next);
            setCommunityMessengerIncomingCallSoundEnabled(next);
          }}
          incomingCallBannerEnabled={incomingCallBannerEnabled}
          onIncomingCallBannerChange={(next) => {
            setIncomingCallBannerEnabled(next);
            setCommunityMessengerIncomingCallBannerEnabled(next);
          }}
          localSettings={localSettings}
          updateLocalSetting={updateLocalSetting}
          onToggleBlock={(userId) => void toggleBlock(userId)}
          onToggleHiddenFriend={(userId) => void toggleHiddenFriend(userId)}
          onToggleFavoriteFriend={(userId) => void toggleFavoriteFriend(userId)}
          exportSettingsBackup={exportSettingsBackup}
          backupInputRef={backupInputRef}
          onBackupFileSelected={onBackupFileSelected}
          onOpenOpenChatDiscovery={() => {
            openHomeOverlay("public-group-find");
          }}
        />
      ) : null}

      {publicGroupFindOpen && data ? (
        <MessengerHomeBottomSheetShell
          onClose={() => closeHomeOverlay("public-group-find")}
          closeAriaLabel={t("nav_close")}
          dialogAriaLabel={t("cm_ui_find_meeting")}
          panelClassName="rounded-t-[14px] border-sam-border bg-sam-surface shadow-[0_-4px_14px_rgba(17,24,39,0.05)]"
        >
            <div className="flex shrink-0 items-center justify-between border-b border-sam-border-soft px-4 py-3.5">
              <p className="sam-text-section-title font-semibold text-sam-fg">{t("cm_ui_find_meeting")}</p>
              <button
                type="button"
                className="rounded-ui-rect px-3 py-1.5 sam-text-body text-sam-muted"
                onClick={() => closeHomeOverlay("public-group-find")}
              >
                {t("nav_close")}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-3">
              <input
                value={openGroupSearch}
                onChange={(e) => setOpenGroupSearch(e.target.value)}
                placeholder={t("cm_ui_search_meeting")}
                className="h-11 w-full rounded-ui-rect border border-sam-border px-3 sam-text-body outline-none focus:border-sam-border"
              />
              <div className="mt-3 space-y-2">
                {filteredDiscoverableGroups.length ? (
                  filteredDiscoverableGroups.map((group) => (
                    <DiscoverableOpenGroupCard
                      key={group.id}
                      group={group}
                      busy={busyId === `join-open-group:${group.id}` || busyId === `preview-open-group:${group.id}`}
                      onJoin={() => void openJoinModal(group.id)}
                    />
                  ))
                ) : (
                  <div className="py-10 text-center sam-text-body-secondary text-sam-muted">{t("cm_ui_no_search_results")}</div>
                )}
              </div>
            </div>
        </MessengerHomeBottomSheetShell>
      ) : null}

      {groupCreateStep !== "closed" ? (
        <MessengerHomeBottomSheetShell
          onClose={() => setGroupCreateStep("closed")}
          closeAriaLabel={t("nav_close")}
          dialogAriaLabel={t("cm_ui_create_group")}
          panelClassName="mx-auto max-w-[520px] overflow-y-auto rounded-t-ui-rect border-sam-border bg-sam-surface p-5 shadow-[0_8px_20px_rgba(17,24,39,0.06)]"
        >
            {groupCreateStep === "select" ? (
              <>
                <p className="sam-text-body-secondary font-medium text-sam-fg">{t("cm_ui_create_group")}</p>
                <h2 className="mt-1 sam-text-page-title font-semibold text-sam-fg">{t("cm_ui_which_group_to_create")}</h2>
                <div className="mt-4 grid gap-3">
                  <button
                    type="button"
                    onClick={() => setGroupCreateStep("private_group")}
                    className="rounded-ui-rect border border-sam-border px-4 py-4 text-left transition hover:border-sam-border hover:bg-sam-app"
                  >
                    <p className="sam-text-helper text-sam-muted">{t("cm_ui_friend_invite_type")}</p>
                    <p className="mt-1 sam-text-body-lg font-semibold text-sam-fg">{t("nav_messenger_private_group")}</p>
                    <p className="mt-1 sam-text-body-secondary text-sam-muted">{t("cm_ui_private_group_quick_create_hint")}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroupCreateStep("open_group")}
                    className="rounded-ui-rect border border-sam-border px-4 py-4 text-left transition hover:border-sam-border hover:bg-sam-app"
                  >
                    <p className="sam-text-helper text-sam-muted">{t("cm_svc_open_group_room")}</p>
                    <p className="mt-1 sam-text-body-lg font-semibold text-sam-fg">{t("nav_messenger_open_group")}</p>
                    <p className="mt-1 sam-text-body-secondary text-sam-muted">{t("cm_ui_create_open_group_room")}</p>
                  </button>
                </div>
              </>
            ) : null}

            {groupCreateStep === "private_group" ? (
              <CommunityMessengerPrivateGroupCreatePanel
                t={t}
                groupTitle={groupTitle}
                onGroupTitleChange={setGroupTitle}
                groupTitlePreview={groupTitlePreview}
                groupMembers={groupMembers}
                selectedMemberProfiles={selectedGroupMemberProfiles}
                onClearSelection={clearPrivateGroupSelection}
                onToggleMember={togglePrivateGroupMember}
                onClose={() => setGroupCreateStep("closed")}
                inviteSearchQuery={groupInviteSearchQuery}
                onInviteSearchQueryChange={setGroupInviteSearchQuery}
                inviteSearchBusy={groupInviteSearchBusy}
                inviteSearchFailed={groupInviteSearchFailed}
                filteredFriends={filteredGroupSelectableFriends}
                nonFriendSearchResults={groupInviteNonFriendResults}
                hasFriends={groupSelectableFriends.length > 0}
                showInviteSearchEmpty={showGroupInviteSearchEmpty}
              />
            ) : null}

            {groupCreateStep === "open_group" ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="sam-text-body-secondary font-medium text-sam-fg">{t("nav_messenger_open_group")}</p>
                    <h2 className="mt-1 sam-text-page-title font-semibold text-sam-fg">{t("cm_ui_create_owner_config_group")}</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setGroupCreateStep("select")}
                    className="rounded-ui-rect border border-sam-border px-3 py-2 sam-text-helper text-sam-fg"
                  >
                    {t("tier1_back")}
                  </button>
                </div>
                <div className="mt-4 grid gap-3">
                  <input
                    value={openGroupTitle}
                    onChange={(e) => setOpenGroupTitle(e.target.value)}
                    placeholder={t("cm_ui_meeting_name_placeholder")}
                    className="h-11 w-full rounded-ui-rect border border-sam-border px-3 sam-text-body outline-none focus:border-sam-border"
                  />
                  <textarea
                    value={openGroupSummary}
                    onChange={(e) => setOpenGroupSummary(e.target.value)}
                    rows={3}
                    placeholder={t("cm_ui_enter_room_intro")}
                    className="w-full rounded-ui-rect border border-sam-border px-3 py-3 sam-text-body outline-none focus:border-sam-border"
                  />
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="rounded-ui-rect border border-sam-border-soft px-3 py-3">
                      <p className="sam-text-body-secondary font-semibold text-sam-fg">{t("cm_ui_join_method")}</p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setOpenGroupJoinPolicy("password")}
                          className={`rounded-ui-rect border px-3 py-2 sam-text-helper font-semibold ${openGroupJoinPolicy === "password" ? "border-sam-border bg-sam-surface-muted text-sam-fg" : "border-sam-border bg-sam-surface text-sam-muted"}`}
                        >
                          {t("nav_messenger_password_short")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenGroupJoinPolicy("free");
                            setOpenGroupPassword("");
                          }}
                          className={`rounded-ui-rect border px-3 py-2 sam-text-helper font-semibold ${openGroupJoinPolicy === "free" ? "border-sam-border bg-sam-surface-muted text-sam-fg" : "border-sam-border bg-sam-surface text-sam-muted"}`}
                        >
                          {t("nav_messenger_join_free")}
                        </button>
                      </div>
                    </label>
                    <label className="rounded-ui-rect border border-sam-border-soft px-3 py-3">
                      <p className="sam-text-body-secondary font-semibold text-sam-fg">{t("cm_ui_identity_policy")}</p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setOpenGroupIdentityPolicy("real_name");
                            setOpenGroupCreatorIdentityMode("real_name");
                          }}
                          className={`rounded-ui-rect border px-3 py-2 sam-text-helper font-semibold ${openGroupIdentityPolicy === "real_name" ? "border-sam-border bg-sam-surface-muted text-sam-fg" : "border-sam-border bg-sam-surface text-sam-muted"}`}
                        >
                          {t("nav_messenger_identity_real")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setOpenGroupIdentityPolicy("alias_allowed")}
                          className={`rounded-ui-rect border px-3 py-2 sam-text-helper font-semibold ${openGroupIdentityPolicy === "alias_allowed" ? "border-sam-border bg-sam-surface-muted text-sam-fg" : "border-sam-border bg-sam-surface text-sam-muted"}`}
                        >
                          {t("nav_messenger_identity_alias")}
                        </button>
                      </div>
                    </label>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {openGroupJoinPolicy === "password" ? (
                      <input
                        value={openGroupPassword}
                        onChange={(e) => setOpenGroupPassword(e.target.value)}
                        placeholder={t("cm_ui_join_password_placeholder")}
                        className="h-11 w-full rounded-ui-rect border border-sam-border px-3 sam-text-body outline-none focus:border-sam-border"
                      />
                    ) : (
                      <div className="flex h-11 items-center rounded-ui-rect bg-sam-app px-3 sam-text-body-secondary text-sam-muted">
                        {t("cm_ui_free_join_selected")}
                      </div>
                    )}
                    <input
                      value={openGroupMemberLimit}
                      onChange={(e) => setOpenGroupMemberLimit(e.target.value.replace(/[^0-9]/g, ""))}
                      placeholder={t("nav_messenger_member_limit_placeholder")}
                      className="h-11 w-full rounded-ui-rect border border-sam-border px-3 sam-text-body outline-none focus:border-sam-border"
                    />
                  </div>
                  <label className="flex items-center justify-between rounded-ui-rect border border-sam-border-soft px-3 py-3">
                    <div>
                      <p className="sam-text-body font-medium text-sam-fg">{t("nav_messenger_discoverable_label")}</p>
                      <p className="sam-text-helper text-sam-muted">{t("cm_ui_discoverable_off_hint")}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={openGroupDiscoverable}
                      onChange={(e) => setOpenGroupDiscoverable(e.target.checked)}
                      className="h-4 w-4 rounded border-sam-border text-sam-fg focus:ring-sam-border"
                    />
                  </label>
                  {openGroupIdentityPolicy === "alias_allowed" ? (
                      <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-4">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setOpenGroupCreatorIdentityMode("real_name")}
                          className={`rounded-ui-rect border px-3 py-2 sam-text-helper font-semibold ${openGroupCreatorIdentityMode === "real_name" ? "border-sam-border bg-sam-surface-muted text-sam-fg" : "border-sam-border bg-sam-surface text-sam-muted"}`}
                        >
                          {t("cm_ui_owner_use_real_name")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setOpenGroupCreatorIdentityMode("alias")}
                          className={`rounded-ui-rect border px-3 py-2 sam-text-helper font-semibold ${openGroupCreatorIdentityMode === "alias" ? "border-sam-border bg-sam-surface-muted text-sam-fg" : "border-sam-border bg-sam-surface text-sam-muted"}`}
                        >
                          {t("cm_ui_owner_use_alias")}
                        </button>
                      </div>
                      {openGroupCreatorIdentityMode === "alias" ? (
                        <div className="mt-3 grid gap-3">
                          <input
                            value={openGroupCreatorAliasName}
                            onChange={(e) => setOpenGroupCreatorAliasName(e.target.value)}
                            placeholder={t("cm_ui_owner_alias_nickname_placeholder")}
                            className="h-11 w-full rounded-ui-rect border border-sam-border px-3 sam-text-body outline-none focus:border-sam-border"
                          />
                          <input
                            value={openGroupCreatorAliasAvatarUrl}
                            onChange={(e) => setOpenGroupCreatorAliasAvatarUrl(e.target.value)}
                            placeholder={t("cm_ui_avatar_url_optional")}
                            className="h-11 w-full rounded-ui-rect border border-sam-border px-3 sam-text-body outline-none focus:border-sam-border"
                          />
                          <textarea
                            value={openGroupCreatorAliasBio}
                            onChange={(e) => setOpenGroupCreatorAliasBio(e.target.value)}
                            rows={2}
                            placeholder={t("cm_ui_owner_intro_optional")}
                            className="w-full rounded-ui-rect border border-sam-border px-3 py-3 sam-text-body outline-none focus:border-sam-border"
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setGroupCreateStep("closed")}
                className="flex-1 rounded-ui-rect border border-sam-border px-4 py-3 sam-text-body font-medium text-sam-fg"
              >
                {t("nav_close")}
              </button>
              {groupCreateStep === "private_group" ? (
                <button
                  type="button"
                  onClick={() => void createPrivateGroup()}
                  disabled={busyId === "create-private-group" || groupMembers.length === 0}
                  className="flex-1 rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 sam-text-body font-semibold text-sam-fg disabled:opacity-40"
                >
                  {busyId === "create-private-group" ? t("cm_ui_creating") : t("cm_ui_create_private_group")}
                </button>
              ) : null}
              {groupCreateStep === "open_group" ? (
                <button
                  type="button"
                  onClick={() => void createOpenGroup()}
                  disabled={
                    busyId === "create-open-group" ||
                    !openGroupTitle.trim() ||
                    (openGroupJoinPolicy === "password" && !openGroupPassword.trim()) ||
                    (openGroupCreatorIdentityMode === "alias" && !openGroupCreatorAliasName.trim())
                  }
                  className="flex-1 rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 sam-text-body font-semibold text-sam-fg disabled:opacity-40"
                >
                  {busyId === "create-open-group" ? t("cm_ui_creating") : t("cm_ui_create_open_group_chat")}
                </button>
              ) : null}
            </div>
        </MessengerHomeBottomSheetShell>
      ) : null}

      {joinTargetGroup ? (
        <MeetingJoinPreviewFullScreen
          group={joinTargetGroup}
          busy={busyId === `join-open-group:${joinTargetGroup.id}`}
          onClose={closeJoinOpenGroupModal}
          onJoin={() => void joinOpenGroup()}
          joinPassword={joinPassword}
          onJoinPasswordChange={setJoinPassword}
          joinIdentityMode={joinIdentityMode}
          onJoinIdentityModeChange={setJoinIdentityMode}
          joinAliasName={joinAliasName}
          onJoinAliasNameChange={setJoinAliasName}
          joinAliasAvatarUrl={joinAliasAvatarUrl}
          onJoinAliasAvatarUrlChange={setJoinAliasAvatarUrl}
          joinAliasBio={joinAliasBio}
          onJoinAliasBioChange={setJoinAliasBio}
        />
      ) : null}

    </div>
  );
}, communityMessengerHomePropsEqual);

CommunityMessengerHome.displayName = "CommunityMessengerHome";
