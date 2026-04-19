"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MutableRefObject,
} from "react";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { CommunityMessengerHeaderActions } from "@/components/community-messenger/CommunityMessengerHeaderActions";
import { CommunityMessengerHomeListPane } from "@/components/community-messenger/CommunityMessengerHomeListPane";
import { DiscoverableOpenGroupCard } from "@/components/community-messenger/home/DiscoverableOpenGroupCard";
import { MessengerHomeFabPlusIcon } from "@/components/community-messenger/home/MessengerHomeFabPlusIcon";
import type { MessengerMenuAnchorRect } from "@/components/community-messenger/MessengerChatListItem";
import { MessengerHomeMainSections } from "@/components/community-messenger/MessengerHomeMainSections";
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
import {
  resolveImportantRoomHighlightReason,
  type MessengerNotificationCenterItem,
} from "@/lib/community-messenger/messenger-notification-center-model";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  type CommunityMessengerLocalSettings,
  isCommunityMessengerIncomingCallBannerEnabled,
  isCommunityMessengerIncomingCallSoundEnabled,
  readCommunityMessengerLocalSettings,
  setCommunityMessengerIncomingCallBannerEnabled,
  setCommunityMessengerIncomingCallSoundEnabled,
  writeCommunityMessengerLocalSettings,
} from "@/lib/community-messenger/preferences";
import { messengerMonitorUnreadListSync } from "@/lib/community-messenger/monitoring/client";
import {
  fetchMeNotificationSettingsGet,
  invalidateMeNotificationSettingsGetFlight,
} from "@/lib/me/fetch-me-notification-settings-client";
import { RECENT_SEARCHES_STORAGE_KEY } from "@/lib/community-messenger/home/community-messenger-home-constants";
import type {
  CommunityMessengerSettingsBackup,
  FriendSheetState,
  MessengerNotificationSettings,
} from "@/lib/community-messenger/home/community-messenger-home-types";
import { messengerHomeActionErrorMessage } from "@/lib/community-messenger/home/messenger-home-action-error-message";
import { scoreKeywordMatch } from "@/lib/community-messenger/home/score-keyword-match";
import { primeBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";
import { mergeBootstrapRoomSummaryIntoLists } from "@/lib/community-messenger/home/merge-bootstrap-room-summary-into-lists";
import { useCommunityMessengerHomeRealtimeBootstrapList } from "@/lib/community-messenger/home/use-community-messenger-home-realtime-bootstrap-list";
import { postCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { requestMessengerHubBadgeResync } from "@/lib/community-messenger/notifications/messenger-notification-contract";
import { useCommunityMessengerPresenceRuntime } from "@/lib/community-messenger/realtime/presence/use-community-messenger-presence-runtime";
import { useCommunityMessengerHomeBootstrap } from "@/lib/community-messenger/home/use-community-messenger-home-bootstrap";
import { bumpMessengerRenderPerf } from "@/lib/runtime/samarket-runtime-debug";
import { bootstrapCommunityMessengerOutgoingCallAndNavigate } from "@/lib/community-messenger/call-session-navigation-seed";
import { MessengerOutgoingCallConfirmDialog } from "@/components/community-messenger/MessengerOutgoingCallConfirmDialog";
import {
  communityMessengerFriendRequestFailureMessage,
  messengerFriendRequestBusyId,
  postCommunityMessengerFriendRequestApi,
} from "@/lib/community-messenger/community-messenger-friend-request-client";
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
  invalidateRoomSnapshot,
  peekRoomSnapshot,
  prefetchCommunityMessengerRoomSnapshot,
  primeRoomSnapshot,
} from "@/lib/community-messenger/room-snapshot-cache";
import { communityMessengerRoomResourcePath } from "@/lib/community-messenger/messenger-room-bootstrap";
import { defaultTradeChatRoomHref } from "@/lib/chats/trade-chat-notification-href";
import { BOTTOM_NAV_FAB_LAYOUT } from "@/lib/main-menu/bottom-nav-config";
import {
  type MessengerChatInboxFilter,
  type MessengerChatKindFilter,
  type MessengerArchiveSection,
  type MessengerChatListChip,
  type MessengerChatListContext,
  type MessengerMainSection,
  chipToInboxKind,
  messengerChatFiltersToSearchParams,
  messengerRoomMenuItemId,
  resolveMessengerChatFilters,
  resolveMessengerSection,
} from "@/lib/community-messenger/messenger-ia";
import { MESSENGER_SCROLL_OVERLAY_IDLE_MS } from "@/lib/community-messenger/messenger-transient-ui-policy";
import {
  communityMessengerRoomIsDelivery,
  communityMessengerRoomIsTrade,
} from "@/lib/community-messenger/messenger-room-domain";
import {
  communityMessengerRoomIsInboxHidden,
  type CommunityMessengerBootstrap,
  type CommunityMessengerDiscoverableGroupSummary,
  type CommunityMessengerFriendRequest,
  type CommunityMessengerProfileLite,
  type CommunityMessengerRoomSnapshot,
  type CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";
import { useIncomingFriendRequestPopup } from "@/lib/community-messenger/use-incoming-friend-request-popup";
import {
  useFriendRequestNotificationRealtime,
  type FriendRequestNotificationEvent,
} from "@/lib/community-messenger/use-friend-request-notification-realtime";
import {
  type UnifiedRoomListItem,
  useCommunityMessengerHomeState,
} from "@/lib/community-messenger/use-community-messenger-home-state";
import {
  readDismissedCommunityMessengerNotificationIds,
  writeDismissedCommunityMessengerNotificationIds,
} from "@/lib/community-messenger/community-messenger-home-notification-dismiss-storage";
import { useCommunityMessengerHomeNavigation } from "@/lib/community-messenger/home/use-community-messenger-home-navigation";
import { useCommunityMessengerHomeShellEffects } from "@/lib/community-messenger/home/use-community-messenger-home-shell-effects";
import {
  applyRoomReadEvent,
  seedMessengerRealtimeFromBootstrap,
} from "@/lib/community-messenger/stores/messenger-realtime-store";

type CommunityMessengerHomeOverlayKind =
  | "composer"
  | "requests"
  | "search"
  | "friends-privacy"
  | "settings"
  | "public-group-find";

export function CommunityMessengerHome({
  initialTab,
  initialSection,
  initialFilter,
  initialKind,
  /**
   * `/community-messenger` RSC 는 부트스트랩을 내리지 않는다(null).
   * 클라이언트는 `peekBootstrapCache`·`GET /api/community-messenger/bootstrap`(lite/full) 단일 경로로 동기화한다.
   */
  initialServerBootstrap = null,
}: {
  initialTab?: string;
  initialSection?: string;
  initialFilter?: string;
  initialKind?: string;
  initialServerBootstrap?: CommunityMessengerBootstrap | null;
}) {
  bumpMessengerRenderPerf("messenger_home_render");
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  /** 언어 전환 시에도 부트스트랩 effect 가 재실행되지 않도록 번역 함수만 최신으로 유지 */
  const tRef = useRef(t) as MutableRefObject<(key: string) => string>;
  tRef.current = t as (key: string) => string;
  const {
    data,
    setData,
    loading,
    authRequired,
    setAuthRequired,
    pageError,
    setPageError,
    refresh,
    homeRealtimeGateOpen,
  } = useCommunityMessengerHomeBootstrap({ initialServerBootstrap, tRef });
  /** 초기 부트스트랩 HTTP 는 훅 내부 `refreshRef` 로 마운트당 1회만( `refresh` 함수 참조 변경으로 재요청 없음 ). */
  useCommunityMessengerPresenceRuntime(data?.me?.id ?? null);
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
    resolveMessengerSection(initialSection, initialTab)
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
    setOpenedSwipeItemId(null);
    setOpenedMenuItemId(null);
    setRoomActionSheet(null);
    setMessengerOverlayGeneration((g) => g + 1);
  }, []);

  const notifyMessengerListScroll = useCallback(() => {
    if (!isScrollingRef.current) {
      isScrollingRef.current = true;
      setIsScrolling(true);
    }
    if (scrollResetTimerRef.current != null) {
      clearTimeout(scrollResetTimerRef.current);
    }
    scrollResetTimerRef.current = setTimeout(() => {
      isScrollingRef.current = false;
      setIsScrolling(false);
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
    setOpenedSwipeItemId(null);
    setOpenedMenuItemId(id);
    setRoomActionSheet(null);
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
      setOpenedSwipeItemId(null);
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
    });
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [incomingFriendRequestPopup, setIncomingFriendRequestPopup] = useState<CommunityMessengerFriendRequest | null>(null);
  const [roomSearchKeyword, setRoomSearchKeyword] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<string[]>([]);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchResults, setSearchResults] = useState<CommunityMessengerProfileLite[]>([]);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
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
    setSearchKeyword("");
    setSearchResults([]);
    setFriendUserSearchAttempted(false);
  }, []);
  const resetGroupCreateDraft = useCallback(() => {
    setGroupTitle("");
    setGroupMembers([]);
    setOpenGroupTitle("");
    setOpenGroupSummary("");
    setOpenGroupPassword("");
    setOpenGroupMemberLimit("200");
    setOpenGroupDiscoverable(true);
    setOpenGroupJoinPolicy("password");
    setOpenGroupIdentityPolicy("alias_allowed");
    setOpenGroupCreatorIdentityMode("real_name");
    setOpenGroupCreatorAliasName("");
    setOpenGroupCreatorAliasBio("");
    setOpenGroupCreatorAliasAvatarUrl("");
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
    setJoinTargetGroup(null);
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
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const incomingRequestCount = useMemo(
    () => (data?.requests ?? []).filter((r) => r.direction === "incoming").length,
    [data?.requests]
  );
  const friendProfileForSheet = useMemo(() => {
    if (!friendSheet || friendSheet.mode !== "profile") return null;
    if (data) return mergeCommunityMessengerProfileFromBootstrap(friendSheet.profile, data);
    return friendSheet.profile;
  }, [friendSheet, data]);

  const friendAddCtaForSheet = useMemo(() => {
    if (!friendProfileForSheet || !data?.me?.id) return undefined;
    return resolveMessengerFriendAddCta(friendProfileForSheet, data.me.id, data.requests ?? []);
  }, [friendProfileForSheet, data?.me?.id, data?.requests]);

  const homeRoomIds = useMemo(
    () => [...(data?.chats ?? []), ...(data?.groups ?? [])].map((room) => room.id),
    [data?.chats, data?.groups]
  );

  useEffect(() => {
    seedMessengerRealtimeFromBootstrap(data);
  }, [data]);

  const directRoomByPeerId = useMemo(() => {
    const map = new Map<string, CommunityMessengerRoomSummary>();
    for (const room of data?.chats ?? []) {
      if (room.roomType !== "direct" || !room.peerUserId) continue;
      const prev = map.get(room.peerUserId);
      if (!prev || new Date(room.lastMessageAt).getTime() >= new Date(prev.lastMessageAt).getTime()) {
        map.set(room.peerUserId, room);
      }
    }
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
    if (joinTargetGroup) return;
    resetJoinOpenGroupDraft();
  }, [joinTargetGroup, resetJoinOpenGroupDraft]);

  const headerActionsNode = useMemo(
    () => (
      <div data-messenger-shell className="flex items-center">
        <CommunityMessengerHeaderActions
          incomingRequestCount={incomingRequestCount}
          onOpenSearch={() => openHomeOverlay("search")}
          onOpenRequestList={() => openHomeOverlay("requests")}
          onOpenSettings={() => openHomeOverlay("settings")}
        />
      </div>
    ),
    [incomingRequestCount, openHomeOverlay]
  );

  useCommunityMessengerHomeShellEffects({
    router,
    searchParams,
    setMainTier1Extras,
    headerActionsNode,
    roomActionSheetOpen: Boolean(roomActionSheet),
    setRoomActionSheet: setRoomActionSheet as any,
    setOpenedMenuItemId,
    setIncomingCallSoundEnabled,
    setIncomingCallBannerEnabled,
    setLocalSettings,
    setRecentSearches,
    recentSearches,
    setDismissedNotificationIds,
    openSettingsSheet: () => openHomeOverlay("settings"),
    setMainSection,
    setChatInboxFilter,
    setChatKindFilter,
    incomingRequestCount,
    setNotificationSettings,
    data,
    incomingFriendRequestPopup,
    setIncomingFriendRequestPopup,
  });

  /**
   * 메시지 INSERT Realtime → `patchBootstrapRoomListForRealtimeMessageInsert`(프리뷰·최근순 정렬·낙관 unread) +
   * `use-community-messenger-realtime` 의 `notifyMessengerHomeRealtimeMessageInsert`(배지 resync·탭 숨김 톤).
   */
  useCommunityMessengerHomeRealtimeBootstrapList({
    userId: data?.me?.id,
    roomIds: homeRoomIds,
    homeRealtimeGateOpen,
    refresh,
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
      setData((prev) => {
        if (!prev) return prev;
        const apply = (rooms: CommunityMessengerRoomSummary[]) =>
          rooms.map((current) => (current.id === room.id ? { ...current, isArchivedByViewer: false } : current));
        return {
          ...prev,
          chats: apply(prev.chats),
          groups: apply(prev.groups),
        };
      });
      return true;
    },
    [getMessengerActionErrorMessage]
  );

  const maybePrefetchDirectRoom = useCallback(
    (peerUserId: string) => {
      const existing = (data?.chats ?? []).find((room) => room.roomType === "direct" && room.peerUserId === peerUserId);
      if (existing) void prefetchCommunityMessengerRoomSnapshot(existing.id);
    },
    [data?.chats]
  );

  const startDirectRoom = useCallback(
    async (peerUserId: string) => {
      setActionError(null);
      const existingRoom = (data?.chats ?? []).find((room) => room.roomType === "direct" && room.peerUserId === peerUserId);
      if (existingRoom) {
        const revived = await reviveDirectRoomForEntry(existingRoom);
        if (!revived) return;
        if (!peekRoomSnapshot(existingRoom.id, data?.me?.id ?? undefined)) {
          void prefetchCommunityMessengerRoomSnapshot(existingRoom.id);
        }
        navigateToCommunityRoom(existingRoom.id);
        return;
      }
      setBusyId(`room:${peerUserId}`);
      try {
        const res = await fetch("/api/community-messenger/rooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomType: "direct", peerUserId }),
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
            const uid = data?.me?.id?.trim();
            const { description: _desc, ...roomSummary } = json.snapshot.room;
            setData((prev) => {
              if (!prev) return prev;
              const next = mergeBootstrapRoomSummaryIntoLists(prev, roomSummary);
              if (next === prev) return prev;
              primeBootstrapCache(next);
              return next;
            });
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
          navigateToCommunityRoom(json.roomId);
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
    [data?.chats, data?.me?.id, getMessengerActionErrorMessage, navigateToCommunityRoom, reviveDirectRoomForEntry, t]
  );

  /** 1:1 발신 — `lib/community-messenger/outgoing-call-surfaces.ts` (friendsFavoriteQuickActions, friendProfileSheet) 에만 연결 */
  const startDirectCall = useCallback(
    (peerUserId: string, kind: "voice" | "video") => {
      if (outgoingDialSyncGuardRef.current) return;
      outgoingDialSyncGuardRef.current = true;
      setActionError(null);
      const existingRoom = data?.chats?.find((r) => r.roomType === "direct" && r.peerUserId === peerUserId) ?? null;
      if (existingRoom && communityMessengerRoomIsInboxHidden(existingRoom)) {
        void reviveDirectRoomForEntry(existingRoom);
      }

      void (async () => {
        setBusyId("messenger-outgoing-call");
        try {
          const result = await bootstrapCommunityMessengerOutgoingCallAndNavigate(
            {
              roomId: existingRoom?.id ?? null,
              peerUserId: existingRoom?.id ? null : peerUserId,
              kind,
            },
            (href) => {
              router.push(href);
            }
          );
          if (!result.ok) {
            setActionError(result.userMessage);
          }
        } catch {
          setActionError("네트워크 오류로 통화를 시작하지 못했습니다.");
        } finally {
          setBusyId(null);
          outgoingDialSyncGuardRef.current = false;
        }
      })();
    },
    [data?.chats, reviveDirectRoomForEntry, router]
  );

  const searchUsers = useCallback(async () => {
    const keyword = searchKeyword.trim();
    if (!keyword) {
      setSearchResults([]);
      setFriendUserSearchAttempted(true);
      return;
    }
    setBusyId("user-search");
    try {
      const res = await fetch(`/api/community-messenger/users?q=${encodeURIComponent(keyword)}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as { ok?: boolean; users?: CommunityMessengerProfileLite[] };
      setSearchResults(res.ok && json.ok ? json.users ?? [] : []);
      setFriendUserSearchAttempted(true);
    } finally {
      setBusyId(null);
    }
  }, [searchKeyword]);

  const requestFriend = useCallback(
    async (targetUserId: string) => {
      setBusyId(messengerFriendRequestBusyId(targetUserId));
      const nowIso = new Date().toISOString();
      const vid = data?.me?.id ?? "";
      const viewerLabel = data?.me?.label ?? "";
      const targetLabel = searchResults.find((u) => u.id === targetUserId)?.label ?? "";
      const optimisticId = `local:friend_request:${vid}:${targetUserId}`;
      // optimistic: 즉시 버튼 상태(요청중) + 목록 반영
      setData((prev) => {
        if (!prev?.me?.id) return prev;
        const alreadyPending = (prev.requests ?? []).some(
          (r) =>
            r.status === "pending" &&
            r.requesterId === prev.me?.id &&
            r.addresseeId === targetUserId
        );
        if (alreadyPending) return prev;
        return {
          ...prev,
          requests: [
            {
              id: optimisticId,
              requesterId: prev.me.id,
              requesterLabel: viewerLabel,
              addresseeId: targetUserId,
              addresseeLabel: targetLabel,
              status: "pending",
              direction: "outgoing",
              createdAt: nowIso,
            },
            ...(prev.requests ?? []),
          ],
        };
      });
      try {
        const result = await postCommunityMessengerFriendRequestApi(targetUserId);
        if (result.ok) {
          // server id로 optimistic row 교체
          const serverReq = result.request;
          if (serverReq) {
            setData((prev) => {
              if (!prev?.me?.id) return prev;
              const nextRequests = (prev.requests ?? [])
                .filter(
                  (r) =>
                    !(
                      r.id === optimisticId ||
                      (r.status === "pending" &&
                        r.requesterId === prev.me?.id &&
                        r.addresseeId === targetUserId)
                    )
                )
                .concat([serverReq]);
              return { ...prev, requests: nextRequests };
            });
          } else {
            // 응답이 request를 포함하지 않는 경우도 즉시 상태는 유지
            setData((prev) => prev);
          }
          // 목록 전체 refresh는 백그라운드에서만(즉시성 우선)
          void refresh(true);
          void searchUsers();
          /** 교차 요청 흡수 시 수락과 동일하게 DM 방으로 이동 */
          if (result.mergedFromIncoming && typeof result.directRoomId === "string" && result.directRoomId.trim()) {
            const rid = result.directRoomId.trim();
          router.push(`/community-messenger/rooms/${encodeURIComponent(rid)}`);
          }
          return;
        }
        const msg = communityMessengerFriendRequestFailureMessage(result);
        if (msg) showMessengerSnackbar(msg, { variant: "error" });
        // rollback optimistic
        setData((prev) => {
          if (!prev) return prev;
          return { ...prev, requests: (prev.requests ?? []).filter((r) => r.id !== optimisticId) };
        });
      } finally {
        setBusyId(null);
      }
    },
    [data?.me?.id, data?.me?.label, refresh, router, searchResults, searchUsers, setData]
  );

  const respondRequest = useCallback(
    async (requestId: string, action: "accept" | "reject" | "cancel") => {
      setBusyId(`request:${requestId}:${action}`);
      const nowIso = new Date().toISOString();
      // optimistic: 요청 목록에서 즉시 제거 + (수락 시) 친구 즉시 추가
      const optimisticPeer = (() => {
        const req = (data?.requests ?? []).find((r) => r.id === requestId) ?? null;
        if (!req || !data?.me?.id) return null;
        if (action === "cancel") {
          return req.direction === "outgoing" ? req.addresseeId : null;
        }
        // accept/reject는 incoming만 허용되지만 방어적으로 처리
        return req.direction === "incoming" ? req.requesterId : null;
      })();
      const optimisticPeerLabel = (() => {
        const req = (data?.requests ?? []).find((r) => r.id === requestId) ?? null;
        if (!req) return "";
        if (action === "cancel") return req.addresseeLabel ?? "";
        return req.requesterLabel ?? "";
      })();
      setIncomingFriendRequestPopup((prev) => (prev?.id === requestId ? null : prev));
      setData((prev) => {
        if (!prev) return prev;
        const nextRequests = (prev.requests ?? []).filter((r) => r.id !== requestId);
        let next = { ...prev, requests: nextRequests };
        if (action === "accept" && optimisticPeer) {
          const exists = (prev.friends ?? []).some((f) => f.id === optimisticPeer);
          if (!exists) {
            const nextFriend: CommunityMessengerProfileLite = {
              id: optimisticPeer,
              label: optimisticPeerLabel || "친구",
              subtitle: "",
              bio: null,
              avatarUrl: null,
              following: false,
              blocked: false,
              isFriend: true,
              isFavoriteFriend: false,
              isHiddenFriend: false,
              friendshipAcceptedAt: nowIso,
            };
            const nextFriends = [...(prev.friends ?? []), nextFriend];
            next = {
              ...next,
              friends: nextFriends,
              tabs: { ...prev.tabs, friends: nextFriends.length },
            };
          }
        }
        return next;
      });
      // 검색 결과/프로필 시트도 즉시 반영(버튼 상태)
      if (action === "accept" && optimisticPeer) {
        setSearchResults((prev) => prev.map((p) => (p.id === optimisticPeer ? { ...p, isFriend: true } : p)));
        setFriendSheet((prev) => (prev?.profile.id === optimisticPeer ? { ...prev, profile: { ...prev.profile, isFriend: true } } : prev));
      }
      try {
        const res = await fetch(`/api/community-messenger/friend-requests/${encodeURIComponent(requestId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          directRoomId?: string;
        };
        if (res.ok && json.ok) {
          void refresh(true);
          if (action === "accept" && typeof json.directRoomId === "string" && json.directRoomId.trim()) {
            const rid = json.directRoomId.trim();
            router.push(`/community-messenger/rooms/${encodeURIComponent(rid)}`);
          }
        } else {
          // 실패 시: 즉시성보다 정확성이 우선이므로 silent refresh로 복구
          void refresh(true);
        }
      } finally {
        setBusyId(null);
      }
    },
    [data?.me?.id, data?.requests, refresh, router, setData]
  );

  useIncomingFriendRequestPopup(data?.me?.id ?? null, Boolean(!loading && !authRequired && data?.me?.id), (req) => {
    setIncomingFriendRequestPopup(req);
  });

  const onFriendRequestNotif = useCallback(
    (ev: FriendRequestNotificationEvent) => {
      if (!data?.me?.id) return;
      if (ev.kind === "friend_request") {
        // 즉시 팝업 + 목록에 반영(중복 방지). 세부 프로필은 홈 refresh에서 보강.
        setData((prev) => {
          if (!prev) return prev;
          const already = (prev.requests ?? []).some((r) => r.id === ev.requestId);
          if (already) return prev;
          return {
            ...prev,
            requests: [
              {
                id: ev.requestId,
                requesterId: ev.requesterUserId,
                requesterLabel: ev.requesterLabel || "상대",
                addresseeId: prev.me?.id ?? "",
                addresseeLabel: "",
                status: "pending",
                direction: "incoming",
                createdAt: ev.createdAt,
              },
              ...(prev.requests ?? []),
            ],
          };
        });
        // 팝업은 별도 hook이 이미 처리하지만, 알림 기반 이벤트도 들어오는 경우를 위해 보강.
        setIncomingFriendRequestPopup((prev) => {
          if (prev?.id === ev.requestId) return prev;
          return {
            id: ev.requestId,
            requesterId: ev.requesterUserId,
            requesterLabel: ev.requesterLabel || "상대",
            addresseeId: data.me?.id ?? "",
            addresseeLabel: "",
            status: "pending",
            direction: "incoming",
            createdAt: ev.createdAt,
          };
        });
        return;
      }
      if (ev.kind === "friend_accepted" || ev.kind === "friend_rejected") {
        // 발신자 쪽: 보낸 요청 상태 즉시 반영 + (수락 시) 친구 즉시 추가
        const peerId = ev.addresseeUserId?.trim?.() ? ev.addresseeUserId.trim() : "";
        setData((prev) => {
          if (!prev) return prev;
          const nextRequests = (prev.requests ?? []).filter((r) => r.id !== ev.requestId);
          let next: typeof prev = { ...prev, requests: nextRequests };
          if (ev.kind === "friend_accepted" && peerId) {
            const exists = (prev.friends ?? []).some((f) => f.id === peerId);
            if (!exists) {
              const nowIso = new Date().toISOString();
              const nextFriend: CommunityMessengerProfileLite = {
                id: peerId,
                label: ev.addresseeLabel || "친구",
                subtitle: "",
                bio: null,
                avatarUrl: null,
                following: false,
                blocked: false,
                isFriend: true,
                isFavoriteFriend: false,
                isHiddenFriend: false,
                friendshipAcceptedAt: nowIso,
              };
              const nextFriends = [...(prev.friends ?? []), nextFriend];
              next = { ...next, friends: nextFriends, tabs: { ...prev.tabs, friends: nextFriends.length } };
            }
          }
          return next;
        });
        if (peerId) {
          setSearchResults((prev) => prev.map((p) => (p.id === peerId ? { ...p, isFriend: ev.kind === "friend_accepted" } : p)));
          setFriendSheet((prev) =>
            prev?.profile.id === peerId ? { ...prev, profile: { ...prev.profile, isFriend: ev.kind === "friend_accepted" } } : prev
          );
        }
        // 사용자 피드백용 스낵바(새로고침 없이 즉시 느낌).
        showMessengerSnackbar(
          ev.kind === "friend_accepted"
            ? `${ev.addresseeLabel || "상대"}님이 친구 요청을 수락했습니다.`
            : `${ev.addresseeLabel || "상대"}님이 친구 요청을 거절했습니다.`,
          { variant: ev.kind === "friend_accepted" ? "success" : "error" }
        );
      }
    },
    [data?.me?.id, setData]
  );

  useFriendRequestNotificationRealtime(data?.me?.id ?? null, Boolean(!loading && !authRequired && data?.me?.id), onFriendRequestNotif);

  const toggleFavoriteFriend = useCallback(
    async (friendUserId: string) => {
      setBusyId(`favorite:${friendUserId}`);
      try {
        const res = await fetch(`/api/community-messenger/friends/${encodeURIComponent(friendUserId)}/favorite`, {
          method: "POST",
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; isFavorite?: boolean };
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
        }
      } finally {
        setBusyId(null);
      }
    },
    [refresh]
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
    [refresh]
  );

  const toggleFollow = useCallback(
    async (targetUserId: string) => {
      setBusyId(`follow:${targetUserId}`);
      try {
        const res = await fetch("/api/community/neighbor-relations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetUserId }),
        });
        if (res.ok) {
          void refresh(true);
          void searchUsers();
        }
      } finally {
        setBusyId(null);
      }
    },
    [refresh, searchUsers]
  );

  const toggleBlock = useCallback(
    async (targetUserId: string) => {
      setBusyId(`block:${targetUserId}`);
      try {
        const res = await fetch("/api/community/block-relations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetUserId }),
        });
        if (res.ok) {
          void refresh(true);
          void searchUsers();
        }
      } finally {
        setBusyId(null);
      }
    },
    [refresh, searchUsers]
  );

  const createPrivateGroup = useCallback(async () => {
    const memberIds = groupMembers.filter(Boolean);
    if (memberIds.length === 0) return;
    setActionError(null);
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
        navigateToCommunityRoom(json.roomId);
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
  }, [getMessengerActionErrorMessage, groupMembers, groupTitle, navigateToCommunityRoom, refresh, resetGroupCreateDraft, t]);

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
        navigateToCommunityRoom(json.roomId);
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
    navigateToCommunityRoom,
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
    refresh,
    resetGroupCreateDraft,
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
        navigateToCommunityRoom(json.roomId);
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
    navigateToCommunityRoom,
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
  });
  const openOutgoingCallConfirm = useCallback((peerUserId: string, kind: "voice" | "video") => {
    const fromFriend = sortedFriends.find((f) => f.id === peerUserId)?.label?.trim();
    const room = data?.chats?.find((r) => r.roomType === "direct" && r.peerUserId === peerUserId);
    const peerLabel = fromFriend || room?.title?.trim() || "대화 상대";
    setOutgoingCallConfirm({ peerUserId, peerLabel, kind });
  }, [sortedFriends, data?.chats]);

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
  const selectedGroupFriends = useMemo(() => {
    const friendMap = new Map(
      [...(data?.friends ?? []), ...(data?.hidden ?? [])].map((friend) => [friend.id, friend] as const)
    );
    return groupMembers.map((id) => friendMap.get(id)).filter((friend): friend is CommunityMessengerProfileLite => Boolean(friend));
  }, [data?.friends, data?.hidden, groupMembers]);
  const groupTitlePreview = useMemo(() => {
    const explicitTitle = groupTitle.trim();
    if (explicitTitle) return explicitTitle;
    if (selectedGroupFriends.length === 0) return "";
    const labels = selectedGroupFriends.map((friend) => friend.label).filter(Boolean).slice(0, 3);
    if (groupMembers.length > labels.length) return `${labels.join(", ")} 외 ${groupMembers.length - labels.length}명`;
    return labels.join(", ");
  }, [groupMembers.length, groupTitle, selectedGroupFriends]);

  const notificationCenterItemsAll = useMemo<MessengerNotificationCenterItem[]>(() => {
    const requestItems: MessengerNotificationCenterItem[] = (data?.requests ?? [])
      .filter((request) => request.direction === "incoming")
      .map((request) => ({
        id: `request:${request.id}`,
        kind: "request",
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
    return [...requestItems, ...missedCallItems, ...importantRoomItems].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [baseChatListItems, data?.requests, sortedCalls]);
  const notificationCenterItems = useMemo(
    () => notificationCenterItemsAll.filter((item) => !dismissedNotificationIds.includes(item.id)),
    [dismissedNotificationIds, notificationCenterItemsAll]
  );
  const notificationCenterSummary = useMemo(
    () => ({
      requestCount: notificationCenterItems.filter((item) => item.kind === "request").length,
      missedCallCount: notificationCenterItems.filter((item) => item.kind === "missed_call").length,
      importantCount: notificationCenterItems.filter((item) => item.kind === "important_room").length,
    }),
    [notificationCenterItems]
  );
  const updateRoomSummaryState = useCallback(
    (roomId: string, updater: (room: CommunityMessengerRoomSummary) => CommunityMessengerRoomSummary) => {
      setData((prev) => {
        if (!prev) return prev;
        const apply = (rooms: CommunityMessengerRoomSummary[]) =>
          rooms.map((room) => (room.id === roomId ? updater(room) : room));
        return {
          ...prev,
          chats: apply(prev.chats),
          groups: apply(prev.groups),
        };
      });
    },
    []
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
      const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
      try {
        const res = await fetch(communityMessengerRoomResourcePath(roomId), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "mark_read" }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          setActionError(getMessengerActionErrorMessage(json.error ?? "room_read_failed"));
          return;
        }
        applyRoomReadEvent({
          viewerUserId: data?.me?.id ?? null,
          roomId,
          lastReadMessageId: null,
        });
        postCommunityMessengerBusEvent({
          type: "cm.room.read",
          roomId,
          viewerUserId: data?.me?.id ?? "",
          at: Date.now(),
          lastReadMessageId: null,
        });
        updateRoomSummaryState(roomId, (room) => ({ ...room, unreadCount: 0 }));
        if (typeof performance !== "undefined") {
          messengerMonitorUnreadListSync(roomId, Math.round(performance.now() - t0), "mark_read");
        }
      } finally {
        setBusyId(null);
      }
    },
    [data?.me?.id, getMessengerActionErrorMessage, updateRoomSummaryState]
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

  const getFriendDirectRoomKindStable = useCallback(
    (userId: string) => directRoomByPeerId.get(userId)?.contextMeta?.kind ?? null,
    [directRoomByPeerId]
  );

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

  const onPreviewOpenGroupStable = useCallback(
    (groupId: string) => {
      resetMessengerTransientUi();
      void openJoinModal(groupId);
    },
    [resetMessengerTransientUi, openJoinModal]
  );

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
      setActionError("설정 백업 파일을 만들지 못했습니다.");
    }
  }, [incomingCallBannerEnabled, incomingCallSoundEnabled, localSettings, notificationSettings, recentSearches]);
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
          setActionError("메신저 설정 백업 형식이 올바르지 않습니다.");
          return;
        }
        await importSettingsBackup(parsed as CommunityMessengerSettingsBackup);
      } catch {
        setActionError("설정 백업을 불러오지 못했습니다.");
      }
    },
    [importSettingsBackup]
  );
  const removeFriend = useCallback(
    async (friendUserId: string, options?: { confirm?: boolean }) => {
      const shouldConfirm = options?.confirm !== false;
      if (shouldConfirm && !window.confirm("이 친구를 삭제할까요? 친구 관계만 해제되고 기존 채팅방은 유지됩니다.")) {
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
    [getMessengerActionErrorMessage]
  );

  const reportCommunityUser = useCallback(async (userId: string) => {
    const detail = window.prompt("신고 내용을 입력해 주세요.")?.trim() ?? "";
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
        showMessengerSnackbar("접수되었습니다.", { variant: "success" });
        setFriendSheet(null);
      } else {
        setActionError("신고 접수에 실패했습니다.");
      }
    } finally {
      setBusyId(null);
    }
  }, []);

  const reportCommunityRoom = useCallback(async (roomId: string) => {
    const detail = window.prompt("신고 내용을 입력해 주세요.")?.trim() ?? "";
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
        showMessengerSnackbar("접수되었습니다.", { variant: "success" });
        setRoomActionSheet(null);
      } else {
        setActionError("신고 접수에 실패했습니다.");
      }
    } finally {
      setBusyId(null);
    }
  }, []);

  const leaveMessengerRoom = useCallback(
    async (roomId: string) => {
      if (!window.confirm(t("nav_messenger_leave_group_confirm"))) return;
      setBusyId(`room-leave:${roomId}`);
      setActionError(null);
      try {
        const res = await fetch(`${communityMessengerRoomResourcePath(roomId)}/leave`, { method: "POST" });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (res.ok && json.ok) {
          setRoomActionSheet(null);
          void refresh(true);
        } else {
          setActionError(getMessengerActionErrorMessage(json.error ?? "leave_failed"));
        }
      } finally {
        setBusyId(null);
      }
    },
    [getMessengerActionErrorMessage, refresh, t]
  );

  const clearLocalRoomPreview = useCallback((roomId: string) => {
    invalidateRoomSnapshot(roomId);
    setRoomActionSheet(null);
    showMessengerSnackbar("이 기기에서 미리보기 캐시만 정리했습니다.");
  }, []);

  return (
    <div
      data-messenger-shell
      className="min-h-0 space-y-3 bg-[color:var(--messenger-bg)] px-3 py-2 pb-[calc(7rem+env(safe-area-inset-bottom,0px))] text-[color:var(--messenger-text)]"
    >
      <CommunityMessengerHomeListPane
        loading={loading}
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
        friendStateModel={friendStateModel}
        busyId={busyId}
        onOpenFriendsPrivacySummary={onOpenFriendsPrivacySummaryStable}
        onOpenProfile={onOpenProfileForMessengerMainStable}
        toggleFavoriteFriend={(userId) => void toggleFavoriteFriend(userId)}
        toggleHiddenFriend={(userId) => void toggleHiddenFriend(userId)}
        removeFriend={(userId) => void removeFriend(userId)}
        toggleBlock={(userId) => void toggleBlock(userId)}
        startDirectRoom={(userId) => void startDirectRoom(userId)}
        onFriendRowVoiceCallStable={onFriendRowVoiceCallStable}
        onFriendRowVideoCallStable={onFriendRowVideoCallStable}
        getFriendDirectRoomMutedStable={getFriendDirectRoomMutedStable}
        getFriendDirectRoomKindStable={getFriendDirectRoomKindStable}
        friendNotificationsBusyStable={friendNotificationsBusyStable}
        onFriendToggleRoomMuteStable={onFriendToggleRoomMuteStable}
        friendHasDirectRoomStable={friendHasDirectRoomStable}
        primaryListItems={primaryListItems}
        favoriteFriendIds={favoriteFriendIds}
        handleMessengerHomeTogglePin={handleMessengerHomeTogglePin}
        handleMessengerHomeToggleMute={handleMessengerHomeToggleMute}
        handleMessengerHomeMarkRoomRead={handleMessengerHomeMarkRoomRead}
        handleMessengerHomeToggleRoomArchive={handleMessengerHomeToggleRoomArchive}
        openRoomActions={openRoomActions}
        chatInboxFilter={chatInboxFilter}
        chatKindFilter={chatKindFilter}
        onChatListChipChange={onChatListChipChange}
        openChatJoinedItems={openChatJoinedItems}
        filteredDiscoverableGroups={filteredDiscoverableGroups}
        onPreviewOpenGroupStable={onPreviewOpenGroupStable}
        incomingRequestCount={incomingRequestCount}
        incomingFriendRequestPopup={incomingFriendRequestPopup}
        setIncomingFriendRequestPopup={setIncomingFriendRequestPopup}
        respondRequest={respondRequest}
        pageError={pageError}
        loginRequiredText={t("nav_messenger_login_required")}
        retryText={t("common_try_again_later")}
        onRetry={() => void refresh()}
      />

      {outgoingCallConfirm ? (
        <MessengerOutgoingCallConfirmDialog
          open
          peerLabel={outgoingCallConfirm.peerLabel}
          kind={outgoingCallConfirm.kind}
          busy={busyId === "messenger-outgoing-call"}
          onCancel={() => setOutgoingCallConfirm(null)}
          onConfirm={() => {
            const next = outgoingCallConfirm;
            setOutgoingCallConfirm(null);
            startDirectCall(next.peerUserId, next.kind);
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
          onFriendAdd={data?.me?.id ? () => void requestFriend(friendProfileForSheet.id) : undefined}
          onFriendCancelOutgoing={data?.me?.id ? (requestId: string) => void respondRequest(requestId, "cancel") : undefined}
          onFriendAcceptIncoming={data?.me?.id ? (requestId: string) => void respondRequest(requestId, "accept") : undefined}
          onFriendRejectIncoming={data?.me?.id ? (requestId: string) => void respondRequest(requestId, "reject") : undefined}
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
            navigateToCommunityRoom(id);
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
                  router.push(`/community-messenger/rooms/${encodeURIComponent(id)}?sheet=info`);
                }
              : undefined
          }
          onViewOpenChatInfo={
            roomActionSheet.item.room.roomType === "open_group"
              ? () => {
                  const id = roomActionSheet.item.room.id;
                  setRoomActionSheet(null);
                  router.push(`/community-messenger/rooms/${encodeURIComponent(id)}?sheet=info`);
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
          onLeave={
            roomActionSheet.item.room.roomType === "private_group" || roomActionSheet.item.room.roomType === "open_group"
              ? () => {
                  setRoomActionSheet(null);
                  setOpenedMenuItemId((current) => (current?.startsWith("room:menu:") ? null : current));
                  void leaveMessengerRoom(roomActionSheet.item.room.id);
                }
              : undefined
          }
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
          busyId={busyId}
          onTogglePin={handleMessengerHomeTogglePin}
          onToggleMute={handleMessengerHomeToggleMute}
          onMarkRead={handleMessengerHomeMarkRoomRead}
          onToggleArchive={handleMessengerHomeToggleRoomArchive}
          onSelectFriend={(friend) => setFriendSheet({ mode: "profile", profile: friend })}
          onSelectOpenGroup={(groupId) => void openJoinModal(groupId)}
          onSelectMessageRoom={(roomId) => navigateToCommunityRoom(roomId)}
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
          onSearchUsers={searchUsers}
          friendUserSearchAttempted={friendUserSearchAttempted}
          searchResults={searchResults}
          viewerUserId={data.me?.id ?? null}
          friendRequests={data.requests ?? []}
          busyId={busyId}
          onOpenProfile={(profile) => setFriendSheet({ mode: "profile", profile })}
          onPrefetchDirectRoom={(userId) => maybePrefetchDirectRoom(userId)}
          onRequestFriend={(userId) => void requestFriend(userId)}
          onCancelOutgoingFriendRequest={(requestId) => void respondRequest(requestId, "cancel")}
          onRespondIncomingFriendRequest={(requestId, action) => void respondRequest(requestId, action)}
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
              navigateToCommunityRoom(call.roomId);
            }
          }}
          onOpenImportantRoom={(roomId) => navigateToCommunityRoom(roomId)}
          onDismissNotification={dismissNotification}
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
        <div className="fixed inset-0 z-[43] flex flex-col justify-end bg-black/30">
          <button
            type="button"
            className="min-h-0 flex-1 cursor-default"
            aria-label="닫기"
            onClick={() => closeHomeOverlay("public-group-find")}
          />
          <div className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-[14px] border border-sam-border bg-sam-surface shadow-[0_-4px_14px_rgba(17,24,39,0.05)]">
            <div className="flex shrink-0 items-center justify-between border-b border-sam-border-soft px-4 py-3.5">
              <p className="text-[17px] font-semibold text-sam-fg">오픈채팅 찾기</p>
              <button
                type="button"
                className="rounded-ui-rect px-3 py-1.5 text-[15px] text-sam-muted"
                onClick={() => closeHomeOverlay("public-group-find")}
              >
                닫기
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
              <input
                value={openGroupSearch}
                onChange={(e) => setOpenGroupSearch(e.target.value)}
                placeholder="오픈채팅 검색"
                className="h-11 w-full rounded-ui-rect border border-sam-border px-3 text-[14px] outline-none focus:border-sam-border"
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
                  <div className="py-10 text-center text-[13px] text-sam-muted">검색 결과가 없습니다.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {groupCreateStep !== "closed" ? (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/30 px-4 pb-6 pt-10">
          <div className="w-full max-w-[520px] rounded-ui-rect border border-sam-border bg-sam-surface p-5 shadow-[0_8px_20px_rgba(17,24,39,0.06)]">
            {groupCreateStep === "select" ? (
              <>
                <p className="text-[13px] font-medium text-sam-fg">그룹 생성</p>
                <h2 className="mt-1 text-[20px] font-semibold text-sam-fg">어떤 그룹을 만들까요?</h2>
                <div className="mt-4 grid gap-3">
                  <button
                    type="button"
                    onClick={() => setGroupCreateStep("private_group")}
                    className="rounded-ui-rect border border-sam-border px-4 py-4 text-left transition hover:border-sam-border hover:bg-sam-app"
                  >
                    <p className="text-[12px] text-sam-muted">친구 초대형</p>
                    <p className="mt-1 text-[16px] font-semibold text-sam-fg">비공개 그룹</p>
                    <p className="mt-1 text-[13px] text-sam-muted">친구를 선택해 바로 만드는 초대형 그룹입니다.</p>
                  </button>
                </div>
              </>
            ) : null}

            {groupCreateStep === "private_group" ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-medium text-sam-fg">비공개 그룹</p>
                    <h2 className="mt-1 text-[20px] font-semibold text-sam-fg">친구 초대형 그룹 만들기</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setGroupCreateStep("closed")}
                    className="rounded-ui-rect border border-sam-border px-3 py-2 text-[12px] text-sam-fg"
                  >
                    닫기
                  </button>
                </div>
                <input
                  value={groupTitle}
                  onChange={(e) => setGroupTitle(e.target.value)}
                  placeholder="예: 사마켓 운영팀 (선택 입력)"
                  className="mt-4 h-11 w-full rounded-ui-rect border border-sam-border px-3 text-[14px] outline-none focus:border-sam-border"
                />
                <div className="mt-3 flex items-center justify-between gap-3 text-[12px] text-sam-muted">
                  <span>선택된 친구 {groupMembers.length}명</span>
                  {groupMembers.length ? (
                    <button
                      type="button"
                      onClick={() => setGroupMembers([])}
                      className="rounded-ui-rect border border-sam-border px-3 py-1.5 text-[12px] font-medium text-sam-fg"
                    >
                      선택 해제
                    </button>
                  ) : null}
                </div>
                {groupTitlePreview ? (
                  <div className="mt-3 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-[12px] text-sam-muted">
                    생성 예정 그룹명: <span className="font-semibold text-sam-fg">{groupTitlePreview}</span>
                  </div>
                ) : null}
                <div className="mt-3 max-h-[280px] space-y-2 overflow-y-auto">
                  {groupSelectableFriends.map((friend) => {
                    const checked = groupMembers.includes(friend.id);
                    const hiddenSelected = Boolean(friend.isHiddenFriend);
                    const friendHelper = hiddenSelected
                      ? [friend.subtitle, "숨김 친구"].filter(Boolean).join(" · ")
                      : (friend.subtitle ?? "친구");
                    return (
                      <label key={friend.id} className="flex items-center justify-between rounded-ui-rect border border-sam-border-soft px-3 py-3">
                        <div>
                          <p className="text-[14px] font-medium text-sam-fg">{friend.label}</p>
                          <p className="text-[12px] text-sam-muted">{friendHelper}</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setGroupMembers((prev) =>
                              e.target.checked ? [...prev, friend.id] : prev.filter((id) => id !== friend.id)
                            );
                          }}
                          className="h-4 w-4 rounded border-sam-border text-sam-fg focus:ring-sam-border"
                        />
                      </label>
                    );
                  })}
                </div>
                {groupSelectableFriends.length === 0 ? (
                  <div className="mt-4 rounded-ui-rect border border-dashed border-sam-border bg-sam-surface px-4 py-5 text-center">
                    <p className="text-[14px] font-semibold text-sam-fg">초대할 친구가 아직 없습니다.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setGroupCreateStep("closed");
                        setFriendManagerOpen(true);
                        requestAnimationFrame(() => friendSearchRef.current?.focus());
                      }}
                      className="mt-3 rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 text-[13px] font-semibold text-sam-fg"
                    >
                      친구 탭으로 이동
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}

            {groupCreateStep === "open_group" ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-medium text-[#111827]">오픈채팅</p>
                    <h2 className="mt-1 text-[20px] font-semibold text-sam-fg">방장 설정형 그룹 만들기</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setGroupCreateStep("select")}
                    className="rounded-ui-rect border border-sam-border px-3 py-2 text-[12px] text-sam-fg"
                  >
                    이전
                  </button>
                </div>
                <div className="mt-4 grid gap-3">
                  <input
                    value={openGroupTitle}
                    onChange={(e) => setOpenGroupTitle(e.target.value)}
                    placeholder="오픈채팅 제목"
                    className="h-11 w-full rounded-ui-rect border border-sam-border px-3 text-[14px] outline-none focus:border-sam-border"
                  />
                  <textarea
                    value={openGroupSummary}
                    onChange={(e) => setOpenGroupSummary(e.target.value)}
                    rows={3}
                    placeholder="방 소개를 입력하세요"
                    className="w-full rounded-ui-rect border border-sam-border px-3 py-3 text-[14px] outline-none focus:border-sam-border"
                  />
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="rounded-ui-rect border border-sam-border-soft px-3 py-3">
                      <p className="text-[13px] font-semibold text-sam-fg">입장 방식</p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setOpenGroupJoinPolicy("password")}
                          className={`rounded-ui-rect border px-3 py-2 text-[12px] font-semibold ${openGroupJoinPolicy === "password" ? "border-sam-border bg-sam-surface-muted text-sam-fg" : "border-sam-border bg-sam-surface text-sam-muted"}`}
                        >
                          비밀번호
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenGroupJoinPolicy("free");
                            setOpenGroupPassword("");
                          }}
                          className={`rounded-ui-rect border px-3 py-2 text-[12px] font-semibold ${openGroupJoinPolicy === "free" ? "border-sam-border bg-sam-surface-muted text-sam-fg" : "border-sam-border bg-sam-surface text-sam-muted"}`}
                        >
                          자유 입장
                        </button>
                      </div>
                    </label>
                    <label className="rounded-ui-rect border border-sam-border-soft px-3 py-3">
                      <p className="text-[13px] font-semibold text-sam-fg">신원 정책</p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setOpenGroupIdentityPolicy("real_name");
                            setOpenGroupCreatorIdentityMode("real_name");
                          }}
                          className={`rounded-ui-rect border px-3 py-2 text-[12px] font-semibold ${openGroupIdentityPolicy === "real_name" ? "border-sam-border bg-sam-surface-muted text-sam-fg" : "border-sam-border bg-sam-surface text-sam-muted"}`}
                        >
                          실명 기반
                        </button>
                        <button
                          type="button"
                          onClick={() => setOpenGroupIdentityPolicy("alias_allowed")}
                          className={`rounded-ui-rect border px-3 py-2 text-[12px] font-semibold ${openGroupIdentityPolicy === "alias_allowed" ? "border-sam-border bg-sam-surface-muted text-sam-fg" : "border-sam-border bg-sam-surface text-sam-muted"}`}
                        >
                          별칭 허용
                        </button>
                      </div>
                    </label>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {openGroupJoinPolicy === "password" ? (
                      <input
                        value={openGroupPassword}
                        onChange={(e) => setOpenGroupPassword(e.target.value)}
                        placeholder="입장 비밀번호"
                        className="h-11 w-full rounded-ui-rect border border-sam-border px-3 text-[14px] outline-none focus:border-sam-border"
                      />
                    ) : (
                      <div className="flex h-11 items-center rounded-ui-rect bg-sam-app px-3 text-[13px] text-sam-muted">
                        자유 입장 선택됨
                      </div>
                    )}
                    <input
                      value={openGroupMemberLimit}
                      onChange={(e) => setOpenGroupMemberLimit(e.target.value.replace(/[^0-9]/g, ""))}
                      placeholder="최대 인원"
                      className="h-11 w-full rounded-ui-rect border border-sam-border px-3 text-[14px] outline-none focus:border-sam-border"
                    />
                  </div>
                  <label className="flex items-center justify-between rounded-ui-rect border border-sam-border-soft px-3 py-3">
                    <div>
                      <p className="text-[14px] font-medium text-sam-fg">목록에 공개</p>
                      <p className="text-[12px] text-sam-muted">OFF면 내 목록에는 남지만 오픈채팅 찾기에는 노출되지 않습니다.</p>
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
                          className={`rounded-ui-rect border px-3 py-2 text-[12px] font-semibold ${openGroupCreatorIdentityMode === "real_name" ? "border-sam-border bg-sam-surface-muted text-sam-fg" : "border-sam-border bg-sam-surface text-sam-muted"}`}
                        >
                          방장도 실명 사용
                        </button>
                        <button
                          type="button"
                          onClick={() => setOpenGroupCreatorIdentityMode("alias")}
                          className={`rounded-ui-rect border px-3 py-2 text-[12px] font-semibold ${openGroupCreatorIdentityMode === "alias" ? "border-sam-border bg-sam-surface-muted text-sam-fg" : "border-sam-border bg-sam-surface text-sam-muted"}`}
                        >
                          방장 별칭 사용
                        </button>
                      </div>
                      {openGroupCreatorIdentityMode === "alias" ? (
                        <div className="mt-3 grid gap-3">
                          <input
                            value={openGroupCreatorAliasName}
                            onChange={(e) => setOpenGroupCreatorAliasName(e.target.value)}
                            placeholder="방장 별칭 닉네임"
                            className="h-11 w-full rounded-ui-rect border border-sam-border px-3 text-[14px] outline-none focus:border-sam-border"
                          />
                          <input
                            value={openGroupCreatorAliasAvatarUrl}
                            onChange={(e) => setOpenGroupCreatorAliasAvatarUrl(e.target.value)}
                            placeholder="아바타 URL (선택)"
                            className="h-11 w-full rounded-ui-rect border border-sam-border px-3 text-[14px] outline-none focus:border-sam-border"
                          />
                          <textarea
                            value={openGroupCreatorAliasBio}
                            onChange={(e) => setOpenGroupCreatorAliasBio(e.target.value)}
                            rows={2}
                            placeholder="방장 소개 (선택)"
                            className="w-full rounded-ui-rect border border-sam-border px-3 py-3 text-[14px] outline-none focus:border-sam-border"
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
                className="flex-1 rounded-ui-rect border border-sam-border px-4 py-3 text-[14px] font-medium text-sam-fg"
              >
                닫기
              </button>
              {groupCreateStep === "private_group" ? (
                <button
                  type="button"
                  onClick={() => void createPrivateGroup()}
                  disabled={busyId === "create-private-group" || groupMembers.length === 0}
                  className="flex-1 rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 text-[14px] font-semibold text-sam-fg disabled:opacity-40"
                >
                  {busyId === "create-private-group" ? "생성 중..." : "비공개 그룹 생성"}
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
                  className="flex-1 rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 text-[14px] font-semibold text-sam-fg disabled:opacity-40"
                >
                  {busyId === "create-open-group" ? "생성 중..." : "오픈채팅 생성"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {joinTargetGroup ? (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/30 px-4 pb-6 pt-10">
          <div className="w-full max-w-[440px] rounded-ui-rect border border-sam-border bg-sam-surface p-5 shadow-[0_8px_20px_rgba(17,24,39,0.06)]">
            <p className="text-[13px] font-medium text-sam-fg">오픈채팅 입장</p>
            <h2 className="mt-1 text-[20px] font-semibold text-sam-fg">{joinTargetGroup.title}</h2>
            <p className="mt-2 text-[13px] leading-5 text-sam-muted">
              {joinTargetGroup.summary || "입장 정보를 확인하세요."}
            </p>
            <div className="mt-4 rounded-ui-rect bg-sam-app px-4 py-3 text-[12px] text-sam-muted">
              방장 {joinTargetGroup.ownerLabel} · 현재 {joinTargetGroup.memberCount}명
              {joinTargetGroup.memberLimit ? ` / 최대 ${joinTargetGroup.memberLimit}명` : ""}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
              <span className="rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1 text-sam-muted">
                {joinTargetGroup.joinPolicy === "password" ? "비밀번호 입장" : "자유 입장"}
              </span>
              <span className="rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1 text-sam-muted">
                {joinTargetGroup.identityPolicy === "alias_allowed" ? "별칭 참여 허용" : "실명 기반"}
              </span>
            </div>
            {joinTargetGroup.joinPolicy === "password" ? (
              <input
                value={joinPassword}
                onChange={(e) => setJoinPassword(e.target.value)}
                placeholder="비밀번호 입력"
                className="mt-4 h-11 w-full rounded-ui-rect border border-sam-border px-3 text-[14px] outline-none focus:border-sam-border"
              />
            ) : null}
            <div className="mt-4 rounded-ui-rect border border-sam-border-soft px-4 py-4">
              <p className="text-[13px] font-semibold text-sam-fg">표시 이름 선택</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setJoinIdentityMode("real_name")}
                  className={`rounded-ui-rect border px-3 py-2 text-[12px] font-semibold ${joinIdentityMode === "real_name" ? "border-sam-border bg-sam-surface-muted text-sam-fg" : "border-sam-border bg-sam-surface text-sam-muted"}`}
                >
                  실명 프로필
                </button>
                {joinTargetGroup.identityPolicy === "alias_allowed" ? (
                  <button
                    type="button"
                    onClick={() => setJoinIdentityMode("alias")}
                    className={`rounded-ui-rect border px-3 py-2 text-[12px] font-semibold ${joinIdentityMode === "alias" ? "border-sam-border bg-sam-surface-muted text-sam-fg" : "border-sam-border bg-sam-surface text-sam-muted"}`}
                  >
                    방별 별칭
                  </button>
                ) : null}
              </div>
              {joinIdentityMode === "alias" && joinTargetGroup.identityPolicy === "alias_allowed" ? (
                <div className="mt-3 grid gap-3">
                  <input
                    value={joinAliasName}
                    onChange={(e) => setJoinAliasName(e.target.value)}
                    placeholder="별칭 닉네임"
                    className="h-11 w-full rounded-ui-rect border border-sam-border px-3 text-[14px] outline-none focus:border-sam-border"
                  />
                  <input
                    value={joinAliasAvatarUrl}
                    onChange={(e) => setJoinAliasAvatarUrl(e.target.value)}
                    placeholder="아바타 URL (선택)"
                    className="h-11 w-full rounded-ui-rect border border-sam-border px-3 text-[14px] outline-none focus:border-sam-border"
                  />
                  <textarea
                    value={joinAliasBio}
                    onChange={(e) => setJoinAliasBio(e.target.value)}
                    rows={2}
                    placeholder="소개 (선택)"
                    className="w-full rounded-ui-rect border border-sam-border px-3 py-3 text-[14px] outline-none focus:border-sam-border"
                  />
                </div>
              ) : null}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={closeJoinOpenGroupModal}
                className="flex-1 rounded-ui-rect border border-sam-border px-4 py-3 text-[14px] font-medium text-sam-fg"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void joinOpenGroup()}
                disabled={
                  busyId === `join-open-group:${joinTargetGroup.id}` ||
                  (joinTargetGroup.joinPolicy === "password" && !joinPassword.trim()) ||
                  (joinIdentityMode === "alias" && !joinAliasName.trim())
                }
                className="flex-1 rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 text-[14px] font-semibold text-sam-fg disabled:opacity-40"
              >
                {busyId === `join-open-group:${joinTargetGroup.id}` ? "입장 중..." : "이 그룹에 입장"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {!loading && !authRequired ? (
        <button
          type="button"
          onClick={() => (mainSection === "friends" ? setFriendManagerOpen(true) : openHomeOverlay("composer"))}
          className={`fixed ${BOTTOM_NAV_FAB_LAYOUT.bottomOffsetClass} right-4 z-[41] flex h-14 w-14 items-center justify-center rounded-ui-rect border border-[color:var(--messenger-primary-soft-2)] bg-[color:var(--messenger-primary)] text-white shadow-[var(--messenger-shadow-soft)] transition active:scale-[0.98] active:opacity-90`}
          aria-label={mainSection === "friends" ? "친구 추가" : "새 대화"}
        >
          <MessengerHomeFabPlusIcon className="h-6 w-6" />
        </button>
      ) : null}
    </div>
  );
}
