"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { CommunityMessengerHeaderActions } from "@/components/community-messenger/CommunityMessengerHeaderActions";
import { MessengerHomeMainSections } from "@/components/community-messenger/MessengerHomeMainSections";
import type { MessengerFriendAddTab } from "@/components/community-messenger/MessengerFriendAddSheet";
import {
  resolveImportantRoomHighlightReason,
  type MessengerNotificationCenterItem,
} from "@/lib/community-messenger/messenger-notification-center-model";

const MessengerIncomingFriendRequestPopup = dynamic(
  () =>
    import("@/components/community-messenger/MessengerIncomingFriendRequestPopup").then(
      (m) => m.MessengerIncomingFriendRequestPopup
    ),
  { ssr: false, loading: () => null }
);
const MessengerFriendProfileSheet = dynamic(
  () =>
    import("@/components/community-messenger/MessengerFriendProfileSheet").then((m) => m.MessengerFriendProfileSheet),
  { ssr: false, loading: () => null }
);
const MessengerChatRoomActionSheet = dynamic(
  () =>
    import("@/components/community-messenger/MessengerChatRoomActionSheet").then((m) => m.MessengerChatRoomActionSheet),
  { ssr: false, loading: () => null }
);
const MessengerFriendsPrivacySheet = dynamic(
  () =>
    import("@/components/community-messenger/MessengerFriendsPrivacySheet").then((m) => m.MessengerFriendsPrivacySheet),
  { ssr: false, loading: () => null }
);
const MessengerSearchSheet = dynamic(
  () => import("@/components/community-messenger/MessengerSearchSheet").then((m) => m.MessengerSearchSheet),
  { ssr: false, loading: () => null }
);
const MessengerNewConversationSheet = dynamic(
  () =>
    import("@/components/community-messenger/MessengerNewConversationSheet").then((m) => m.MessengerNewConversationSheet),
  { ssr: false, loading: () => null }
);
const MessengerFriendAddSheet = dynamic(
  () => import("@/components/community-messenger/MessengerFriendAddSheet").then((m) => m.MessengerFriendAddSheet),
  { ssr: false, loading: () => null }
);
const MessengerNotificationCenterSheet = dynamic(
  () =>
    import("@/components/community-messenger/MessengerNotificationCenterSheet").then(
      (m) => m.MessengerNotificationCenterSheet
    ),
  { ssr: false, loading: () => null }
);
const MessengerSettingsSheet = dynamic(
  () => import("@/components/community-messenger/MessengerSettingsSheet").then((m) => m.MessengerSettingsSheet),
  { ssr: false, loading: () => null }
);
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
import {
  messengerMonitorHomeBootstrapUnreadSync,
  messengerMonitorUnreadListSync,
} from "@/lib/community-messenger/monitoring/client";
import { fetchCommunityMessengerHomeSilentLists } from "@/lib/community-messenger/cm-home-silent-lists-fetch";
import { useCommunityMessengerHomeRealtime } from "@/lib/community-messenger/use-community-messenger-realtime";
import {
  clearBootstrapCache,
  peekBootstrapCache,
  primeBootstrapCache,
} from "@/lib/community-messenger/bootstrap-cache";
import { buildCommunityMessengerOutgoingDialHref } from "@/lib/community-messenger/call-session-navigation-seed";
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
import {
  cancelScheduledWhenBrowserIdle,
  scheduleWhenBrowserIdle,
} from "@/lib/ui/network-policy";
import { defaultTradeChatRoomHref } from "@/lib/chats/trade-chat-notification-href";
import { BOTTOM_NAV_FAB_LAYOUT } from "@/lib/main-menu/bottom-nav-config";
import {
  type MessengerChatInboxFilter,
  type MessengerChatKindFilter,
  type MessengerChatListChip,
  type MessengerChatListContext,
  type MessengerMainSection,
  chipToInboxKind,
  messengerChatFiltersToSearchParams,
  resolveMessengerChatFilters,
  resolveMessengerSection,
} from "@/lib/community-messenger/messenger-ia";
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
  type UnifiedRoomListItem,
  useCommunityMessengerHomeState,
} from "@/lib/community-messenger/use-community-messenger-home-state";

type MessengerNotificationSettings = {
  trade_chat_enabled: boolean;
  community_chat_enabled: boolean;
  order_enabled: boolean;
  store_enabled: boolean;
  sound_enabled: boolean;
  vibration_enabled: boolean;
};

const RECENT_SEARCHES_STORAGE_KEY = "samarket:communityMessenger:recentSearches";
const CM_NOTIFICATION_DISMISSED_IDS_KEY = "samarket:cm_notification_dismissed_ids";

function readDismissedNotificationIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CM_NOTIFICATION_DISMISSED_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

