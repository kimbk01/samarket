"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { CommunityMessengerHeaderActions } from "@/components/community-messenger/CommunityMessengerHeaderActions";
import { MessengerLineFriendRow } from "@/components/community-messenger/MessengerLineFriendRow";
import { MessengerFriendProfileSheet } from "@/components/community-messenger/MessengerFriendProfileSheet";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  isCommunityMessengerIncomingCallBannerEnabled,
  isCommunityMessengerIncomingCallSoundEnabled,
  setCommunityMessengerIncomingCallBannerEnabled,
  setCommunityMessengerIncomingCallSoundEnabled,
} from "@/lib/community-messenger/preferences";
import { useCommunityMessengerHomeRealtime } from "@/lib/community-messenger/use-community-messenger-realtime";
import {
  clearBootstrapCache,
  peekBootstrapCache,
  primeBootstrapCache,
} from "@/lib/community-messenger/bootstrap-cache";
import { CommunityMessengerDeviceSettingsSection } from "@/components/community-messenger/CommunityMessengerDeviceSettingsSection";
import {
  peekRoomSnapshot,
  prefetchCommunityMessengerRoomSnapshot,
  primeRoomSnapshot,
} from "@/lib/community-messenger/room-snapshot-cache";
import {
  cancelScheduledWhenBrowserIdle,
  scheduleWhenBrowserIdle,
} from "@/lib/ui/network-policy";
import { BOTTOM_NAV_FAB_LAYOUT } from "@/lib/main-menu/bottom-nav-config";
import { MessengerPrimarySectionNav } from "@/components/community-messenger/MessengerPrimarySectionNav";
import {
  type MessengerChatSubFilter,
  type MessengerMainSection,
  messengerChatSubFilterLabel,
  resolveMessengerChatSubFilter,
  resolveMessengerSection,
} from "@/lib/community-messenger/messenger-ia";
import {
  communityMessengerRoomIsInboxHidden,
  type CommunityMessengerBootstrap,
  type CommunityMessengerCallLog,
  type CommunityMessengerDiscoverableGroupSummary,
  type CommunityMessengerFriendRequest,
  type CommunityMessengerProfileLite,
  type CommunityMessengerRoomSnapshot,
  type CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";

/** 채팅 탭 2차 필터 순서 (1차 IA와 분리). */
const CHAT_SUB_FILTER_ORDER: MessengerChatSubFilter[] = [
  "all",
  "unread",
  "pinned",
  "direct",
  "private_group",
  "trade",
  "delivery",
];
type UnifiedRoomListItem = {
  room: CommunityMessengerRoomSummary;
  preview: string;
  previewKind: "message" | "call";
  callStatus: CommunityMessengerCallLog["status"] | null;
  callKind: CommunityMessengerCallLog["callKind"] | null;
  lastEventAt: string;
};
type NotificationCenterItem =
  | {
      id: string;
      kind: "request";
      createdAt: string;
      request: CommunityMessengerFriendRequest;
    }
  | {
      id: string;
      kind: "missed_call";
      createdAt: string;
      call: CommunityMessengerCallLog;
    };

const ROOM_ROW_ACTION_WIDTH = 224;
const ROOM_ROW_ACTION_CLOSE_THRESHOLD = 56;
const ROOM_ROW_AXIS_LOCK_THRESHOLD = 8;
type MessengerNotificationSettings = {
  trade_chat_enabled: boolean;
  community_chat_enabled: boolean;
  order_enabled: boolean;
  store_enabled: boolean;
  sound_enabled: boolean;
  vibration_enabled: boolean;
};

export function CommunityMessengerHome({
  initialTab,
  initialSection,
  initialFilter,
}: {
  initialTab?: string;
  initialSection?: string;
  initialFilter?: string;
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
  const setMainTier1Extras = useSetMainTier1ExtrasOptional();
  const [composerOpen, setComposerOpen] = useState(false);
  const [requestSheetOpen, setRequestSheetOpen] = useState(false);
  const [friendManagerOpen, setFriendManagerOpen] = useState(false);
  const [friendAddTab, setFriendAddTab] = useState<"contacts" | "id">("id");
  const [friendUserSearchAttempted, setFriendUserSearchAttempted] = useState(false);
  const [searchSheetOpen, setSearchSheetOpen] = useState(false);
  const [sheetProfile, setSheetProfile] = useState<CommunityMessengerProfileLite | null>(null);
  const friendSearchRef = useRef<HTMLInputElement | null>(null);
  const [settingsSheetOpen, setSettingsSheetOpen] = useState(initialTab === "settings");
  const [publicGroupFindOpen, setPublicGroupFindOpen] = useState(false);
  const [mainSection, setMainSection] = useState<MessengerMainSection>(() =>
    resolveMessengerSection(initialSection, initialTab)
  );
  const [chatSubFilter, setChatSubFilter] = useState<MessengerChatSubFilter>(() =>
    resolveMessengerChatSubFilter(initialFilter, initialTab)
  );
  const [friendsHiddenOpen, setFriendsHiddenOpen] = useState(false);
  const applyMessengerUrl = useCallback(
    (section: MessengerMainSection, filter: MessengerChatSubFilter) => {
      const qs = new URLSearchParams();
      qs.set("section", section);
      if (section === "chats" && filter !== "all") {
        qs.set("filter", filter);
      }
      router.replace(`/community-messenger?${qs.toString()}`, { scroll: false });
    },
    [router]
  );
  const onPrimarySectionChange = useCallback(
    (next: MessengerMainSection) => {
      setMainSection(next);
      if (next === "chats") {
        applyMessengerUrl("chats", chatSubFilter);
      } else {
        const qs = new URLSearchParams();
        qs.set("section", next);
        router.replace(`/community-messenger?${qs.toString()}`, { scroll: false });
      }
    },
    [applyMessengerUrl, chatSubFilter, router]
  );
  const onChatSubFilterChange = useCallback(
    (next: MessengerChatSubFilter) => {
      setChatSubFilter(next);
      applyMessengerUrl("chats", next);
    },
    [applyMessengerUrl]
  );
  const [data, setData] = useState<CommunityMessengerBootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [roomSearchKeyword, setRoomSearchKeyword] = useState("");
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
  const [notificationSettings, setNotificationSettings] = useState<MessengerNotificationSettings>({
    trade_chat_enabled: true,
    community_chat_enabled: true,
    order_enabled: true,
    store_enabled: true,
    sound_enabled: true,
    vibration_enabled: true,
  });
  const incomingRequestCount = useMemo(
    () => (data?.requests ?? []).filter((r) => r.direction === "incoming").length,
    [data?.requests]
  );
  const homeRoomIds = useMemo(
    () => [...(data?.chats ?? []), ...(data?.groups ?? [])].map((room) => room.id),
    [data?.chats, data?.groups]
  );

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
      const url = silent
        ? "/api/community-messenger/bootstrap?fresh=1"
        : useLiteBootstrap
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
    const stale = peekBootstrapCache();
    if (stale) {
      const idleId = scheduleWhenBrowserIdle(() => {
        void refresh(true);
      }, 1400);
      return () => {
        cancelScheduledWhenBrowserIdle(idleId);
      };
    }
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setIncomingCallSoundEnabled(isCommunityMessengerIncomingCallSoundEnabled());
    setIncomingCallBannerEnabled(isCommunityMessengerIncomingCallBannerEnabled());
  }, []);

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
    setMainSection(resolveMessengerSection(section ?? undefined, tab ?? undefined));
    setChatSubFilter(resolveMessengerChatSubFilter(filter ?? undefined, tab ?? undefined));
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
          <CommunityMessengerHeaderActions
            incomingRequestCount={incomingRequestCount}
            onOpenSearch={() => setSearchSheetOpen(true)}
            onOpenRequestList={() => setRequestSheetOpen(true)}
            onOpenSettings={() => setSettingsSheetOpen(true)}
          />
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
    [data?.chats, getMessengerActionErrorMessage, navigateToCommunityRoom, t]
  );

  const startDirectCall = useCallback(
    async (peerUserId: string, kind: "voice" | "video") => {
      setActionError(null);
      setBusyId(`call:${kind}:${peerUserId}`);
      try {
        let rid =
          data?.chats?.find((r) => r.roomType === "direct" && r.peerUserId === peerUserId)?.id ?? null;
        if (!rid) {
          const res = await fetch("/api/community-messenger/rooms", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomType: "direct", peerUserId }),
          });
          const json = (await res.json().catch(() => ({}))) as { ok?: boolean; roomId?: string; error?: string };
          if (res.status === 401 || res.status === 403) {
            setAuthRequired(true);
            setPageError(t("nav_messenger_login_required"));
            return;
          }
          if (!res.ok || !json.ok || !json.roomId) {
            setActionError(getMessengerActionErrorMessage(json.error));
            return;
          }
          rid = json.roomId;
        }
        const cRes = await fetch(`/api/community-messenger/rooms/${encodeURIComponent(rid)}/calls`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callKind: kind }),
        });
        const cJson = (await cRes.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          session?: { id?: string };
        };
        if (!cRes.ok || !cJson.ok || !cJson.session?.id) {
          setActionError(getMessengerActionErrorMessage(cJson.error));
          return;
        }
        router.push(`/community-messenger/calls/${encodeURIComponent(cJson.session.id)}`);
      } finally {
        setBusyId(null);
      }
    },
    [data?.chats, getMessengerActionErrorMessage, router]
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
      setBusyId(`friend:${targetUserId}`);
      try {
        const res = await fetch("/api/community-messenger/friend-requests", {
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

  const respondRequest = useCallback(
    async (requestId: string, action: "accept" | "reject" | "cancel") => {
      setBusyId(`request:${requestId}:${action}`);
      try {
        const res = await fetch(`/api/community-messenger/friend-requests/${encodeURIComponent(requestId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        if (res.ok) {
          void refresh(true);
        }
      } finally {
        setBusyId(null);
      }
    },
    [refresh]
  );

  const toggleFavoriteFriend = useCallback(
    async (friendUserId: string) => {
      setBusyId(`favorite:${friendUserId}`);
      try {
        const res = await fetch(`/api/community-messenger/friends/${encodeURIComponent(friendUserId)}/favorite`, {
          method: "POST",
        });
        if (res.ok) {
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

  const joinOpenGroup = useCallback(async () => {
    if (!joinTargetGroup) return;
    if (joinTargetGroup.joinPolicy === "password" && !joinPassword.trim()) return;
    if (joinIdentityMode === "alias" && !joinAliasName.trim()) return;
    setActionError(null);
    setBusyId(`join-open-group:${joinTargetGroup.id}`);
    try {
      const res = await fetch(`/api/community-messenger/open-groups/${encodeURIComponent(joinTargetGroup.id)}/join`, {
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

  const openJoinModal = useCallback(async (groupId: string) => {
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
    } finally {
      setBusyId(null);
    }
  }, [getMessengerActionErrorMessage]);

  const favoriteFriends = useMemo(
    () => (data?.friends ?? []).filter((friend) => friend.isFavoriteFriend),
    [data?.friends]
  );
  const favoriteFriendIds = useMemo(() => new Set(favoriteFriends.map((friend) => friend.id)), [favoriteFriends]);
  const selectedGroupFriends = useMemo(() => {
    const friendMap = new Map((data?.friends ?? []).map((friend) => [friend.id, friend]));
    return groupMembers.map((id) => friendMap.get(id)).filter((friend): friend is CommunityMessengerProfileLite => Boolean(friend));
  }, [data?.friends, groupMembers]);
  const groupTitlePreview = useMemo(() => {
    const explicitTitle = groupTitle.trim();
    if (explicitTitle) return explicitTitle;
    if (selectedGroupFriends.length === 0) return "";
    const labels = selectedGroupFriends.map((friend) => friend.label).filter(Boolean).slice(0, 3);
    if (groupMembers.length > labels.length) return `${labels.join(", ")} 외 ${groupMembers.length - labels.length}명`;
    return labels.join(", ");
  }, [groupMembers.length, groupTitle, selectedGroupFriends]);

  const sortedFriends = useMemo(() => {
    return [...(data?.friends ?? [])].sort((a, b) => {
      if (a.isFavoriteFriend !== b.isFavoriteFriend) return a.isFavoriteFriend ? -1 : 1;
      return a.label.localeCompare(b.label, "ko");
    });
  }, [data?.friends]);

  const sortedChats = useMemo(() => {
    const raw = data?.chats ?? [];
    const byId = new Map<string, CommunityMessengerRoomSummary>();
    for (const room of raw) {
      const prev = byId.get(room.id);
      if (!prev) {
        byId.set(room.id, room);
        continue;
      }
      const tPrev = new Date(prev.lastMessageAt).getTime();
      const tNew = new Date(room.lastMessageAt).getTime();
      if (tNew >= tPrev) byId.set(room.id, room);
    }
    return sortRooms([...byId.values()]);
  }, [data?.chats]);
  const sortedGroups = useMemo(() => sortRooms(data?.groups ?? []), [data?.groups]);
  const filteredDiscoverableGroups = useMemo(() => {
    const keyword = openGroupSearch.trim().toLowerCase();
    return [...(data?.discoverableGroups ?? [])]
      .filter((group) => {
        if (!keyword) return true;
        const haystack = [group.title, group.summary, group.ownerLabel].join(" ").toLowerCase();
        return haystack.includes(keyword);
      })
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  }, [data?.discoverableGroups, openGroupSearch]);
  const sortedCalls = useMemo(
    () => mergeCallsByConversation(sortCallsByTime(data?.calls ?? [])),
    [data?.calls]
  );
  const notificationCenterItems = useMemo<NotificationCenterItem[]>(() => {
    const requestItems: NotificationCenterItem[] = (data?.requests ?? [])
      .filter((request) => request.direction === "incoming")
      .map((request) => ({
        id: `request:${request.id}`,
        kind: "request",
        createdAt: request.createdAt,
        request,
      }));
    const missedCallItems: NotificationCenterItem[] = sortedCalls
      .filter((call) => call.status === "missed")
      .map((call) => ({
        id: `missed:${call.id}`,
        kind: "missed_call",
        createdAt: call.startedAt,
        call,
      }));
    return [...requestItems, ...missedCallItems].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [data?.requests, sortedCalls]);
  const unifiedRooms = useMemo<UnifiedRoomListItem[]>(() => {
    const roomMap = new Map<string, UnifiedRoomListItem>();
    for (const room of [...sortedChats, ...sortedGroups]) {
      roomMap.set(room.id, {
        room,
        preview: getRoomPreviewText(room),
        previewKind: "message",
        callStatus: null,
        callKind: null,
        lastEventAt: room.lastMessageAt,
      });
    }
    for (const call of sortedCalls) {
      if (!call.roomId) continue;
      const existing = roomMap.get(call.roomId);
      if (!existing) continue;
      const callAt = new Date(call.startedAt).getTime();
      const roomAt = new Date(existing.lastEventAt).getTime();
      if (Number.isFinite(callAt) && (!Number.isFinite(roomAt) || callAt >= roomAt)) {
        roomMap.set(call.roomId, {
          room: existing.room,
          preview: formatCallPreview(call),
          previewKind: "call",
          callStatus: call.status,
          callKind: call.callKind,
          lastEventAt: call.startedAt,
        });
      }
    }
    return [...roomMap.values()].sort((a, b) => {
      if (Boolean(a.room.isPinned) !== Boolean(b.room.isPinned)) return a.room.isPinned ? -1 : 1;
      if (a.room.unreadCount !== b.room.unreadCount) return b.room.unreadCount - a.room.unreadCount;
      return new Date(b.lastEventAt).getTime() - new Date(a.lastEventAt).getTime();
    });
  }, [sortedChats, sortedGroups, sortedCalls]);
  /** 채팅 탭: 오픈채팅·보관 제외한 통합 스레드 */
  const baseChatListItems = useMemo(() => {
    return unifiedRooms.filter((item) => {
      if (item.room.roomType === "open_group") return false;
      if (communityMessengerRoomIsInboxHidden(item.room)) return false;
      return true;
    });
  }, [unifiedRooms]);

  const archiveListItems = useMemo(() => {
    return unifiedRooms.filter((item) => communityMessengerRoomIsInboxHidden(item.room));
  }, [unifiedRooms]);

  const openChatJoinedItems = useMemo(() => {
    return unifiedRooms.filter((item) => {
      if (item.room.roomType !== "open_group") return false;
      if (communityMessengerRoomIsInboxHidden(item.room)) return false;
      return true;
    });
  }, [unifiedRooms]);

  const visibleChatListItems = useMemo(() => {
    const keyword = roomSearchKeyword.trim().toLowerCase();
    return baseChatListItems.filter((item) => {
      const room = item.room;
      if (chatSubFilter === "unread" && room.unreadCount < 1) return false;
      if (chatSubFilter === "pinned" && !room.isPinned) return false;
      if (chatSubFilter === "direct" && room.roomType !== "direct") return false;
      if (chatSubFilter === "private_group" && room.roomType !== "private_group") return false;
      if (chatSubFilter === "trade") {
        const tradeRoom = room.title.includes("거래") || room.summary.includes("거래") || room.subtitle.includes("거래");
        if (!tradeRoom) return false;
      }
      if (chatSubFilter === "delivery") {
        const deliveryRoom =
          room.title.includes("주문") ||
          room.title.includes("배달") ||
          room.summary.includes("주문") ||
          room.summary.includes("배달") ||
          room.subtitle.includes("주문") ||
          room.subtitle.includes("배달");
        if (!deliveryRoom) return false;
      }
      if (!keyword) return true;
      const haystack = [room.title, room.subtitle, room.summary, item.preview].join(" ").toLowerCase();
      return haystack.includes(keyword);
    });
  }, [baseChatListItems, chatSubFilter, roomSearchKeyword]);

  const searchSheetRoomItems = useMemo(() => {
    const keyword = roomSearchKeyword.trim().toLowerCase();
    if (!keyword) return [];
    return unifiedRooms
      .filter((item) => {
        const room = item.room;
        const haystack = [room.title, room.subtitle, room.summary, item.preview].join(" ").toLowerCase();
        return haystack.includes(keyword);
      })
      .slice(0, 24);
  }, [roomSearchKeyword, unifiedRooms]);

  const primaryListItems = useMemo(() => {
    if (mainSection === "chats") return visibleChatListItems;
    if (mainSection === "archive") return archiveListItems;
    if (mainSection === "open_chat") return openChatJoinedItems;
    return [];
  }, [archiveListItems, mainSection, openChatJoinedItems, visibleChatListItems]);

  const sectionNavBadges = useMemo((): Partial<Record<MessengerMainSection, number>> => {
    if (!data) return {};
    const chatsUnread = baseChatListItems.reduce((s, i) => s + Math.max(0, i.room.unreadCount), 0);
    const openHint = openChatJoinedItems.length + (data.discoverableGroups?.length ?? 0);
    return {
      friends: data.friends.length,
      chats: chatsUnread,
      open_chat: openHint,
      archive: archiveListItems.length,
    };
  }, [archiveListItems.length, baseChatListItems, data, openChatJoinedItems.length]);
  const totalUnreadCount = useMemo(
    () => baseChatListItems.reduce((sum, item) => sum + Math.max(0, item.room.unreadCount), 0),
    [baseChatListItems]
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
        const res = await fetch(`/api/community-messenger/rooms/${encodeURIComponent(roomId)}`, {
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
      try {
        const res = await fetch(`/api/community-messenger/rooms/${encodeURIComponent(roomId)}`, {
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
        const res = await fetch(`/api/community-messenger/rooms/${encodeURIComponent(roomId)}`, {
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
            return {
              ...prev,
              tabs: { ...prev.tabs, friends: nextFriends.length },
              friends: nextFriends,
            };
          });
          setSearchResults((prev) => prev.map((user) => (user.id === friendUserId ? { ...user, isFriend: false, isFavoriteFriend: false } : user)));
          setSheetProfile((prev) => (prev?.id === friendUserId ? null : prev));
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
        window.alert("접수되었습니다.");
        setSheetProfile(null);
      } else {
        setActionError("신고 접수에 실패했습니다.");
      }
    } finally {
      setBusyId(null);
    }
  }, []);

  return (
    <div className="space-y-4 px-4 py-3 pb-[calc(7rem+env(safe-area-inset-bottom,0px))]">
      {!loading && !authRequired && data ? (
        <>
          <MessengerPrimarySectionNav value={mainSection} onChange={onPrimarySectionChange} badge={sectionNavBadges} />

          {mainSection === "friends" ? (
            <section className="space-y-4 pt-3">
              <div className="border-b border-gray-200 pb-4">
                <p className="text-[12px] font-medium text-gray-500">내 프로필</p>
                <button
                  type="button"
                  onClick={() => data.me && setSheetProfile(data.me)}
                  className="mt-2 flex w-full items-center gap-3 border border-gray-200 bg-white px-3 py-3 text-left rounded-ui-rect"
                >
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-gray-100 text-center text-lg leading-[48px] text-gray-500">
                    {data.me?.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={data.me.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (data.me?.label ?? "?").slice(0, 1)
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-gray-900">{data.me?.label ?? "프로필"}</p>
                    <p className="truncate text-[12px] text-gray-500">{data.me?.subtitle ?? "상태 메시지를 설정해 보세요."}</p>
                  </div>
                  <span className="text-[12px] text-gray-400">편집</span>
                </button>
              </div>

              {favoriteFriends.length ? (
                <div>
                  <p className="text-[12px] font-medium text-gray-500">즐겨찾기</p>
                  <div className="mt-2 flex gap-3 overflow-x-auto pb-1">
                    {favoriteFriends.map((friend) => (
                      <div
                        key={friend.id}
                        className="flex w-[92px] shrink-0 flex-col items-center gap-2 border border-gray-200 bg-white px-2 py-3 rounded-ui-rect"
                      >
                        <button type="button" onClick={() => setSheetProfile(friend)} className="flex flex-col items-center gap-1">
                          <div className="h-11 w-11 overflow-hidden rounded-full bg-gray-100 text-center text-[14px] leading-[44px] text-gray-600">
                            {friend.avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={friend.avatarUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              friend.label.slice(0, 1)
                            )}
                          </div>
                          <span className="w-full truncate text-center text-[11px] font-medium text-gray-900">{friend.label}</span>
                        </button>
                        <div className="flex w-full gap-1">
                          <button
                            type="button"
                            className="flex-1 border border-gray-200 py-1 text-[10px] text-gray-700 rounded-ui-rect"
                            onClick={() => void startDirectRoom(friend.id)}
                          >
                            채팅
                          </button>
                          <button
                            type="button"
                            className="flex-1 border border-gray-200 py-1 text-[10px] text-gray-700 rounded-ui-rect"
                            onClick={() => void startDirectCall(friend.id, "voice")}
                          >
                            음성
                          </button>
                          <button
                            type="button"
                            className="flex-1 border border-gray-200 py-1 text-[10px] text-gray-700 rounded-ui-rect"
                            onClick={() => void startDirectCall(friend.id, "video")}
                          >
                            영상
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div>
                <p className="text-[12px] font-medium text-gray-500">친구 요청</p>
                <div className="mt-2 space-y-2">
                  {(data.requests ?? []).length ? (
                    (data.requests ?? []).map((request) => <RequestCard key={request.id} request={request} busyId={busyId} onAction={respondRequest} />)
                  ) : (
                    <p className="border border-dashed border-gray-200 px-4 py-6 text-center text-[12px] text-gray-500 rounded-ui-rect">새 요청이 없습니다.</p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-[12px] font-medium text-gray-500">친구 {sortedFriends.length}</p>
                <div className="mt-2 divide-y divide-gray-100 border border-gray-200 bg-white rounded-ui-rect">
                  {sortedFriends.length ? (
                    sortedFriends.map((friend) => (
                      <MessengerLineFriendRow
                        key={friend.id}
                        friend={friend}
                        busyFavorite={busyId === `favorite:${friend.id}`}
                        busyDelete={busyId === `remove-friend:${friend.id}`}
                        onRowPress={() => setSheetProfile(friend)}
                        onToggleFavorite={() => void toggleFavoriteFriend(friend.id)}
                        onDelete={() => void removeFriend(friend.id, { confirm: false })}
                      />
                    ))
                  ) : (
                    <div className="px-4 py-8 text-center text-[13px] text-gray-500">아직 친구가 없습니다.</div>
                  )}
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setFriendsHiddenOpen((v) => !v)}
                  className="flex w-full items-center justify-between border border-gray-200 bg-white px-3 py-3 text-[13px] text-gray-800 rounded-ui-rect"
                >
                  <span>숨김 · 차단</span>
                  <span className="text-gray-400">{friendsHiddenOpen ? "접기" : "펼치기"}</span>
                </button>
                {friendsHiddenOpen ? (
                  <div className="mt-2 space-y-3">
                    <p className="text-[12px] text-gray-500">차단된 계정</p>
                    <div className="divide-y divide-gray-100 border border-gray-200 bg-white rounded-ui-rect">
                      {(data.blocked ?? []).length ? (
                        (data.blocked ?? []).map((p) => (
                          <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                            <span className="truncate text-[14px] text-gray-900">{p.label}</span>
                            <button
                              type="button"
                              className="shrink-0 text-[12px] text-gray-500"
                              onClick={() => void toggleBlock(p.id)}
                            >
                              해제
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="px-3 py-6 text-center text-[12px] text-gray-500">차단된 친구가 없습니다.</div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {mainSection === "chats" ? (
            <section className="pt-3">
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {CHAT_SUB_FILTER_ORDER.map((fid) => (
                  <button
                    key={fid}
                    type="button"
                    onClick={() => onChatSubFilterChange(fid)}
                    className={`shrink-0 rounded-full px-3 py-2 text-[12px] font-medium ${
                      chatSubFilter === fid ? "bg-gray-900 text-white" : "border border-gray-200 bg-white text-gray-600"
                    }`}
                  >
                    {fid === "unread" ? (
                      <span className="flex items-center gap-1">
                        {messengerChatSubFilterLabel(fid)}
                        {totalUnreadCount > 0 ? (
                          <span className="rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{totalUnreadCount > 99 ? "99+" : totalUnreadCount}</span>
                        ) : null}
                      </span>
                    ) : (
                      messengerChatSubFilterLabel(fid)
                    )}
                  </button>
                ))}
              </div>
              {primaryListItems.length ? (
                <div className="divide-y divide-gray-100 border border-gray-200 bg-white rounded-ui-rect">
                  {primaryListItems.map((item) => (
                    <RoomListCard
                      key={item.room.id}
                      item={item}
                      favoriteFriendIds={favoriteFriendIds}
                      busyId={busyId}
                      onTogglePin={(room) => void updateRoomParticipantState(room.id, { isPinned: !room.isPinned })}
                      onToggleMute={(room) => void updateRoomParticipantState(room.id, { isMuted: !room.isMuted })}
                      onMarkRead={(room) => void markRoomRead(room.id)}
                      onToggleArchive={(room) => void toggleRoomArchive(room.id, !communityMessengerRoomIsInboxHidden(room))}
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-2 border border-dashed border-gray-200 px-4 py-10 text-center text-[13px] text-gray-500 rounded-ui-rect">조건에 맞는 대화가 없습니다.</div>
              )}
            </section>
          ) : null}

          {mainSection === "open_chat" ? (
            <section className="space-y-4 pt-3">
              <div>
                <p className="mb-2 text-[12px] font-medium text-gray-500">참여 중인 오픈채팅</p>
                {openChatJoinedItems.length ? (
                  <div className="divide-y divide-gray-100 border border-gray-200 bg-white rounded-ui-rect">
                    {openChatJoinedItems.map((item) => (
                      <RoomListCard
                        key={item.room.id}
                        item={item}
                        favoriteFriendIds={favoriteFriendIds}
                        busyId={busyId}
                        onTogglePin={(room) => void updateRoomParticipantState(room.id, { isPinned: !room.isPinned })}
                        onToggleMute={(room) => void updateRoomParticipantState(room.id, { isMuted: !room.isMuted })}
                        onMarkRead={(room) => void markRoomRead(room.id)}
                        onToggleArchive={(room) => void toggleRoomArchive(room.id, !communityMessengerRoomIsInboxHidden(room))}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="border border-dashed border-gray-200 px-4 py-8 text-center text-[13px] text-gray-500 rounded-ui-rect">참여 중인 오픈채팅이 없습니다.</p>
                )}
              </div>
              <div>
                <p className="mb-2 text-[12px] font-medium text-gray-500">탐색</p>
                <div className="space-y-2">
                  {filteredDiscoverableGroups.length ? (
                    filteredDiscoverableGroups.map((group) => (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => void openJoinModal(group.id)}
                        className="flex w-full items-center justify-between gap-2 border border-gray-200 bg-white px-3 py-3 text-left rounded-ui-rect"
                      >
                        <span className="truncate text-[14px] font-medium text-gray-900">{group.title}</span>
                        <span className="shrink-0 text-[12px] text-gray-400">{group.isJoined ? "참여중" : "보기"}</span>
                      </button>
                    ))
                  ) : (
                    <p className="text-[13px] text-gray-500">표시할 오픈채팅이 없습니다.</p>
                  )}
                </div>
              </div>
            </section>
          ) : null}

          {mainSection === "archive" ? (
            <section className="pt-3">
              {primaryListItems.length ? (
                <div className="divide-y divide-gray-100 border border-gray-200 bg-white rounded-ui-rect">
                  {primaryListItems.map((item) => (
                    <RoomListCard
                      key={item.room.id}
                      item={item}
                      favoriteFriendIds={favoriteFriendIds}
                      busyId={busyId}
                      onTogglePin={(room) => void updateRoomParticipantState(room.id, { isPinned: !room.isPinned })}
                      onToggleMute={(room) => void updateRoomParticipantState(room.id, { isMuted: !room.isMuted })}
                      onMarkRead={(room) => void markRoomRead(room.id)}
                      onToggleArchive={(room) => void toggleRoomArchive(room.id, !communityMessengerRoomIsInboxHidden(room))}
                    />
                  ))}
                </div>
              ) : (
                <div className="border border-dashed border-gray-200 px-4 py-10 text-center text-[13px] text-gray-500 rounded-ui-rect">보관된 대화가 없습니다.</div>
              )}
            </section>
          ) : null}
        </>
      ) : null}

      {actionError ? (
        <div className="rounded-ui-rect border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">{actionError}</div>
      ) : null}

      {loading ? (
        <div className="rounded-ui-rect border border-gray-200 bg-white px-4 py-10 text-center text-[14px] text-gray-500">
          메신저 데이터를 불러오는 중입니다.
        </div>
      ) : null}

      {!loading && authRequired ? (
        <section className="rounded-ui-rect border border-gray-200 bg-white px-4 py-8 text-center">
          <p className="text-[16px] font-semibold text-gray-900">로그인이 필요합니다.</p>
          <p className="mt-2 text-[13px] text-gray-500">{pageError ?? t("nav_messenger_login_required")}</p>
          <div className="mt-4 flex justify-center">
            <Link
              href="/login"
              className="rounded-ui-rect bg-gray-900 px-4 py-3 text-[14px] font-semibold text-white"
            >
              로그인하러 가기
            </Link>
          </div>
        </section>
      ) : null}

      {!loading && !authRequired && !data ? (
        <section className="rounded-ui-rect border border-gray-200 bg-white px-4 py-8 text-center">
          <p className="text-[16px] font-semibold text-gray-900">메신저를 불러오지 못했습니다.</p>
          <p className="mt-2 text-[13px] text-gray-500">{pageError ?? t("common_try_again_later")}</p>
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-ui-rect bg-gray-900 px-4 py-3 text-[14px] font-semibold text-white"
            >
              다시 불러오기
            </button>
          </div>
        </section>
      ) : null}

      {sheetProfile ? (
        <MessengerFriendProfileSheet
          key={sheetProfile.id}
          profile={sheetProfile}
          busyId={busyId}
          onClose={() => setSheetProfile(null)}
          onVoiceCall={() => {
            const id = sheetProfile.id;
            setSheetProfile(null);
            void startDirectCall(id, "voice");
          }}
          onVideoCall={() => {
            const id = sheetProfile.id;
            setSheetProfile(null);
            void startDirectCall(id, "video");
          }}
          onChat={() => {
            const id = sheetProfile.id;
            setSheetProfile(null);
            void startDirectRoom(id);
          }}
          onToggleFavorite={() => {
            void toggleFavoriteFriend(sheetProfile.id);
          }}
          onRemoveFriend={sheetProfile.isFriend ? () => void removeFriend(sheetProfile.id) : undefined}
          onBlock={sheetProfile.id !== data?.me?.id ? () => void toggleBlock(sheetProfile.id) : undefined}
          onReport={sheetProfile.id !== data?.me?.id ? () => void reportCommunityUser(sheetProfile.id) : undefined}
        />
      ) : null}

      {searchSheetOpen ? (
        <div className="fixed inset-0 z-[42] flex flex-col justify-end bg-black/40">
          <button type="button" className="min-h-0 flex-1 cursor-default" aria-label="닫기" onClick={() => setSearchSheetOpen(false)} />
          <div className="rounded-t-[12px] bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_32px_rgba(0,0,0,0.12)]">
            <p className="text-center text-[14px] font-semibold text-gray-900">메신저 검색</p>
            <input
              value={roomSearchKeyword}
              onChange={(e) => setRoomSearchKeyword(e.target.value)}
              placeholder="대화방, 메시지, 그룹 이름 검색"
              className="mt-4 h-11 w-full rounded-ui-rect border border-gray-200 px-3 text-[14px] outline-none focus:border-gray-400"
            />
            <div className="mt-3 space-y-2">
              {searchSheetRoomItems.map((item) => (
                <RoomListCard
                  key={`search-${item.room.id}`}
                  item={item}
                  favoriteFriendIds={favoriteFriendIds}
                  busyId={busyId}
                  onTogglePin={(room) => void updateRoomParticipantState(room.id, { isPinned: !room.isPinned })}
                  onToggleMute={(room) => void updateRoomParticipantState(room.id, { isMuted: !room.isMuted })}
                  onMarkRead={(room) => void markRoomRead(room.id)}
                  onToggleArchive={(room) =>
                    void toggleRoomArchive(room.id, !communityMessengerRoomIsInboxHidden(room))
                  }
                  compact
                />
              ))}
              {searchSheetRoomItems.length === 0 ? (
                <div className="rounded-ui-rect bg-gray-50 px-4 py-8 text-center text-[13px] text-gray-500">검색 결과가 없습니다.</div>
              ) : null}
            </div>
            <button type="button" className="mt-3 w-full py-2 text-[14px] text-gray-500" onClick={() => setSearchSheetOpen(false)}>
              닫기
            </button>
          </div>
        </div>
      ) : null}

      {composerOpen ? (
        <div className="fixed inset-0 z-[42] flex flex-col justify-end bg-black/40">
          <button type="button" className="min-h-0 flex-1 cursor-default" aria-label="닫기" onClick={() => setComposerOpen(false)} />
          <div className="rounded-t-[12px] bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_32px_rgba(0,0,0,0.12)]">
            <p className="text-center text-[14px] font-semibold text-gray-900">새 대화</p>
            <button
              type="button"
              className="mt-4 w-full rounded-ui-rect border border-gray-200 py-3.5 text-[15px] font-medium text-gray-900"
              onClick={() => {
                setComposerOpen(false);
                setFriendAddTab("id");
                setFriendManagerOpen(true);
                requestAnimationFrame(() => friendSearchRef.current?.focus());
              }}
            >
              친구와 대화 시작
            </button>
            <button
              type="button"
              className="mt-2 w-full rounded-ui-rect border border-gray-200 py-3.5 text-[15px] font-medium text-gray-900"
              onClick={() => {
                setComposerOpen(false);
                setFriendAddTab("id");
                setFriendManagerOpen(true);
                requestAnimationFrame(() => friendSearchRef.current?.focus());
              }}
            >
              친구 추가
            </button>
            <button
              type="button"
              className="mt-2 w-full rounded-ui-rect border border-gray-200 py-3.5 text-[15px] font-medium text-gray-900"
              onClick={() => {
                setComposerOpen(false);
                setGroupCreateStep("select");
              }}
            >
              그룹 만들기
            </button>
            <button
              type="button"
              className="mt-2 w-full rounded-ui-rect border border-gray-200 py-3.5 text-[15px] font-medium text-gray-900"
              onClick={() => {
                setComposerOpen(false);
                setPublicGroupFindOpen(true);
              }}
            >
              오픈채팅 찾기
            </button>
            <button type="button" className="mt-3 w-full py-2 text-[14px] text-gray-500" onClick={() => setComposerOpen(false)}>
              취소
            </button>
          </div>
        </div>
      ) : null}

      {friendManagerOpen && data ? (
        <div className="fixed inset-0 z-[43] flex flex-col justify-end bg-black/45">
          <button type="button" className="min-h-0 flex-1 cursor-default" aria-label="닫기" onClick={() => setFriendManagerOpen(false)} />
          <div className="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-[14px] border-t border-gray-100 bg-white shadow-[0_-8px_32px_rgba(0,0,0,0.12)]">
            <div className="flex shrink-0 items-center justify-between px-4 py-3.5">
              <p className="text-[17px] font-semibold text-gray-900">친구 추가</p>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
                aria-label="닫기"
                onClick={() => setFriendManagerOpen(false)}
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex shrink-0 border-b border-gray-200 px-4">
              <button
                type="button"
                onClick={() => setFriendAddTab("contacts")}
                className={`relative flex-1 py-3 text-[15px] ${
                  friendAddTab === "contacts" ? "font-semibold text-gray-900" : "font-medium text-gray-500"
                }`}
              >
                연락처로 추가
                {friendAddTab === "contacts" ? (
                  <span className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full bg-gray-900" />
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => setFriendAddTab("id")}
                className={`relative flex-1 py-3 text-[15px] ${
                  friendAddTab === "id" ? "font-semibold text-gray-900" : "font-medium text-gray-500"
                }`}
              >
                ID로 추가
                {friendAddTab === "id" ? (
                  <span className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full bg-gray-900" />
                ) : null}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
              {friendAddTab === "contacts" ? (
                <p className="rounded-ui-rect border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-[13px] leading-relaxed text-gray-600">
                  웹에서는 휴대폰 연락처를 불러오지 않습니다. ID로 추가 탭에서 닉네임 또는 아이디로 검색해 주세요.
                </p>
              ) : (
                <>
                  <div className="relative">
                    <div className="flex justify-end text-[12px] tabular-nums text-gray-400">{searchKeyword.length}/20</div>
                    <input
                      ref={friendSearchRef}
                      value={searchKeyword}
                      onChange={(e) => setSearchKeyword(e.target.value.slice(0, 20))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void searchUsers();
                        }
                      }}
                      maxLength={20}
                      placeholder="닉네임 또는 아이디"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      className="w-full border-0 border-b-2 border-gray-900 bg-transparent px-0 py-2 text-[16px] text-gray-900 outline-none ring-0 placeholder:text-gray-400 focus:border-gray-900"
                    />
                    <p className="mt-2 text-[12px] text-gray-500">
                      검색을 허용한 사용자만 찾을 수 있습니다. 친구가 되면 아래 목록에 표시됩니다.
                    </p>
                    <button
                      type="button"
                      onClick={() => void searchUsers()}
                      disabled={busyId === "user-search"}
                      className="mt-4 w-full rounded-ui-rect bg-gray-900 py-3 text-[15px] font-semibold text-white disabled:opacity-50"
                    >
                      {busyId === "user-search" ? "검색 중…" : "검색"}
                    </button>
                  </div>
                  <div className="mt-4 space-y-2">
                    {searchResults.length === 0 ? (
                      <p className="rounded-ui-rect bg-gray-50 px-3 py-4 text-center text-[13px] text-gray-500">
                        {!friendUserSearchAttempted
                          ? "닉네임 또는 아이디를 입력한 뒤 검색을 눌러 주세요."
                          : "검색 결과가 없습니다."}
                      </p>
                    ) : (
                      searchResults.map((user) => (
                        <ProfileCard
                          key={user.id}
                          profile={user}
                          actionSlot={
                            <>
                              <button
                                type="button"
                                onClick={() => void toggleFollow(user.id)}
                                disabled={busyId === `follow:${user.id}`}
                                className="rounded-ui-rect border border-gray-200 px-3 py-2 text-[12px] font-medium text-gray-700"
                              >
                                {user.following ? "팔로우 해제" : "팔로우"}
                              </button>
                              {user.isFriend ? (
                                <button
                                  type="button"
                                  onPointerEnter={() => maybePrefetchDirectRoom(user.id)}
                                  onClick={() => setSheetProfile(user)}
                                  disabled={busyId === `room:${user.id}` || busyId === `call:voice:${user.id}` || busyId === `call:video:${user.id}`}
                                  className="rounded-ui-rect bg-gray-900 px-3 py-2 text-[12px] font-semibold text-white"
                                >
                                  선택
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => void requestFriend(user.id)}
                                  disabled={busyId === `friend:${user.id}` || user.blocked}
                                  className="rounded-ui-rect bg-[#111827] px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-40"
                                >
                                  친구 요청
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => void toggleBlock(user.id)}
                                disabled={busyId === `block:${user.id}`}
                                className={`rounded-ui-rect px-3 py-2 text-[12px] font-medium ${
                                  user.blocked ? "bg-red-50 text-red-700" : "border border-red-200 text-red-600"
                                }`}
                              >
                                {user.blocked ? "차단 해제" : "차단"}
                              </button>
                            </>
                          }
                        />
                      ))
                    )}
                  </div>
                </>
              )}
              <div className="mt-6 space-y-4">
                <InfoSection title="내 프로필">
                  <ProfileCard
                    profile={
                      data.me ?? {
                        id: "me",
                        label: "내 프로필",
                        avatarUrl: null,
                        following: false,
                        blocked: false,
                        isFriend: false,
                        isFavoriteFriend: false,
                      }
                    }
                    actionSlot={<span className="text-[12px] text-gray-500">메신저 기본 프로필</span>}
                  />
                </InfoSection>
                <InfoSection title={`친구 ${sortedFriends.length}`}>
                  {sortedFriends.length ? (
                    sortedFriends.map((friend) => (
                      <MessengerLineFriendRow
                        key={friend.id}
                        friend={friend}
                        busyFavorite={busyId === `favorite:${friend.id}`}
                        busyDelete={busyId === `remove-friend:${friend.id}`}
                        onRowPress={() => setSheetProfile(friend)}
                        onToggleFavorite={() => void toggleFavoriteFriend(friend.id)}
                        onDelete={() => void removeFriend(friend.id, { confirm: false })}
                      />
                    ))
                  ) : (
                    <EmptyCard message="아직 친구가 없습니다. ID로 추가 탭에서 검색해 보세요." />
                  )}
                </InfoSection>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {requestSheetOpen ? (
        <div className="fixed inset-0 z-[42] flex flex-col justify-end bg-black/40">
          <button type="button" className="min-h-0 flex-1 cursor-default" aria-label="닫기" onClick={() => setRequestSheetOpen(false)} />
          <div className="max-h-[70vh] overflow-y-auto rounded-t-[12px] bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_32px_rgba(0,0,0,0.12)]">
            <p className="text-center text-[14px] font-semibold text-gray-900">알림센터</p>
            <div className="mt-3 space-y-2">
              {notificationCenterItems.length ? (
                notificationCenterItems.map((item) =>
                  item.kind === "request" ? (
                    <RequestCard
                      key={item.id}
                      request={item.request}
                      busyId={busyId}
                      onAction={respondRequest}
                    />
                  ) : (
                    <NotificationCenterCallCard
                      key={item.id}
                      call={item.call}
                      onOpen={() => {
                        setRequestSheetOpen(false);
                        if (item.call.roomId) {
                          navigateToCommunityRoom(item.call.roomId);
                        }
                      }}
                    />
                  )
                )
              ) : (
                <p className="py-8 text-center text-[13px] text-gray-500">새 알림이 없습니다.</p>
              )}
            </div>
            <button
              type="button"
              className="mt-2 w-full py-3 text-[14px] font-medium text-gray-600"
              onClick={() => setRequestSheetOpen(false)}
            >
              닫기
            </button>
          </div>
        </div>
      ) : null}

      {settingsSheetOpen && data ? (
        <div className="fixed inset-0 z-[43] flex flex-col justify-end bg-black/45">
          <button
            type="button"
            className="min-h-0 flex-1 cursor-default"
            aria-label="닫기"
            onClick={() => setSettingsSheetOpen(false)}
          />
          <div className="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-[14px] border-t border-gray-100 bg-white shadow-[0_-8px_32px_rgba(0,0,0,0.12)]">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3.5">
              <p className="text-[17px] font-semibold text-gray-900">설정</p>
              <button
                type="button"
                className="rounded-ui-rect px-3 py-1.5 text-[15px] text-gray-600"
                onClick={() => setSettingsSheetOpen(false)}
              >
                닫기
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
              <div className="space-y-5">
                <MessengerSettingsBlock title="알림">
                  <SettingsToggleRow
                    title="메신저·1:1 채팅"
                    description="일반 대화 알림"
                    checked={notificationSettings.community_chat_enabled}
                    disabled={busyId === "notification-setting:community_chat_enabled"}
                    onChange={(next) => void updateNotificationSetting("community_chat_enabled", next)}
                  />
                  <SettingsToggleRow
                    title="거래 채팅"
                    description="중고·거래 연결 알림"
                    checked={notificationSettings.trade_chat_enabled}
                    disabled={busyId === "notification-setting:trade_chat_enabled"}
                    onChange={(next) => void updateNotificationSetting("trade_chat_enabled", next)}
                  />
                  <SettingsToggleRow
                    title="주문·배달"
                    checked={notificationSettings.order_enabled}
                    disabled={busyId === "notification-setting:order_enabled"}
                    onChange={(next) => void updateNotificationSetting("order_enabled", next)}
                  />
                  <SettingsToggleRow
                    title="매장"
                    description="매장 공지·운영 알림"
                    checked={notificationSettings.store_enabled}
                    disabled={busyId === "notification-setting:store_enabled"}
                    onChange={(next) => void updateNotificationSetting("store_enabled", next)}
                  />
                  <SettingsToggleRow
                    title="벨소리·수신 통화 톤"
                    checked={incomingCallSoundEnabled && notificationSettings.sound_enabled}
                    onChange={(next) => {
                      setIncomingCallSoundEnabled(next);
                      setCommunityMessengerIncomingCallSoundEnabled(next);
                      void updateNotificationSetting("sound_enabled", next);
                    }}
                  />
                  <SettingsToggleRow
                    title="수신 통화 화면 안내"
                    description="배너·오버레이"
                    checked={incomingCallBannerEnabled}
                    onChange={(next) => {
                      setIncomingCallBannerEnabled(next);
                      setCommunityMessengerIncomingCallBannerEnabled(next);
                    }}
                  />
                  <SettingsToggleRow
                    title="진동"
                    checked={notificationSettings.vibration_enabled}
                    disabled={busyId === "notification-setting:vibration_enabled"}
                    onChange={(next) => void updateNotificationSetting("vibration_enabled", next)}
                  />
                </MessengerSettingsBlock>

                <MessengerSettingsBlock title="통화">
                  <CommunityMessengerDeviceSettingsSection visible={Boolean(settingsSheetOpen && data)} embedded />
                </MessengerSettingsBlock>

                <MessengerSettingsBlock title="친구">
                  <div className="px-3 py-2">
                    <p className="text-[12px] font-medium text-gray-800">차단</p>
                    {data.blocked.length ? (
                      <div className="mt-2 space-y-2">
                        {data.blocked.map((user) => (
                          <div key={user.id} className="flex items-center justify-between gap-2 border-b border-gray-100 py-2 last:border-0">
                            <span className="truncate text-[14px] text-gray-900">{user.label}</span>
                            <button
                              type="button"
                              onClick={() => void toggleBlock(user.id)}
                              disabled={busyId === `block:${user.id}`}
                              className="shrink-0 text-[12px] font-medium text-gray-600"
                            >
                              해제
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-[12px] text-gray-500">차단된 사용자가 없습니다.</p>
                    )}
                  </div>
                  <div className="px-3 py-2">
                    <p className="text-[12px] font-medium text-gray-800">즐겨찾기 관리</p>
                    {favoriteFriends.length ? (
                      <div className="mt-2 space-y-2">
                        {favoriteFriends.map((friend) => (
                          <div key={friend.id} className="flex items-center justify-between gap-2 border-b border-gray-100 py-2 last:border-0">
                            <span className="truncate text-[14px] text-gray-900">{friend.label}</span>
                            <button
                              type="button"
                              onClick={() => void removeFriend(friend.id)}
                              disabled={busyId === `remove-friend:${friend.id}`}
                              className="shrink-0 text-[12px] font-medium text-gray-600"
                            >
                              삭제
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-[12px] text-gray-500">즐겨찾기 친구가 없습니다.</p>
                    )}
                  </div>
                </MessengerSettingsBlock>

                <MessengerSettingsBlock title="채팅 · 보관">
                  <p className="px-3 py-3 text-[12px] leading-relaxed text-gray-500">
                    링크 미리보기, 미디어 자동 저장, 대화 백업 등은 이후 버전에서 연결됩니다. 지금은 방 단위 보관은 채팅 목록에서 스와이프로 할 수 있습니다.
                  </p>
                </MessengerSettingsBlock>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {publicGroupFindOpen && data ? (
        <div className="fixed inset-0 z-[43] flex flex-col justify-end bg-black/45">
          <button
            type="button"
            className="min-h-0 flex-1 cursor-default"
            aria-label="닫기"
            onClick={() => setPublicGroupFindOpen(false)}
          />
          <div className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-[14px] border-t border-gray-100 bg-white shadow-[0_-8px_32px_rgba(0,0,0,0.12)]">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3.5">
              <p className="text-[17px] font-semibold text-gray-900">공개 그룹</p>
              <button
                type="button"
                className="rounded-ui-rect px-3 py-1.5 text-[15px] text-gray-600"
                onClick={() => setPublicGroupFindOpen(false)}
              >
                닫기
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
              <input
                value={openGroupSearch}
                onChange={(e) => setOpenGroupSearch(e.target.value)}
                placeholder="검색"
                className="h-11 w-full rounded-ui-rect border border-gray-200 px-3 text-[14px] outline-none focus:border-gray-400"
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
                  <div className="py-10 text-center text-[13px] text-gray-500">검색 결과가 없습니다.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {groupCreateStep !== "closed" ? (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 px-4 pb-6 pt-10">
          <div className="w-full max-w-[520px] rounded-ui-rect bg-white p-5 shadow-2xl">
            {groupCreateStep === "select" ? (
              <>
                <p className="text-[13px] font-medium text-gray-700">그룹 생성</p>
                <h2 className="mt-1 text-[20px] font-semibold text-gray-900">어떤 그룹을 만들까요?</h2>
                <div className="mt-4 grid gap-3">
                  <button
                    type="button"
                    onClick={() => setGroupCreateStep("private_group")}
                    className="rounded-ui-rect border border-gray-200 px-4 py-4 text-left transition hover:border-gray-400 hover:bg-gray-50"
                  >
                    <p className="text-[12px] text-gray-500">친구 초대형</p>
                    <p className="mt-1 text-[16px] font-semibold text-gray-900">비공개 그룹</p>
                    <p className="mt-1 text-[13px] text-gray-500">친구를 선택해 바로 만드는 초대형 그룹입니다.</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroupCreateStep("open_group")}
                    className="rounded-ui-rect border border-gray-200 px-4 py-4 text-left transition hover:border-[#111827] hover:bg-gray-50"
                  >
                    <p className="text-[12px] text-gray-500">방장 생성형</p>
                    <p className="mt-1 text-[16px] font-semibold text-gray-900">공개 그룹</p>
                    <p className="mt-1 text-[13px] text-gray-500">목록 노출, 비밀번호/자유입장, 실명/별칭 정책을 설정합니다.</p>
                  </button>
                </div>
              </>
            ) : null}

            {groupCreateStep === "private_group" ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-medium text-gray-700">비공개 그룹</p>
                    <h2 className="mt-1 text-[20px] font-semibold text-gray-900">친구 초대형 그룹 만들기</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setGroupCreateStep("select")}
                    className="rounded-ui-rect border border-gray-200 px-3 py-2 text-[12px] text-gray-700"
                  >
                    이전
                  </button>
                </div>
                <input
                  value={groupTitle}
                  onChange={(e) => setGroupTitle(e.target.value)}
                  placeholder="예: 사마켓 운영팀 (선택 입력)"
                  className="mt-4 h-11 w-full rounded-ui-rect border border-gray-200 px-3 text-[14px] outline-none focus:border-gray-400"
                />
                <div className="mt-3 flex items-center justify-between gap-3 text-[12px] text-gray-500">
                  <span>선택된 친구 {groupMembers.length}명</span>
                  {groupMembers.length ? (
                    <button
                      type="button"
                      onClick={() => setGroupMembers([])}
                      className="rounded-ui-rect border border-gray-200 px-3 py-1.5 text-[12px] font-medium text-gray-700"
                    >
                      선택 해제
                    </button>
                  ) : null}
                </div>
                {groupTitlePreview ? (
                  <div className="mt-3 rounded-ui-rect bg-gray-50 px-3 py-3 text-[12px] text-gray-600">
                    생성 예정 그룹명: <span className="font-semibold text-gray-900">{groupTitlePreview}</span>
                  </div>
                ) : null}
                <div className="mt-3 max-h-[280px] space-y-2 overflow-y-auto">
                  {(data?.friends ?? []).map((friend) => {
                    const checked = groupMembers.includes(friend.id);
                    return (
                      <label key={friend.id} className="flex items-center justify-between rounded-ui-rect border border-gray-100 px-3 py-3">
                        <div>
                          <p className="text-[14px] font-medium text-gray-900">{friend.label}</p>
                          <p className="text-[12px] text-gray-500">{friend.subtitle ?? "친구"}</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setGroupMembers((prev) =>
                              e.target.checked ? [...prev, friend.id] : prev.filter((id) => id !== friend.id)
                            );
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-gray-700 focus:ring-gray-400"
                        />
                      </label>
                    );
                  })}
                </div>
                {(data?.friends ?? []).length === 0 ? (
                  <div className="mt-4 rounded-ui-rect border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-center">
                    <p className="text-[14px] font-semibold text-gray-900">초대할 친구가 아직 없습니다.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setGroupCreateStep("closed");
                        setFriendManagerOpen(true);
                        requestAnimationFrame(() => friendSearchRef.current?.focus());
                      }}
                      className="mt-3 rounded-ui-rect bg-gray-900 px-4 py-3 text-[13px] font-semibold text-white"
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
                    <p className="text-[13px] font-medium text-[#111827]">공개 그룹</p>
                    <h2 className="mt-1 text-[20px] font-semibold text-gray-900">방장 설정형 그룹 만들기</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setGroupCreateStep("select")}
                    className="rounded-ui-rect border border-gray-200 px-3 py-2 text-[12px] text-gray-700"
                  >
                    이전
                  </button>
                </div>
                <div className="mt-4 grid gap-3">
                  <input
                    value={openGroupTitle}
                    onChange={(e) => setOpenGroupTitle(e.target.value)}
                    placeholder="공개 그룹 제목"
                    className="h-11 w-full rounded-ui-rect border border-gray-200 px-3 text-[14px] outline-none focus:border-gray-400"
                  />
                  <textarea
                    value={openGroupSummary}
                    onChange={(e) => setOpenGroupSummary(e.target.value)}
                    rows={3}
                    placeholder="방 소개를 입력하세요"
                    className="w-full rounded-ui-rect border border-gray-200 px-3 py-3 text-[14px] outline-none focus:border-gray-400"
                  />
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="rounded-ui-rect border border-gray-100 px-3 py-3">
                      <p className="text-[13px] font-semibold text-gray-900">입장 방식</p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setOpenGroupJoinPolicy("password")}
                          className={`rounded-ui-rect px-3 py-2 text-[12px] font-semibold ${openGroupJoinPolicy === "password" ? "bg-[#111827] text-white" : "bg-gray-100 text-gray-700"}`}
                        >
                          비밀번호
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenGroupJoinPolicy("free");
                            setOpenGroupPassword("");
                          }}
                          className={`rounded-ui-rect px-3 py-2 text-[12px] font-semibold ${openGroupJoinPolicy === "free" ? "bg-[#111827] text-white" : "bg-gray-100 text-gray-700"}`}
                        >
                          자유 입장
                        </button>
                      </div>
                    </label>
                    <label className="rounded-ui-rect border border-gray-100 px-3 py-3">
                      <p className="text-[13px] font-semibold text-gray-900">신원 정책</p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setOpenGroupIdentityPolicy("real_name");
                            setOpenGroupCreatorIdentityMode("real_name");
                          }}
                          className={`rounded-ui-rect px-3 py-2 text-[12px] font-semibold ${openGroupIdentityPolicy === "real_name" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"}`}
                        >
                          실명 기반
                        </button>
                        <button
                          type="button"
                          onClick={() => setOpenGroupIdentityPolicy("alias_allowed")}
                          className={`rounded-ui-rect px-3 py-2 text-[12px] font-semibold ${openGroupIdentityPolicy === "alias_allowed" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"}`}
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
                        className="h-11 w-full rounded-ui-rect border border-gray-200 px-3 text-[14px] outline-none focus:border-gray-400"
                      />
                    ) : (
                      <div className="flex h-11 items-center rounded-ui-rect bg-gray-50 px-3 text-[13px] text-gray-500">
                        자유 입장 선택됨
                      </div>
                    )}
                    <input
                      value={openGroupMemberLimit}
                      onChange={(e) => setOpenGroupMemberLimit(e.target.value.replace(/[^0-9]/g, ""))}
                      placeholder="최대 인원"
                      className="h-11 w-full rounded-ui-rect border border-gray-200 px-3 text-[14px] outline-none focus:border-gray-400"
                    />
                  </div>
                  <label className="flex items-center justify-between rounded-ui-rect border border-gray-100 px-3 py-3">
                    <div>
                      <p className="text-[14px] font-medium text-gray-900">목록에 공개</p>
                      <p className="text-[12px] text-gray-500">OFF면 내 그룹에는 남지만 공개 그룹 찾기에는 노출되지 않습니다.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={openGroupDiscoverable}
                      onChange={(e) => setOpenGroupDiscoverable(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-gray-700 focus:ring-gray-400"
                    />
                  </label>
                  {openGroupIdentityPolicy === "alias_allowed" ? (
                    <div className="rounded-ui-rect border border-gray-100 bg-gray-50 px-4 py-4">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setOpenGroupCreatorIdentityMode("real_name")}
                          className={`rounded-ui-rect px-3 py-2 text-[12px] font-semibold ${openGroupCreatorIdentityMode === "real_name" ? "bg-gray-900 text-white" : "bg-white text-gray-700"}`}
                        >
                          방장도 실명 사용
                        </button>
                        <button
                          type="button"
                          onClick={() => setOpenGroupCreatorIdentityMode("alias")}
                          className={`rounded-ui-rect px-3 py-2 text-[12px] font-semibold ${openGroupCreatorIdentityMode === "alias" ? "bg-gray-900 text-white" : "bg-white text-gray-700"}`}
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
                            className="h-11 w-full rounded-ui-rect border border-gray-200 px-3 text-[14px] outline-none focus:border-gray-400"
                          />
                          <input
                            value={openGroupCreatorAliasAvatarUrl}
                            onChange={(e) => setOpenGroupCreatorAliasAvatarUrl(e.target.value)}
                            placeholder="아바타 URL (선택)"
                            className="h-11 w-full rounded-ui-rect border border-gray-200 px-3 text-[14px] outline-none focus:border-gray-400"
                          />
                          <textarea
                            value={openGroupCreatorAliasBio}
                            onChange={(e) => setOpenGroupCreatorAliasBio(e.target.value)}
                            rows={2}
                            placeholder="방장 소개 (선택)"
                            className="w-full rounded-ui-rect border border-gray-200 px-3 py-3 text-[14px] outline-none focus:border-gray-400"
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
                className="flex-1 rounded-ui-rect border border-gray-200 px-4 py-3 text-[14px] font-medium text-gray-700"
              >
                닫기
              </button>
              {groupCreateStep === "private_group" ? (
                <button
                  type="button"
                  onClick={() => void createPrivateGroup()}
                  disabled={busyId === "create-private-group" || groupMembers.length === 0}
                  className="flex-1 rounded-ui-rect bg-gray-900 px-4 py-3 text-[14px] font-semibold text-white disabled:opacity-40"
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
                  className="flex-1 rounded-ui-rect bg-[#111827] px-4 py-3 text-[14px] font-semibold text-white disabled:opacity-40"
                >
                  {busyId === "create-open-group" ? "생성 중..." : "공개 그룹 생성"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {joinTargetGroup ? (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 px-4 pb-6 pt-10">
          <div className="w-full max-w-[440px] rounded-ui-rect bg-white p-5 shadow-2xl">
            <p className="text-[13px] font-medium text-gray-700">공개 그룹 입장</p>
            <h2 className="mt-1 text-[20px] font-semibold text-gray-900">{joinTargetGroup.title}</h2>
            <p className="mt-2 text-[13px] leading-5 text-gray-500">
              {joinTargetGroup.summary || "입장 정책을 확인한 뒤 이 방에 참여할 수 있습니다."}
            </p>
            <div className="mt-4 rounded-ui-rect bg-gray-50 px-4 py-3 text-[12px] text-gray-600">
              방장 {joinTargetGroup.ownerLabel} · 현재 {joinTargetGroup.memberCount}명
              {joinTargetGroup.memberLimit ? ` / 최대 ${joinTargetGroup.memberLimit}명` : ""}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
              <span className="rounded-full bg-sky-50 px-2 py-1 text-sky-700">
                {joinTargetGroup.joinPolicy === "password" ? "비밀번호 입장" : "자유 입장"}
              </span>
              <span className="rounded-full bg-violet-50 px-2 py-1 text-violet-700">
                {joinTargetGroup.identityPolicy === "alias_allowed" ? "별칭 참여 허용" : "실명 기반"}
              </span>
            </div>
            {joinTargetGroup.joinPolicy === "password" ? (
              <input
                value={joinPassword}
                onChange={(e) => setJoinPassword(e.target.value)}
                placeholder="비밀번호 입력"
                className="mt-4 h-11 w-full rounded-ui-rect border border-gray-200 px-3 text-[14px] outline-none focus:border-gray-400"
              />
            ) : null}
            <div className="mt-4 rounded-ui-rect border border-gray-100 px-4 py-4">
              <p className="text-[13px] font-semibold text-gray-900">표시 이름 선택</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setJoinIdentityMode("real_name")}
                  className={`rounded-ui-rect px-3 py-2 text-[12px] font-semibold ${joinIdentityMode === "real_name" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"}`}
                >
                  실명 프로필
                </button>
                {joinTargetGroup.identityPolicy === "alias_allowed" ? (
                  <button
                    type="button"
                    onClick={() => setJoinIdentityMode("alias")}
                    className={`rounded-ui-rect px-3 py-2 text-[12px] font-semibold ${joinIdentityMode === "alias" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"}`}
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
                    className="h-11 w-full rounded-ui-rect border border-gray-200 px-3 text-[14px] outline-none focus:border-gray-400"
                  />
                  <input
                    value={joinAliasAvatarUrl}
                    onChange={(e) => setJoinAliasAvatarUrl(e.target.value)}
                    placeholder="아바타 URL (선택)"
                    className="h-11 w-full rounded-ui-rect border border-gray-200 px-3 text-[14px] outline-none focus:border-gray-400"
                  />
                  <textarea
                    value={joinAliasBio}
                    onChange={(e) => setJoinAliasBio(e.target.value)}
                    rows={2}
                    placeholder="소개 (선택)"
                    className="w-full rounded-ui-rect border border-gray-200 px-3 py-3 text-[14px] outline-none focus:border-gray-400"
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
                className="flex-1 rounded-ui-rect border border-gray-200 px-4 py-3 text-[14px] font-medium text-gray-700"
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
                className="flex-1 rounded-ui-rect bg-gray-900 px-4 py-3 text-[14px] font-semibold text-white disabled:opacity-40"
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
          onClick={() => setComposerOpen(true)}
          className={`fixed ${BOTTOM_NAV_FAB_LAYOUT.bottomOffsetClass} right-4 z-[41] flex h-14 w-14 items-center justify-center rounded-full bg-gray-900 text-white shadow-[0_14px_32px_rgba(17,24,39,0.28)] ring-1 ring-black/5 transition hover:bg-black active:scale-[0.98]`}
          aria-label="새 대화"
        >
          <PlusIcon className="h-6 w-6" />
        </button>
      ) : null}
    </div>
  );
}

function MessengerSettingsBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{title}</h3>
      <div className="divide-y divide-gray-100 rounded-ui-rect border border-gray-200 bg-white">{children}</div>
    </section>
  );
}

function SettingsToggleRow({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className={`flex cursor-pointer items-start justify-between gap-3 px-3 py-2.5 ${disabled ? "opacity-50" : ""}`}>
      <span className="min-w-0">
        <span className="block text-[14px] font-medium text-gray-900">{title}</span>
        {description ? <span className="mt-0.5 block text-[12px] leading-snug text-gray-500">{description}</span> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-gray-900 focus:ring-gray-400"
      />
    </label>
  );
}

function InfoSection({
  title,
  subtitle,
  sectionRef,
  children,
}: {
  title: string;
  subtitle?: string;
  sectionRef?: { current: HTMLElement | null };
  children: React.ReactNode;
}) {
  return (
    <section ref={sectionRef} className="rounded-ui-rect border border-gray-200 bg-white p-4">
      <div className="mb-3">
        <h2 className="text-[16px] font-semibold text-gray-900">{title}</h2>
        {subtitle ? (
          <p className="mt-1 text-[13px] text-gray-500">{subtitle}</p>
        ) : null}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function EmptyCard({ message }: { message: string }) {
  return (
    <div className="rounded-ui-rect bg-gray-50 px-4 py-8 text-center text-[13px] text-gray-500">
      {message}
    </div>
  );
}

function ProfileCard({
  profile,
  actionSlot,
}: {
  profile: CommunityMessengerProfileLite;
  actionSlot: React.ReactNode;
}) {
  const avatarSrc = profile.avatarUrl?.trim() ? profile.avatarUrl.trim() : null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-ui-rect border border-gray-100 px-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <AvatarCircle src={avatarSrc} label={profile.label} sizeClassName="h-11 w-11" textClassName="text-[15px]" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-[14px] font-semibold text-gray-900">{profile.label}</p>
            {profile.isFavoriteFriend ? (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                즐겨찾기
              </span>
            ) : null}
            {profile.following ? (
              <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                팔로우 중
              </span>
            ) : null}
          </div>
          <p className="truncate text-[12px] text-gray-500">{profile.subtitle ?? "SAMarket 사용자"}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actionSlot}</div>
    </div>
  );
}

function RequestCard({
  request,
  busyId,
  onAction,
}: {
  request: CommunityMessengerFriendRequest;
  busyId: string | null;
  onAction: (requestId: string, action: "accept" | "reject" | "cancel") => Promise<void>;
}) {
  const isIncoming = request.direction === "incoming";
  const label = isIncoming ? request.requesterLabel : request.addresseeLabel;
  return (
    <div className="flex items-center justify-between gap-3 rounded-ui-rect border border-gray-100 px-3 py-3">
      <div>
        <p className="text-[14px] font-semibold text-gray-900">{label}</p>
        <p className="mt-1 text-[12px] text-gray-500">
          {isIncoming ? "나에게 온 친구 요청" : "내가 보낸 친구 요청"}
        </p>
      </div>
      <div className="flex gap-2">
        {isIncoming ? (
          <>
            <button
              type="button"
              onClick={() => void onAction(request.id, "reject")}
              disabled={busyId === `request:${request.id}:reject`}
              className="rounded-ui-rect border border-gray-200 px-3 py-2 text-[12px] text-gray-700"
            >
              거절
            </button>
            <button
              type="button"
              onClick={() => void onAction(request.id, "accept")}
              disabled={busyId === `request:${request.id}:accept`}
              className="rounded-ui-rect bg-gray-900 px-3 py-2 text-[12px] font-semibold text-white"
            >
              수락
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => void onAction(request.id, "cancel")}
            disabled={busyId === `request:${request.id}:cancel`}
            className="rounded-ui-rect border border-gray-200 px-3 py-2 text-[12px] text-gray-700"
          >
            요청 취소
          </button>
        )}
      </div>
    </div>
  );
}

function NotificationCenterCallCard({
  call,
  onOpen,
}: {
  call: CommunityMessengerCallLog;
  onOpen: () => void;
}) {
  const kindLabel = call.callKind === "video" ? "영상 통화" : "음성 통화";
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!call.roomId}
      className="flex w-full items-center justify-between gap-3 rounded-ui-rect border border-gray-100 px-3 py-3 text-left disabled:opacity-60"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">부재중 통화</span>
          <p className="truncate text-[14px] font-semibold text-gray-900">{call.peerLabel}</p>
        </div>
        <p className="mt-1 truncate text-[12px] text-gray-500">
          {kindLabel} · {formatConversationTimestamp(call.startedAt)}
        </p>
      </div>
      <span className="shrink-0 text-[12px] font-medium text-gray-400">{call.roomId ? "열기" : "기록만 있음"}</span>
    </button>
  );
}

function getRoomPreviewText(room: CommunityMessengerRoomSummary): string {
  const lastMessage = room.lastMessage?.trim();
  if (lastMessage) return lastMessage;
  const summary = room.summary?.trim();
  if (summary) return summary;
  return "최근 메시지가 아직 없습니다.";
}

function formatCallPreview(call: CommunityMessengerCallLog): string {
  const kindLabel = call.callKind === "video" ? "영상 통화" : "음성 통화";
  if (call.status === "missed") return `${kindLabel} · 부재중`;
  if (call.status === "cancelled") return `${kindLabel} · 취소됨`;
  if (call.status === "rejected") return `${kindLabel} · 거절됨`;
  if (call.durationSeconds > 0) return `${kindLabel} · ${formatDurationLabel(call.durationSeconds)}`;
  return `${kindLabel} 종료`;
}

function getRoomTypeBadgeLabel(room: CommunityMessengerRoomSummary): string {
  if (room.roomType === "open_group") return "오픈";
  if (room.roomType === "private_group") return "그룹";
  const title = `${room.title} ${room.summary} ${room.subtitle}`;
  if (title.includes("배달") || title.includes("주문")) return "배달";
  if (title.includes("거래")) return "거래";
  return "친구";
}

function RoomListCard({
  item,
  favoriteFriendIds,
  busyId,
  onTogglePin,
  onToggleMute,
  onMarkRead,
  onToggleArchive,
  compact = false,
}: {
  item: UnifiedRoomListItem;
  favoriteFriendIds: Set<string>;
  busyId: string | null;
  onTogglePin: (room: CommunityMessengerRoomSummary) => void;
  onToggleMute: (room: CommunityMessengerRoomSummary) => void;
  onMarkRead: (room: CommunityMessengerRoomSummary) => void;
  onToggleArchive: (room: CommunityMessengerRoomSummary) => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const navigateToCommunityRoom = useCallback(
    (rid: string) => {
      const id = String(rid ?? "").trim();
      if (!id) return;
      void prefetchCommunityMessengerRoomSnapshot(id);
      router.push(`/community-messenger/rooms/${encodeURIComponent(id)}`);
    },
    [router]
  );
  const room = item.room;
  const badgeLabel = getRoomTypeBadgeLabel(room);
  const isFavorite = room.peerUserId ? favoriteFriendIds.has(room.peerUserId) : false;
  const titleSuffix = room.roomType !== "direct" && room.memberCount > 0 ? String(room.memberCount) : "";
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const startOffset = useRef(0);
  const activeDrag = useRef(false);
  const dragAxis = useRef<"x" | "y" | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const secondaryHint =
    item.previewKind === "call" && item.callStatus === "missed"
      ? "부재중"
      : room.isReadonly
        ? "읽기 전용"
        : communityMessengerRoomIsInboxHidden(room)
          ? "보관됨"
          : null;
  const closeActions = useCallback(() => setOffset(0), []);
  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);
  const isSettingsBusy = busyId === `room-settings:${room.id}`;
  const isReadBusy = busyId === `room-read:${room.id}`;
  const isArchiveBusy = busyId === `room-archive:${room.id}`;

  const onPointerDown = (e: React.PointerEvent) => {
    if (compact || !e.isPrimary) return;
    activeDrag.current = true;
    dragAxis.current = null;
    setDragging(true);
    startX.current = e.clientX;
    startY.current = e.clientY;
    startOffset.current = offset;
    longPressTriggeredRef.current = false;
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      activeDrag.current = false;
      setDragging(false);
      setOffset(0);
      longPressTriggeredRef.current = true;
      setMenuOpen(true);
    }, 520);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (compact || !activeDrag.current) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (dragAxis.current == null) {
      if (Math.abs(dx) < ROOM_ROW_AXIS_LOCK_THRESHOLD && Math.abs(dy) < ROOM_ROW_AXIS_LOCK_THRESHOLD) return;
      dragAxis.current = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
    }
    clearLongPressTimer();
    if (dragAxis.current !== "x") return;
    let next = startOffset.current + dx;
    if (next > 0) next = 0;
    if (next < -ROOM_ROW_ACTION_WIDTH) next = -ROOM_ROW_ACTION_WIDTH;
    setOffset(next);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (compact) return;
    activeDrag.current = false;
    dragAxis.current = null;
    setDragging(false);
    clearLongPressTimer();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setOffset((cur) => (cur < -ROOM_ROW_ACTION_CLOSE_THRESHOLD ? -ROOM_ROW_ACTION_WIDTH : 0));
  };

  const rowContent = (
    <div className="flex items-start gap-3">
      <AvatarCircle src={room.avatarUrl} label={room.title} sizeClassName="h-11 w-11" textClassName="text-[14px]" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <p className="min-w-0 truncate text-[15px] font-semibold leading-tight text-gray-900">{room.title}</p>
          {titleSuffix ? (
            <span className="shrink-0 text-[12px] tabular-nums text-gray-400">{titleSuffix}</span>
          ) : null}
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium leading-none ${getRoomTypeBadgeClassName(badgeLabel)}`}
          >
            {badgeLabel}
          </span>
          {secondaryHint ? (
            <span className="shrink-0 rounded border border-red-100 bg-red-50/80 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
              {secondaryHint}
            </span>
          ) : null}
          {isFavorite ? <span className="shrink-0 text-[11px] text-amber-600">★</span> : null}
        </div>
        <p
          className={`mt-0.5 truncate text-[13px] leading-snug ${room.unreadCount > 0 ? "font-medium text-gray-900" : "text-gray-600"}`}
        >
          {item.preview}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 pl-1">
        <span className="text-[11px] tabular-nums text-gray-400">{formatConversationTimestamp(item.lastEventAt)}</span>
        <div className="flex items-center gap-1">
          {room.isPinned ? (
            <span className="text-gray-500" aria-label="고정됨">
              <PinIcon />
            </span>
          ) : null}
          {room.isMuted ? (
            <span className="text-amber-600" aria-label="알림 끔">
              <MuteIcon />
            </span>
          ) : null}
          {room.unreadCount > 0 ? (
            <span className="min-w-[20px] rounded-full bg-gray-900 px-1.5 py-0.5 text-center text-[10px] font-semibold leading-none text-white">
              {room.unreadCount > 999 ? "999+" : room.unreadCount}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );

  if (compact) {
    return (
      <Link
        href={`/community-messenger/rooms/${room.id}`}
        onPointerEnter={() => void prefetchCommunityMessengerRoomSnapshot(room.id)}
        onPointerDown={() => void prefetchCommunityMessengerRoomSnapshot(room.id)}
        className="block px-3 py-2.5 transition hover:bg-gray-50"
      >
        {rowContent}
      </Link>
    );
  }

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-y-0 right-0 flex w-[168px] items-stretch bg-gray-100" style={{ pointerEvents: offset < -8 ? "auto" : "none" }}>
        <button
          type="button"
          disabled={isSettingsBusy}
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin(room);
            closeActions();
          }}
          className="flex w-[56px] touch-manipulation flex-col items-center justify-center bg-slate-700 px-1 text-[11px] font-semibold text-white disabled:opacity-50"
        >
          <PinIcon />
          <span className="mt-1">{room.isPinned ? "해제" : "고정"}</span>
        </button>
        <button
          type="button"
          disabled={isSettingsBusy}
          onClick={(e) => {
            e.stopPropagation();
            onToggleMute(room);
            closeActions();
          }}
          className="flex w-[56px] touch-manipulation flex-col items-center justify-center bg-gray-500 px-1 text-[11px] font-semibold text-white disabled:opacity-50"
        >
          <MuteIcon />
          <span className="mt-1">{room.isMuted ? "해제" : "알림"}</span>
        </button>
        <button
          type="button"
          disabled={isReadBusy || room.unreadCount < 1}
          onClick={(e) => {
            e.stopPropagation();
            onMarkRead(room);
            closeActions();
          }}
          className="flex w-[56px] touch-manipulation flex-col items-center justify-center bg-orange-500 px-1 text-[11px] font-semibold text-white disabled:opacity-50"
        >
          <ReadCheckIcon />
          <span className="mt-1">읽음</span>
        </button>
        <button
          type="button"
          disabled={isArchiveBusy}
          onClick={(e) => {
            e.stopPropagation();
            onToggleArchive(room);
            closeActions();
          }}
          className="flex w-[56px] touch-manipulation flex-col items-center justify-center bg-gray-900 px-1 text-[11px] font-semibold text-white disabled:opacity-50"
        >
          <ArchiveIcon />
          <span className="mt-1">{communityMessengerRoomIsInboxHidden(room) ? "해제" : "보관"}</span>
        </button>
      </div>
      <div
        role="button"
        tabIndex={0}
        onPointerEnter={() => void prefetchCommunityMessengerRoomSnapshot(room.id)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={() => {
          if (offset < -20) {
            closeActions();
            return;
          }
          if (longPressTriggeredRef.current) {
            longPressTriggeredRef.current = false;
            return;
          }
          navigateToCommunityRoom(room.id);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (offset < -20) {
              closeActions();
              return;
            }
            navigateToCommunityRoom(room.id);
          }
        }}
        className="relative bg-white px-3 py-2.5 transition hover:bg-gray-50/80 touch-pan-y"
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? "none" : "transform 0.2s ease-out",
          touchAction: "pan-y",
        }}
      >
        {rowContent}
      </div>
      {menuOpen ? (
        <div className="fixed inset-0 z-[45] flex flex-col justify-end bg-black/40" onClick={() => setMenuOpen(false)}>
          <div
            className="rounded-t-[16px] bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_32px_rgba(0,0,0,0.16)]"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-center text-[14px] font-semibold text-gray-900">{room.title}</p>
            <div className="mt-3 grid gap-2">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  navigateToCommunityRoom(room.id);
                }}
                className="rounded-ui-rect border border-gray-200 px-4 py-3 text-left text-[14px] font-medium text-gray-900"
              >
                채팅방 열기
              </button>
              <button
                type="button"
                disabled={isSettingsBusy}
                onClick={() => {
                  onTogglePin(room);
                  setMenuOpen(false);
                }}
                className="rounded-ui-rect border border-gray-200 px-4 py-3 text-left text-[14px] font-medium text-gray-900 disabled:opacity-40"
              >
                {room.isPinned ? "고정 해제" : "채팅방 고정"}
              </button>
              <button
                type="button"
                disabled={isSettingsBusy}
                onClick={() => {
                  onToggleMute(room);
                  setMenuOpen(false);
                }}
                className="rounded-ui-rect border border-gray-200 px-4 py-3 text-left text-[14px] font-medium text-gray-900 disabled:opacity-40"
              >
                {room.isMuted ? "알림 켜기" : "알림 끄기"}
              </button>
              <button
                type="button"
                disabled={isReadBusy || room.unreadCount < 1}
                onClick={() => {
                  onMarkRead(room);
                  setMenuOpen(false);
                }}
                className="rounded-ui-rect border border-gray-200 px-4 py-3 text-left text-[14px] font-medium text-gray-900 disabled:opacity-40"
              >
                읽음 처리
              </button>
              <button
                type="button"
                disabled={isArchiveBusy}
                onClick={() => {
                  onToggleArchive(room);
                  setMenuOpen(false);
                }}
                className="rounded-ui-rect border border-gray-200 px-4 py-3 text-left text-[14px] font-medium text-gray-900 disabled:opacity-40"
              >
                {communityMessengerRoomIsInboxHidden(room) ? "채팅방 보관 해제" : "채팅방 보관"}
              </button>
            </div>
            <button
              type="button"
              className="mt-3 w-full py-3 text-[14px] text-gray-500"
              onClick={() => setMenuOpen(false)}
            >
              닫기
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AvatarCircle({
  src,
  label,
  sizeClassName,
  textClassName,
}: {
  src?: string | null;
  label: string;
  sizeClassName: string;
  textClassName: string;
}) {
  const safeSrc = typeof src === "string" && src.trim().length > 0 ? src.trim() : "";
  const [imageFailed, setImageFailed] = useState(false);
  const initial = label.trim().slice(0, 1).toUpperCase() || "?";
  useEffect(() => {
    setImageFailed(false);
  }, [safeSrc]);
  return (
    <div className={`shrink-0 overflow-hidden rounded-full bg-gray-100 ${sizeClassName}`}>
      {safeSrc && !imageFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={safeSrc} alt="" className="h-full w-full object-cover" onError={() => setImageFailed(true)} />
      ) : (
        <div className={`flex h-full w-full items-center justify-center font-semibold text-gray-600 ${textClassName}`}>
          {initial}
        </div>
      )}
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
    <div className="rounded-ui-rect border border-gray-100 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-gray-900">{group.title}</p>
          <p className="mt-1 line-clamp-2 text-[12px] text-gray-500">{group.summary || "소개 없음"}</p>
          <p className="mt-1.5 text-[11px] text-gray-400">
            {group.ownerLabel} · {group.memberCount}명
            {group.isJoined ? " · 참여 중" : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <button
            type="button"
            onClick={onJoin}
            disabled={busy}
            className="rounded-ui-rect bg-gray-900 px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-40"
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

function sortRooms(rooms: CommunityMessengerRoomSummary[]): CommunityMessengerRoomSummary[] {
  return [...rooms].sort((a, b) => {
    if (Boolean(a.isPinned) !== Boolean(b.isPinned)) return a.isPinned ? -1 : 1;
    if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
  });
}

function sortCallsByTime(calls: CommunityMessengerCallLog[]): CommunityMessengerCallLog[] {
  return [...calls].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
}

const MAX_CALL_HISTORY_ROWS = 40;

/** 동일 상대(또는 동일 방) 기준 최신 통화 한 줄 — 카카오톡식 요약 */
function mergeCallsByConversation(sortedNewestFirst: CommunityMessengerCallLog[]): CommunityMessengerCallLog[] {
  const seen = new Set<string>();
  const out: CommunityMessengerCallLog[] = [];
  for (const c of sortedNewestFirst) {
    const roomKey = c.roomId && String(c.roomId).trim() ? `room:${c.roomId}` : null;
    const key =
      roomKey ??
      (c.peerUserId ? `peer:${c.peerUserId}` : `label:${c.title}\0${c.peerLabel}`);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= MAX_CALL_HISTORY_ROWS) break;
  }
  return out;
}

function formatDurationLabel(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 1) return `${secs}초`;
  return `${mins}분 ${secs.toString().padStart(2, "0")}초`;
}

function formatConversationTimestamp(value: string): string {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "";
  const date = new Date(time);
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  const sameMonth = sameYear && date.getMonth() === now.getMonth();
  const sameDate = sameMonth && date.getDate() === now.getDate();
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  if (sameDate) return `${hh}:${mm}`;
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (sameYear) return `${month}/${day} ${hh}:${mm}`;
  return `${date.getFullYear()}.${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")} ${hh}:${mm}`;
}

function getRoomTypeBadgeClassName(label: string): string {
  if (label === "친구") return "border border-gray-200 bg-white text-gray-600";
  if (label === "그룹") return "border border-violet-200 bg-violet-50 text-violet-800";
  if (label === "오픈") return "border border-sky-200 bg-sky-50 text-sky-800";
  if (label === "거래") return "border border-emerald-200 bg-emerald-50 text-emerald-800";
  if (label === "배달") return "border border-orange-200 bg-orange-50 text-orange-800";
  return "border border-gray-200 bg-gray-50 text-gray-600";
}

function PinIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 4l6 6-3 1-3 6-2-2-4 5-1-1 5-4-2-2 6-3 1-3z" />
    </svg>
  );
}

function MuteIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 9v6h4l5 4V5l-5 4H5z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 8l5 8" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8l-5 8" />
    </svg>
  );
}

function ReadCheckIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13l4 4" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16v4H4V7z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 11h12v8H6v-8z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 15h4" />
    </svg>
  );
}