function writeDismissedNotificationIds(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CM_NOTIFICATION_DISMISSED_IDS_KEY, JSON.stringify(ids));
  } catch {
    /* ignore quota */
  }
}

type CommunityMessengerSettingsBackup = {
  version: 1;
  exportedAt: string;
  notificationSettings: MessengerNotificationSettings;
  incomingCallSoundEnabled: boolean;
  incomingCallBannerEnabled: boolean;
  localSettings: CommunityMessengerLocalSettings;
  recentSearches: string[];
  devices: {
    audioDeviceId: string | null;
    videoDeviceId: string | null;
  };
};

type FriendSheetState = { mode: "profile"; profile: CommunityMessengerProfileLite };

export function CommunityMessengerHome({
  initialTab,
  initialSection,
  initialFilter,
  initialKind,
  /** RSC에서 `getCommunityMessengerBootstrap` — 첫 `/api/.../bootstrap` 왕복 제거 */
  initialServerBootstrap = null,
}: {
  initialTab?: string;
  initialSection?: string;
  initialFilter?: string;
  initialKind?: string;
  initialServerBootstrap?: CommunityMessengerBootstrap | null;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const navigateToCommunityRoom = useCallback(
    (roomId: string) => {
      const id = String(roomId ?? "").trim();
      if (!id) return;
      void prefetchCommunityMessengerRoomSnapshot(id);
      router.push(`/community-messenger/rooms/${encodeURIComponent(id)}`);
    },
    [router]
  );
  const searchParams = useSearchParams();
  const loadedRef = useRef(false);
  /** 언어 전환 시에도 부트스트랩 effect 가 재실행되지 않도록 번역 함수만 최신으로 유지 */
  const tRef = useRef(t);
  tRef.current = t;
  const silentRefreshBusyRef = useRef(false);
  const silentRefreshAgainRef = useRef(false);
  /** 발신 다이얼 `router.push` 동기 연타 방지 */
  const outgoingDialSyncGuardRef = useRef(false);
  const setMainTier1Extras = useSetMainTier1ExtrasOptional();
  const [composerOpen, setComposerOpen] = useState(false);
  const [requestSheetOpen, setRequestSheetOpen] = useState(false);
  const [friendManagerOpen, setFriendManagerOpen] = useState(false);
  const [friendAddTab, setFriendAddTab] = useState<MessengerFriendAddTab>("id");
  const [friendUserSearchAttempted, setFriendUserSearchAttempted] = useState(false);
  const [searchSheetOpen, setSearchSheetOpen] = useState(false);
  const [friendSheet, setFriendSheet] = useState<FriendSheetState | null>(null);
  const friendSearchRef = useRef<HTMLInputElement | null>(null);
  const [settingsSheetOpen, setSettingsSheetOpen] = useState(initialTab === "settings");
  const [publicGroupFindOpen, setPublicGroupFindOpen] = useState(false);
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
  const [friendsPrivacySheetOpen, setFriendsPrivacySheetOpen] = useState(false);
  const [roomActionSheet, setRoomActionSheet] = useState<{
    item: UnifiedRoomListItem;
    listContext: MessengerChatListContext;
  } | null>(null);
  const replaceMessengerSectionUrl = useCallback(
    (section: MessengerMainSection, inbox: MessengerChatInboxFilter, kind: MessengerChatKindFilter) => {
      const qs = new URLSearchParams();
      qs.set("section", section);
      if (section === "chats") {
        const extra = messengerChatFiltersToSearchParams(inbox, kind);
        extra.forEach((v, k) => qs.set(k, v));
      }
      router.replace(`/community-messenger?${qs.toString()}`, { scroll: false });
    },
    [router]
  );
  const onPrimarySectionChange = useCallback(
    (next: MessengerMainSection) => {
      setMainSection(next);
      if (next === "chats") {
        replaceMessengerSectionUrl("chats", chatInboxFilter, chatKindFilter);
      } else {
        const qs = new URLSearchParams();
        qs.set("section", next);
        router.replace(`/community-messenger?${qs.toString()}`, { scroll: false });
      }
    },
    [chatInboxFilter, chatKindFilter, replaceMessengerSectionUrl, router]
  );
  const onChatListChipChange = useCallback(
    (chip: MessengerChatListChip) => {
      const { inbox, kind } = chipToInboxKind(chip);
      setChatInboxFilter(inbox);
      setChatKindFilter(kind);
      replaceMessengerSectionUrl("chats", inbox, kind);
    },
    [replaceMessengerSectionUrl]
  );
  const [data, setData] = useState<CommunityMessengerBootstrap | null>(() => initialServerBootstrap ?? null);
  const [loading, setLoading] = useState(() => !initialServerBootstrap);
  const [authRequired, setAuthRequired] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
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
  const [incomingCallSoundEnabled, setIncomingCallSoundEnabled] = useState(true);
  const [incomingCallBannerEnabled, setIncomingCallBannerEnabled] = useState(true);
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

  const getMessengerActionErrorMessage = useCallback((error?: string) => {
    switch (error) {
      case "bad_peer":
        return t("nav_messenger_direct_target_invalid");
      case "blocked_target":
        return t("nav_messenger_blocked_target");
      case "friend_required":
        return t("nav_messenger_friend_required");
      case "title_required":
        return t("nav_messenger_title_required");
      case "password_required":
        return t("nav_messenger_password_required");
      case "alias_name_required":
        return t("nav_messenger_alias_name_required");
      case "members_required":
        return t("nav_messenger_members_required");
      case "invalid_password":
        return t("nav_messenger_invalid_password");
      case "room_full":
        return t("nav_messenger_room_full");
      case "not_open_group_room":
        return t("nav_messenger_open_group_only");
      case "owner_cannot_leave":
        return t("nav_messenger_owner_cannot_leave");
      case "room_lookup_failed":
        return t("nav_messenger_room_lookup_failed");
      case "room_create_failed":
      case "room_participant_create_failed":
        return t("nav_messenger_direct_create_failed");
      case "group_create_failed":
      case "group_participant_create_failed":
        return t("nav_messenger_group_create_failed");
      case "messenger_storage_unavailable":
        return t("nav_messenger_storage_unavailable");
      case "messenger_migration_required":
        return t("nav_messenger_migration_required");
      default:
        return t("nav_messenger_action_failed");
    }
  }, [t]);

  useLayoutEffect(() => {
    const stale = peekBootstrapCache();
    if (!stale) return;
    setData(stale);
    setAuthRequired(false);
    setPageError(null);
    setLoading(false);
  }, []);

  const refresh = useCallback(async (silent = false) => {
    if (silent) {
      if (silentRefreshBusyRef.current) {
        silentRefreshAgainRef.current = true;
        return;
      }
      silentRefreshBusyRef.current = true;
    }
    const stale = !silent ? peekBootstrapCache() : null;
    const shouldBlock = !silent && !loadedRef.current && !stale;
    /** 캐시 없는 최초 차단 로드만 탐색 오픈그룹을 제외한 lite 부트스트랩 → TTFB 단축, 이후 idle 에 open-groups 병합 */
    const useLiteBootstrap = !silent && !stale && !loadedRef.current;
    if (stale) {
      setData(stale);
      setAuthRequired(false);
      setPageError(null);
    }
    if (shouldBlock) setLoading(true);
    try {
      /** Realtime 등 사일런트 갱신 — 방 목록만 병합(전체 부트스트랩·fresh 생략) */
      if (silent) {
        const tSilentFetch =
          typeof performance !== "undefined" ? performance.now() : null;
        const { res, json } = await fetchCommunityMessengerHomeSilentLists();
        if (res.ok && json.ok) {
          setData((prev) => {
            const base = prev ?? peekBootstrapCache();
            if (!base) return prev;
            const chats = json.chats ?? [];
            const groups = json.groups ?? [];
            const requests = json.requests ?? base.requests;
            const friends = json.friends ?? base.friends;
            const next: CommunityMessengerBootstrap = {
              ...base,
              chats,
              groups,
              requests,
              friends,
              tabs: {
                ...base.tabs,
                chats: chats.length,
                groups: groups.length,
                friends: friends.length,
              },
            };
            primeBootstrapCache(next);
            return next;
          });
          if (tSilentFetch != null) {
            messengerMonitorHomeBootstrapUnreadSync(Math.round(performance.now() - tSilentFetch));
          }
        } else {
          const unauthorized = res.status === 401 || res.status === 403;
          if (unauthorized) {
            clearBootstrapCache();
            setAuthRequired(true);
            setPageError(tRef.current("nav_messenger_login_required"));
            setData(null);
          } else {
            const res = await fetch("/api/community-messenger/bootstrap?fresh=1", { cache: "no-store" });
            const json = (await res.json().catch(() => ({}))) as CommunityMessengerBootstrap & {
              ok?: boolean;
              error?: string;
            };
            if (res.ok && json.ok) {
              const next: CommunityMessengerBootstrap = {
                me: json.me ?? null,
                tabs: {
                  friends: json.tabs?.friends ?? 0,
                  chats: json.tabs?.chats ?? 0,
                  groups: json.tabs?.groups ?? 0,
                  calls: json.tabs?.calls ?? 0,
                },
                friends: json.friends ?? [],
                following: json.following ?? [],
                hidden: json.hidden ?? [],
                blocked: json.blocked ?? [],
                requests: json.requests ?? [],
                chats: json.chats ?? [],
                groups: json.groups ?? [],
                discoverableGroups: json.discoverableGroups ?? [],
                calls: json.calls ?? [],
              };
              setAuthRequired(false);
              setPageError(null);
              setData(next);
              primeBootstrapCache(next);
              if (tSilentFetch != null) {
                messengerMonitorHomeBootstrapUnreadSync(Math.round(performance.now() - tSilentFetch));
              }
            }
          }
        }
      } else {
      const url = useLiteBootstrap
        ? "/api/community-messenger/bootstrap?lite=1"
        : "/api/community-messenger/bootstrap";
      const res = await fetch(url, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as CommunityMessengerBootstrap & { ok?: boolean; error?: string };
      if (res.ok && json.ok) {
        const next: CommunityMessengerBootstrap = {
          me: json.me ?? null,
          tabs: {
            friends: json.tabs?.friends ?? 0,
            chats: json.tabs?.chats ?? 0,
            groups: json.tabs?.groups ?? 0,
            calls: json.tabs?.calls ?? 0,
          },
          friends: json.friends ?? [],
          following: json.following ?? [],
          hidden: json.hidden ?? [],
          blocked: json.blocked ?? [],
          requests: json.requests ?? [],
          chats: json.chats ?? [],
          groups: json.groups ?? [],
          discoverableGroups: json.discoverableGroups ?? [],
          calls: json.calls ?? [],
        };
        setAuthRequired(false);
        setPageError(null);
        setData(next);
        primeBootstrapCache(next);
        if (useLiteBootstrap) {
          scheduleWhenBrowserIdle(() => {
            void (async () => {
              try {
                const res2 = await fetch("/api/community-messenger/open-groups", { cache: "no-store" });
                const j2 = (await res2.json().catch(() => ({}))) as {
                  ok?: boolean;
                  groups?: CommunityMessengerDiscoverableGroupSummary[];
                };
                if (!res2.ok || !j2.ok) return;
                setData((prev) => {
                  if (!prev) return prev;
                  const merged = { ...prev, discoverableGroups: j2.groups ?? [] };
                  primeBootstrapCache(merged);
                  return merged;
                });
              } catch {
                /* ignore */
              }
            })();
          }, 0);
        }
      } else {
        const unauthorized = res.status === 401 || res.status === 403;
        if (unauthorized) {
          clearBootstrapCache();
          setAuthRequired(true);
          setPageError(tRef.current("nav_messenger_login_required"));
          setData(null);
        } else {
          setAuthRequired(false);
          setPageError(tRef.current("nav_messenger_load_failed"));
          if (!silent && !stale) {
            setData(null);
          }
        }
      }
      }
    } finally {
      if (silent) {
        silentRefreshBusyRef.current = false;
        if (silentRefreshAgainRef.current) {
          silentRefreshAgainRef.current = false;
          void refresh(true);
        }
      }
      loadedRef.current = true;
      if (shouldBlock) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialServerBootstrap) {
      primeBootstrapCache(initialServerBootstrap);
      loadedRef.current = true;
      setAuthRequired(false);
      setPageError(null);
      const idleId = scheduleWhenBrowserIdle(() => {
        void refresh(true);
      }, 420);
      return () => cancelScheduledWhenBrowserIdle(idleId);
    }
    const stale = peekBootstrapCache();
    if (stale) {
      const idleId = scheduleWhenBrowserIdle(() => {
        void refresh(true);
      }, 420);
      return () => {
        cancelScheduledWhenBrowserIdle(idleId);
      };
    }
    void refresh();
  }, [refresh, initialServerBootstrap]);

  useEffect(() => {
    setIncomingCallSoundEnabled(isCommunityMessengerIncomingCallSoundEnabled());
    setIncomingCallBannerEnabled(isCommunityMessengerIncomingCallBannerEnabled());
    setLocalSettings(readCommunityMessengerLocalSettings());
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed)) {
            setRecentSearches(
              parsed
                .map((item) => (typeof item === "string" ? item.trim() : ""))
                .filter(Boolean)
                .slice(0, 8)
            );
          }
        }
      } catch {
        /* ignore */
      }
      setDismissedNotificationIds(readDismissedNotificationIds());
    }
  }, []);

  useEffect(() => {
    if (!localSettings.phoneFriendAddEnabled && friendAddTab === "contacts") {
      setFriendAddTab("id");
    }
  }, [friendAddTab, localSettings.phoneFriendAddEnabled]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(recentSearches.slice(0, 8)));
    } catch {
      /* ignore */
    }
  }, [recentSearches]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "settings") {
      setSettingsSheetOpen(true);
      router.replace("/community-messenger", { scroll: false });
      return;
    }
    if (tab === "friends") {
      setMainSection("friends");
      router.replace("/community-messenger?section=friends", { scroll: false });
      return;
    }
    const section = searchParams.get("section");
    const filter = searchParams.get("filter");
    const kind = searchParams.get("kind");
    setMainSection(resolveMessengerSection(section ?? undefined, tab ?? undefined));
    const { inbox, kind: nextKind } = resolveMessengerChatFilters(filter ?? undefined, kind ?? undefined, tab ?? undefined);
    setChatInboxFilter(inbox);
    setChatKindFilter(nextKind);
  }, [searchParams, router]);

  useEffect(() => {
    if (!friendManagerOpen) return;
    setFriendUserSearchAttempted(false);
    setSearchResults([]);
  }, [friendManagerOpen]);

  useLayoutEffect(() => {
    if (!setMainTier1Extras) return;
    setMainTier1Extras({
      tier1: {
        rightSlot: (
          <div data-messenger-shell className="flex items-center">
            <CommunityMessengerHeaderActions
              incomingRequestCount={incomingRequestCount}
              onOpenSearch={() => setSearchSheetOpen(true)}
              onOpenRequestList={() => setRequestSheetOpen(true)}
              onOpenSettings={() => setSettingsSheetOpen(true)}
            />
          </div>
        ),
      },
    });
    return () => setMainTier1Extras(null);
  }, [setMainTier1Extras, incomingRequestCount]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/me/notification-settings", { credentials: "include" });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          settings?: Partial<MessengerNotificationSettings>;
        };
        if (!cancelled && res.ok && json.ok && json.settings) {
          setNotificationSettings((prev) => ({
            ...prev,
            trade_chat_enabled: json.settings?.trade_chat_enabled !== false,
            community_chat_enabled: json.settings?.community_chat_enabled !== false,
            order_enabled: json.settings?.order_enabled !== false,
            store_enabled: json.settings?.store_enabled !== false,
            sound_enabled: json.settings?.sound_enabled !== false,
            vibration_enabled: json.settings?.vibration_enabled !== false,
          }));
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const scheduleHomeRealtimeRefresh = useCallback(() => {
    void refresh(true);
  }, [refresh]);

  useCommunityMessengerHomeRealtime({
    userId: data?.me?.id ?? null,
    roomIds: homeRoomIds,
    enabled: Boolean(data?.me?.id),
    onRefresh: scheduleHomeRealtimeRefresh,
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
        if (!peekRoomSnapshot(existingRoom.id)) {
          await prefetchCommunityMessengerRoomSnapshot(existingRoom.id);
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
    [data?.chats, getMessengerActionErrorMessage, navigateToCommunityRoom, reviveDirectRoomForEntry, t]
  );

  /** 1:1 발신 — `lib/community-messenger/outgoing-call-surfaces.ts` (friendsFavoriteQuickActions, friendProfileSheet) 에만 연결 */
  const startDirectCall = useCallback(
    (peerUserId: string, kind: "voice" | "video") => {
      if (outgoingDialSyncGuardRef.current) return;
      outgoingDialSyncGuardRef.current = true;
      window.setTimeout(() => {
        outgoingDialSyncGuardRef.current = false;
      }, 900);

      setActionError(null);
      const existingRoom = data?.chats?.find((r) => r.roomType === "direct" && r.peerUserId === peerUserId) ?? null;
      if (existingRoom && communityMessengerRoomIsInboxHidden(existingRoom)) {
        void reviveDirectRoomForEntry(existingRoom);
      }

      const peerLabel =
        existingRoom?.title?.trim() ||
        [...(data?.friends ?? []), ...(data?.hidden ?? [])].find((f) => f.id === peerUserId)?.label?.trim() ||
        "";

      const dialHref = buildCommunityMessengerOutgoingDialHref({
        kind,
        roomId: existingRoom?.id,
        peerUserId: existingRoom?.id ? undefined : peerUserId,
        peerLabel: peerLabel || undefined,
      });
      void router.prefetch(dialHref);
      router.push(dialHref);
    },
    [data?.chats, data?.friends, data?.hidden, reviveDirectRoomForEntry, router]
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
      try {
        const result = await postCommunityMessengerFriendRequestApi(targetUserId);
        if (result.ok) {
          void refresh(true);
          void searchUsers();
          /** 교차 요청 흡수 시 수락과 동일하게 DM 방으로 이동 */
          if (result.mergedFromIncoming && typeof result.directRoomId === "string" && result.directRoomId.trim()) {
            router.push(`/community-messenger/rooms/${encodeURIComponent(result.directRoomId.trim())}`);
          }
          return;
        }
        const msg = communityMessengerFriendRequestFailureMessage(result);
        if (msg) showMessengerSnackbar(msg, { variant: "error" });
      } finally {
        setBusyId(null);
      }
    },
    [refresh, router, searchUsers]
  );

  const respondRequest = useCallback(
    async (requestId: string, action: "accept" | "reject" | "cancel") => {
      setBusyId(`request:${requestId}:${action}`);
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
          setIncomingFriendRequestPopup((prev) => (prev?.id === requestId ? null : prev));
          void refresh(true);
          if (action === "accept" && typeof json.directRoomId === "string" && json.directRoomId.trim()) {
            router.push(`/community-messenger/rooms/${encodeURIComponent(json.directRoomId.trim())}`);
          }
        }
      } finally {
        setBusyId(null);
      }
    },
    [refresh, router]
  );

  useIncomingFriendRequestPopup(data?.me?.id ?? null, Boolean(!loading && !authRequired && data?.me?.id), (req) => {
    setIncomingFriendRequestPopup(req);
  });

  useEffect(() => {
    if (!incomingFriendRequestPopup) return;
    const stillPending = (data?.requests ?? []).some(
      (r) => r.id === incomingFriendRequestPopup.id && r.direction === "incoming"
    );
    if (!stillPending) setIncomingFriendRequestPopup(null);
  }, [data?.requests, incomingFriendRequestPopup]);

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
        setGroupTitle("");
        setGroupMembers([]);
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
  }, [getMessengerActionErrorMessage, groupMembers, groupTitle, navigateToCommunityRoom, refresh, t]);

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
        setJoinPassword("");
        setJoinIdentityMode("real_name");
        setJoinAliasName("");
        setJoinAliasBio("");
        setJoinAliasAvatarUrl("");
        setJoinTargetGroup(null);
        setPublicGroupFindOpen(false);
        navigateToCommunityRoom(json.roomId);
        return;
      }
      setActionError(getMessengerActionErrorMessage(json.error));
    } finally {
      setBusyId(null);
    }
  }, [
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
        setJoinPassword("");
        setJoinIdentityMode(json.group.identityPolicy === "alias_allowed" ? "alias" : "real_name");
        setJoinAliasName("");
        setJoinAliasBio("");
        setJoinAliasAvatarUrl("");
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
    [getMessengerActionErrorMessage, joinOpenGroup, localSettings.groupJoinPreviewEnabled]
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
      writeDismissedNotificationIds(next);
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
        updateRoomSummaryState(roomId, (room) => ({ ...room, unreadCount: 0 }));
        if (typeof performance !== "undefined") {
          messengerMonitorUnreadListSync(roomId, Math.round(performance.now() - t0), "mark_read");
        }
      } finally {
        setBusyId(null);
      }
    },
    [getMessengerActionErrorMessage, updateRoomSummaryState]
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
      {!loading && !authRequired && data ? (
        <>
          <MessengerHomeMainSections
            mainSection={mainSection}
            onPrimarySectionChange={onPrimarySectionChange}
            me={data.me}
            sortedFriends={sortedFriends}
            friendStateModel={friendStateModel}
            busyId={busyId}
            onOpenFriendsPrivacySummary={() => setFriendsPrivacySheetOpen(true)}
            onOpenProfile={(profile) => setFriendSheet({ mode: "profile", profile })}
            onToggleFavoriteFriend={(userId) => void toggleFavoriteFriend(userId)}
            onFriendSwipeHide={(userId) => void toggleHiddenFriend(userId)}
            onFriendSwipeRemove={(userId) => void removeFriend(userId)}
            onFriendSwipeBlock={(userId) => void toggleBlock(userId)}
            onFriendRowChat={(userId) => void startDirectRoom(userId)}
            onFriendRowVoiceCall={(userId) => void startDirectCall(userId, "voice")}
            onFriendRowVideoCall={(userId) => void startDirectCall(userId, "video")}
            getFriendDirectRoomMuted={(userId) => directRoomByPeerId.get(userId)?.isMuted}
            friendNotificationsBusy={(userId) =>
              Boolean(directRoomByPeerId.get(userId)) &&
              busyId === `room-settings:${directRoomByPeerId.get(userId)?.id ?? ""}`
            }
            onFriendToggleRoomMute={(userId) => {
              const room = directRoomByPeerId.get(userId);
              if (room) void updateRoomParticipantState(room.id, { isMuted: !room.isMuted });
            }}
            friendHasDirectRoom={(userId) => Boolean(directRoomByPeerId.get(userId))}
            primaryListItems={primaryListItems}
            favoriteFriendIds={favoriteFriendIds}
            onTogglePin={(room) => void updateRoomParticipantState(room.id, { isPinned: !room.isPinned })}
            onToggleMute={(room) => void updateRoomParticipantState(room.id, { isMuted: !room.isMuted })}
            onMarkRead={(room) => void markRoomRead(room.id)}
            onToggleArchive={(room) => void toggleRoomArchive(room.id, !communityMessengerRoomIsInboxHidden(room))}
            onOpenRoomActions={(item, listContext) => setRoomActionSheet({ item, listContext })}
            chatInboxFilter={chatInboxFilter}
            chatKindFilter={chatKindFilter}
            onChatListChipChange={onChatListChipChange}
            openChatJoinedItems={openChatJoinedItems}
            filteredDiscoverableGroups={filteredDiscoverableGroups}
            onPreviewOpenGroup={(groupId) => void openJoinModal(groupId)}
          />
          {incomingFriendRequestPopup ? (
            <MessengerIncomingFriendRequestPopup
              request={incomingFriendRequestPopup}
              busyId={busyId}
              onDismiss={() => setIncomingFriendRequestPopup(null)}
              onRespond={(requestId, action) => void respondRequest(requestId, action)}
            />
          ) : null}
        </>
      ) : null}

      {actionError ? (
        <div
          className="rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-4 py-3 text-[13px] shadow-[var(--messenger-shadow-soft)]"
          style={{ color: "var(--messenger-text)" }}
        >
          {actionError}
        </div>
      ) : null}

      {loading ? (
        <div
          className="rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-4 py-10 text-center text-[14px] shadow-[var(--messenger-shadow-soft)]"
          style={{ color: "var(--messenger-text-secondary)" }}
        >
          메신저 데이터를 불러오는 중입니다.
        </div>
      ) : null}

      {!loading && authRequired ? (
        <section
          className="rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-4 py-8 text-center shadow-[var(--messenger-shadow-soft)]"
          style={{ color: "var(--messenger-text)" }}
        >
          <p className="text-[16px] font-semibold">로그인이 필요합니다.</p>
          <p className="mt-2 text-[13px]" style={{ color: "var(--messenger-text-secondary)" }}>
            {pageError ?? t("nav_messenger_login_required")}
          </p>
          <div className="mt-4 flex justify-center">
            <Link
              href="/login"
              className="rounded-[var(--messenger-radius-md)] bg-[color:var(--messenger-primary)] px-4 py-3 text-[14px] font-semibold text-white active:opacity-90"
            >
              로그인하러 가기
            </Link>
          </div>
        </section>
      ) : null}

      {!loading && !authRequired && !data ? (
        <section
          className="rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-4 py-8 text-center shadow-[var(--messenger-shadow-soft)]"
          style={{ color: "var(--messenger-text)" }}
        >
          <p className="text-[16px] font-semibold">메신저를 불러오지 못했습니다.</p>
          <p className="mt-2 text-[13px]" style={{ color: "var(--messenger-text-secondary)" }}>
            {pageError ?? t("common_try_again_later")}
          </p>
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-[var(--messenger-radius-md)] bg-[color:var(--messenger-primary)] px-4 py-3 text-[14px] font-semibold text-white active:opacity-90"
            >
              다시 불러오기
            </button>
          </div>
        </section>
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
            void startDirectCall(id, "voice");
          }}
          onVideoCall={() => {
            const id = friendProfileForSheet.id;
            setFriendSheet(null);
            void startDirectCall(id, "video");
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
          busyId={busyId}
          onClose={() => setRoomActionSheet(null)}
          onEnterRoom={() => {
            const id = roomActionSheet.item.room.id;
            setRoomActionSheet(null);
            navigateToCommunityRoom(id);
          }}
          onTogglePin={() =>
            void updateRoomParticipantState(roomActionSheet.item.room.id, {
              isPinned: !roomActionSheet.item.room.isPinned,
            })
          }
          onToggleMute={() =>
            void updateRoomParticipantState(roomActionSheet.item.room.id, {
              isMuted: !roomActionSheet.item.room.isMuted,
            })
          }
          onMarkRead={() => void markRoomRead(roomActionSheet.item.room.id)}
          onToggleArchive={() =>
            void toggleRoomArchive(
              roomActionSheet.item.room.id,
              !communityMessengerRoomIsInboxHidden(roomActionSheet.item.room)
            )
          }
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
              ? () => void leaveMessengerRoom(roomActionSheet.item.room.id)
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
          onClose={() => setFriendsPrivacySheetOpen(false)}
          onToggleHidden={(userId) => void toggleHiddenFriend(userId)}
          onToggleBlock={(userId) => void toggleBlock(userId)}
          onOpenChat={(userId) => {
            setFriendsPrivacySheetOpen(false);
            void startDirectRoom(userId);
          }}
        />
      ) : null}

      {searchSheetOpen ? (
        <MessengerSearchSheet
          keyword={roomSearchKeyword}
          onKeywordChange={setRoomSearchKeyword}
          onClose={() => setSearchSheetOpen(false)}
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
          onTogglePin={(room) => void updateRoomParticipantState(room.id, { isPinned: !room.isPinned })}
          onToggleMute={(room) => void updateRoomParticipantState(room.id, { isMuted: !room.isMuted })}
          onMarkRead={(room) => void markRoomRead(room.id)}
          onToggleArchive={(room) => void toggleRoomArchive(room.id, !communityMessengerRoomIsInboxHidden(room))}
          onSelectFriend={(friend) => setFriendSheet({ mode: "profile", profile: friend })}
          onSelectOpenGroup={(groupId) => void openJoinModal(groupId)}
          onSelectMessageRoom={(roomId) => navigateToCommunityRoom(roomId)}
        />
      ) : null}

      {composerOpen ? (
        <MessengerNewConversationSheet
          onClose={() => setComposerOpen(false)}
          onFriendChatStart={() => setMainSection("friends")}
          onFriendAdd={() => {
            setFriendAddTab("id");
            setFriendManagerOpen(true);
            requestAnimationFrame(() => friendSearchRef.current?.focus());
          }}
          onCreateGroup={() => setGroupCreateStep("private_group")}
          onFindOpenChat={() => setPublicGroupFindOpen(true)}
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
          onClose={() => setRequestSheetOpen(false)}
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
          onClose={() => setSettingsSheetOpen(false)}
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
            setSettingsSheetOpen(false);
            setPublicGroupFindOpen(true);
          }}
        />
      ) : null}

      {publicGroupFindOpen && data ? (
        <div className="fixed inset-0 z-[43] flex flex-col justify-end bg-black/30">
          <button
            type="button"
            className="min-h-0 flex-1 cursor-default"
            aria-label="닫기"
            onClick={() => setPublicGroupFindOpen(false)}
          />
          <div className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-[14px] border border-sam-border bg-sam-surface shadow-[0_-4px_14px_rgba(17,24,39,0.05)]">
            <div className="flex shrink-0 items-center justify-between border-b border-sam-border-soft px-4 py-3.5">
              <p className="text-[17px] font-semibold text-sam-fg">오픈채팅 찾기</p>
              <button
                type="button"
                className="rounded-ui-rect px-3 py-1.5 text-[15px] text-sam-muted"
                onClick={() => setPublicGroupFindOpen(false)}
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
                onClick={() => {
                  setJoinTargetGroup(null);
                  setJoinPassword("");
                  setJoinIdentityMode("real_name");
                  setJoinAliasName("");
                  setJoinAliasBio("");
                  setJoinAliasAvatarUrl("");
                }}
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
          onClick={() => (mainSection === "friends" ? setFriendManagerOpen(true) : setComposerOpen(true))}
          className={`fixed ${BOTTOM_NAV_FAB_LAYOUT.bottomOffsetClass} right-4 z-[41] flex h-14 w-14 items-center justify-center rounded-ui-rect border border-[color:var(--messenger-primary-soft-2)] bg-[color:var(--messenger-primary)] text-white shadow-[var(--messenger-shadow-soft)] transition active:scale-[0.98] active:opacity-90`}
          aria-label={mainSection === "friends" ? "친구 추가" : "새 대화"}
        >
          <PlusIcon className="h-6 w-6" />
        </button>
      ) : null}
    </div>
  );
}

function DiscoverableOpenGroupCard({
  group,
  busy,
  onJoin,
}: {
  group: CommunityMessengerDiscoverableGroupSummary;
  busy: boolean;
  onJoin: () => void;
}) {
  return (
    <div className="rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-4 py-3 shadow-[var(--messenger-shadow-soft)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold" style={{ color: "var(--messenger-text)" }}>
            {group.title}
          </p>
          <p className="mt-1 line-clamp-2 text-[12px]" style={{ color: "var(--messenger-text-secondary)" }}>
            {group.summary || "소개 없음"}
          </p>
          <p className="mt-1.5 text-[11px]" style={{ color: "var(--messenger-text-secondary)" }}>
            {group.ownerLabel} · {group.memberCount}명
            {group.isJoined ? " · 참여 중" : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <button
            type="button"
            onClick={onJoin}
            disabled={busy}
            className="rounded-[var(--messenger-radius-sm)] bg-[color:var(--messenger-primary-soft)] px-3 py-2 text-[12px] font-semibold text-[color:var(--messenger-primary)] disabled:opacity-40 active:opacity-90"
          >
            {busy ? "확인 중..." : group.isJoined ? "다시 입장" : "참여"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}

function scoreKeywordMatch(fields: Array<string | null | undefined>, keyword: string): number {
  const q = keyword.trim().toLowerCase();
  if (!q) return 0;
  let best = 0;
  for (const field of fields) {
    const value = (field ?? "").trim().toLowerCase();
    if (!value) continue;
    if (value === q) {
      best = Math.max(best, 500);
      continue;
    }
    if (value.startsWith(q)) {
      best = Math.max(best, 400);
      continue;
    }
    if (value.split(/\s+/).some((part) => part.startsWith(q))) {
      best = Math.max(best, 300);
      continue;
    }
    if (value.includes(q)) {
      best = Math.max(best, 200);
    }
  }
  return best;
}
