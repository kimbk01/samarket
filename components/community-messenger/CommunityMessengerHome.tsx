"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { CommunityMessengerHeaderActions } from "@/components/community-messenger/CommunityMessengerHeaderActions";
import { MessengerServiceStrip } from "@/components/community-messenger/MessengerServiceStrip";
import { MessengerLineFriendRow } from "@/components/community-messenger/MessengerLineFriendRow";
import { MessengerFriendProfileSheet } from "@/components/community-messenger/MessengerFriendProfileSheet";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { TradeManagementTabBar } from "@/components/mypage/TradeManagementTabBar";
import type { MessageKey } from "@/lib/i18n/messages";
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
import {
  peekRoomSnapshot,
  prefetchCommunityMessengerRoomSnapshot,
  primeRoomSnapshot,
} from "@/lib/community-messenger/room-snapshot-cache";
import {
  cancelScheduledWhenBrowserIdle,
  scheduleWhenBrowserIdle,
} from "@/lib/ui/network-policy";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerCallLog,
  CommunityMessengerDiscoverableGroupSummary,
  CommunityMessengerFriendRequest,
  CommunityMessengerProfileLite,
  CommunityMessengerRoomSnapshot,
  CommunityMessengerRoomSummary,
  CommunityMessengerTab,
} from "@/lib/community-messenger/types";

const HOME_TABS = [
  { id: "friends", label: "친구", labelKey: "nav_messenger_friends" },
  { id: "chats", label: "대화", labelKey: "nav_messenger_direct" },
  { id: "groups", label: "그룹", labelKey: "nav_messenger_groups" },
  { id: "calls", label: "통화", labelKey: "nav_messenger_calls" },
] as const satisfies readonly { id: CommunityMessengerTab; label: string; labelKey?: MessageKey }[];

const EMPTY_COUNTS: Record<CommunityMessengerTab, number> = {
  friends: 0,
  chats: 0,
  groups: 0,
  calls: 0,
};

/** URL `tab=settings` 는 하위 호환용 — 탭은 쓰지 않고 설정 시트만 연다 */
function normalizeTab(value: string | null): CommunityMessengerTab {
  if (value === "settings") return "chats";
  if (value === "friends" || value === "chats" || value === "groups" || value === "calls") {
    return value;
  }
  return "friends";
}

export function CommunityMessengerHome({ initialTab }: { initialTab?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const loadedRef = useRef(false);
  const setMainTier1Extras = useSetMainTier1ExtrasOptional();
  const [friendMenuOpen, setFriendMenuOpen] = useState(false);
  const [requestSheetOpen, setRequestSheetOpen] = useState(false);
  const [sheetProfile, setSheetProfile] = useState<CommunityMessengerProfileLite | null>(null);
  const friendSearchRef = useRef<HTMLInputElement | null>(null);
  const [settingsSheetOpen, setSettingsSheetOpen] = useState(initialTab === "settings");
  const [publicGroupFindOpen, setPublicGroupFindOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<CommunityMessengerTab>(normalizeTab(initialTab ?? null));
  const [data, setData] = useState<CommunityMessengerBootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
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
  const counts = data?.tabs ?? EMPTY_COUNTS;
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
    const stale = !silent ? peekBootstrapCache() : null;
    const shouldBlock = !silent && !loadedRef.current && !stale;
    if (stale) {
      setData(stale);
      setAuthRequired(false);
      setPageError(null);
    }
    if (shouldBlock) setLoading(true);
    try {
      const url = silent ? "/api/community-messenger/bootstrap?fresh=1" : "/api/community-messenger/bootstrap";
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
      } else {
        const unauthorized = res.status === 401 || res.status === 403;
        if (unauthorized) {
          clearBootstrapCache();
          setAuthRequired(true);
          setPageError(t("nav_messenger_login_required"));
          setData(null);
        } else {
          setAuthRequired(false);
          setPageError(t("nav_messenger_load_failed"));
          if (!silent && !stale) {
            setData(null);
          }
        }
      }
    } finally {
      loadedRef.current = true;
      if (shouldBlock) setLoading(false);
    }
  }, [t]);

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
      router.replace("/community-messenger?tab=chats", { scroll: false });
    }
  }, [searchParams, router]);

  useLayoutEffect(() => {
    if (!setMainTier1Extras) return;
    setMainTier1Extras({
      tier1: {
        rightSlot: (
          <CommunityMessengerHeaderActions
            incomingRequestCount={incomingRequestCount}
            onOpenFriendMenu={() => setFriendMenuOpen(true)}
            onOpenRequestList={() => setRequestSheetOpen(true)}
            onOpenSettings={() => setSettingsSheetOpen(true)}
          />
        ),
      },
    });
    return () => setMainTier1Extras(null);
  }, [setMainTier1Extras, incomingRequestCount]);

  useCommunityMessengerHomeRealtime({
    userId: data?.me?.id ?? null,
    roomIds: homeRoomIds,
    enabled: Boolean(data?.me?.id),
    onRefresh: () => {
      void refresh(true);
    },
  });

  const setTab = useCallback(
    (tab: CommunityMessengerTab) => {
      setActiveTab(tab);
      router.replace(`/community-messenger?tab=${encodeURIComponent(tab)}`);
    },
    [router]
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
        if (!peekRoomSnapshot(existingRoom.id)) {
          await prefetchCommunityMessengerRoomSnapshot(existingRoom.id);
        }
        router.push(`/community-messenger/rooms/${encodeURIComponent(existingRoom.id)}`);
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
          router.push(`/community-messenger/rooms/${encodeURIComponent(json.roomId)}`);
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
    [data?.chats, getMessengerActionErrorMessage, router, t]
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
    [data?.chats, getMessengerActionErrorMessage, router, t]
  );

  const searchUsers = useCallback(async () => {
    const keyword = searchKeyword.trim();
    if (!keyword) {
      setSearchResults([]);
      return;
    }
    setBusyId("user-search");
    try {
      const res = await fetch(`/api/community-messenger/users?q=${encodeURIComponent(keyword)}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as { ok?: boolean; users?: CommunityMessengerProfileLite[] };
      setSearchResults(res.ok && json.ok ? json.users ?? [] : []);
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
        router.push(`/community-messenger/rooms/${encodeURIComponent(json.roomId)}`);
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
  }, [getMessengerActionErrorMessage, groupMembers, groupTitle, refresh, router, t]);

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
        router.push(`/community-messenger/rooms/${encodeURIComponent(json.roomId)}`);
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
    router,
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
        router.push(`/community-messenger/rooms/${encodeURIComponent(json.roomId)}`);
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
    refresh,
    router,
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
  const myPrivateGroups = useMemo(
    () => sortedGroups.filter((room) => room.roomType === "private_group"),
    [sortedGroups]
  );
  const myOpenGroups = useMemo(
    () => sortedGroups.filter((room) => room.roomType === "open_group"),
    [sortedGroups]
  );
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
  const removeFriend = useCallback(
    async (friendUserId: string) => {
      if (!window.confirm("이 친구를 삭제할까요? 친구 관계만 해제되고 기존 채팅방은 유지됩니다.")) return;
      setBusyId(`remove-friend:${friendUserId}`);
      try {
        const res = await fetch(`/api/community-messenger/friends/${encodeURIComponent(friendUserId)}`, {
          method: "DELETE",
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

  return (
    <div className="space-y-4 px-4 py-4">
      {!loading && !authRequired ? (
        <MessengerServiceStrip
          onFindFriend={() => {
            setTab("friends");
            requestAnimationFrame(() => friendSearchRef.current?.focus());
          }}
          onCreateGroup={() => setGroupCreateStep("select")}
        />
      ) : null}

      <TradeManagementTabBar
        tabs={HOME_TABS}
        active={activeTab}
        counts={counts}
        onChange={setTab}
      />

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
              className="rounded-ui-rect bg-[#06C755] px-4 py-3 text-[14px] font-semibold text-white"
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
              className="rounded-ui-rect bg-[#06C755] px-4 py-3 text-[14px] font-semibold text-white"
            >
              다시 불러오기
            </button>
          </div>
        </section>
      ) : null}

      {!loading && data && activeTab === "friends" ? (
        <div className="space-y-4">
          <section className="rounded-ui-rect border border-gray-200 bg-white p-4">
            <div className="flex gap-2">
              <input
                ref={friendSearchRef}
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="닉네임 또는 아이디로 친구 찾기"
                className="h-11 flex-1 rounded-ui-rect border border-gray-200 px-3 text-[14px] outline-none focus:border-[#06C755]"
              />
              <button
                type="button"
                onClick={() => void searchUsers()}
                disabled={busyId === "user-search"}
                className="rounded-ui-rect bg-[#06C755] px-4 text-[14px] font-semibold text-white disabled:opacity-50"
              >
                검색
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {searchResults.length === 0 ? (
                <p className="text-[13px] text-gray-500">검색 후 친구 요청이나 바로 채팅을 시작할 수 있어요.</p>
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
                            onClick={() => void startDirectRoom(user.id)}
                            disabled={busyId === `room:${user.id}`}
                            className="rounded-ui-rect bg-[#06C755] px-3 py-2 text-[12px] font-semibold text-white"
                          >
                            채팅
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
          </section>

          {incomingRequestCount > 0 ? (
            <p className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-950">
              받은 친구 요청 <strong>{incomingRequestCount}</strong>건 — 상단{" "}
              <span className="font-medium">우편함</span> 아이콘에서 수락·거절할 수 있어요.
            </p>
          ) : null}

          <InfoSection title="친구">
            {sortedFriends.length ? (
              <div className="space-y-2">
                {sortedFriends.map((friend) => (
                  <MessengerLineFriendRow
                    key={friend.id}
                    friend={friend}
                    busyFavorite={busyId === `favorite:${friend.id}`}
                    busyDelete={busyId === `remove-friend:${friend.id}`}
                    onRowPress={() => setSheetProfile(friend)}
                    onToggleFavorite={() => void toggleFavoriteFriend(friend.id)}
                    onDelete={() => void removeFriend(friend.id)}
                  />
                ))}
              </div>
            ) : (
              <EmptyCard message="아직 친구가 없습니다. 검색으로 친구를 추가해 보세요." />
            )}
          </InfoSection>

          <InfoSection title="팔로우 중">
            {data?.following.length ? (
              data.following.map((user) => (
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
                        팔로우 해제
                      </button>
                      {!user.isFriend ? (
                        <button
                          type="button"
                          onClick={() => void requestFriend(user.id)}
                          disabled={busyId === `friend:${user.id}`}
                          className="rounded-ui-rect bg-[#111827] px-3 py-2 text-[12px] font-semibold text-white"
                        >
                          친구 요청
                        </button>
                      ) : (
                        <button
                          type="button"
                          onPointerEnter={() => maybePrefetchDirectRoom(user.id)}
                          onClick={() => void startDirectRoom(user.id)}
                          disabled={busyId === `room:${user.id}`}
                          className="rounded-ui-rect bg-[#06C755] px-3 py-2 text-[12px] font-semibold text-white"
                        >
                          채팅
                        </button>
                      )}
                    </>
                  }
                />
              ))
            ) : (
              <EmptyCard message="팔로우 중인 이웃이 없습니다." />
            )}
          </InfoSection>
        </div>
      ) : null}

      {!loading && data && activeTab === "chats" ? (
        <InfoSection title="대화">
          {sortedChats.length ? (
            sortedChats.map((room) => <RoomCard key={room.id} room={room} href={`/community-messenger/rooms/${room.id}`} />)
          ) : (
            <EmptyCard message="대화가 없습니다." />
          )}
        </InfoSection>
      ) : null}

      {!loading && data && activeTab === "groups" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[17px] font-semibold text-gray-900">그룹</h2>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setPublicGroupFindOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FEE500] text-gray-900 shadow-sm transition active:scale-[0.98]"
                aria-label="공개 그룹 찾기"
              >
                <SpeechBubblePlusSolidIcon />
              </button>
              <button
                type="button"
                onClick={() => setGroupCreateStep("select")}
                className="rounded-ui-rect bg-[#06C755] px-3.5 py-2 text-[13px] font-semibold text-white"
              >
                만들기
              </button>
            </div>
          </div>

          <section className="rounded-ui-rect border border-gray-200 bg-white p-3">
            {sortedGroups.length ? (
              <div className="space-y-3">
                {myPrivateGroups.length ? (
                  <div className="space-y-2">
                    <p className="px-1 text-[12px] font-semibold text-gray-500">비공개</p>
                    {myPrivateGroups.map((room) => (
                      <RoomCard key={room.id} room={room} href={`/community-messenger/rooms/${room.id}`} />
                    ))}
                  </div>
                ) : null}
                {myOpenGroups.length ? (
                  <div className="space-y-2">
                    <p className="px-1 text-[12px] font-semibold text-gray-500">공개</p>
                    {myOpenGroups.map((room) => (
                      <RoomCard key={room.id} room={room} href={`/community-messenger/rooms/${room.id}`} />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="px-2 py-10 text-center text-[13px] text-gray-500">참여 중인 그룹이 없습니다.</div>
            )}
          </section>
        </div>
      ) : null}

      {!loading && data && activeTab === "calls" ? (
        <section className="rounded-ui-rect border border-gray-200 bg-white">
          {sortedCalls.length ? (
            <ul className="divide-y divide-gray-100">
              {sortedCalls.map((call) => (
                <li key={call.id}>
                  <CallHistoryRow call={call} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 py-12 text-center text-[13px] text-gray-500">통화 기록이 없습니다.</div>
          )}
        </section>
      ) : null}

      <MessengerFriendProfileSheet
        open={sheetProfile != null}
        profile={sheetProfile}
        busyId={busyId}
        onClose={() => setSheetProfile(null)}
        onVoiceCall={() => {
          if (!sheetProfile) return;
          void startDirectCall(sheetProfile.id, "voice");
        }}
        onVideoCall={() => {
          if (!sheetProfile) return;
          void startDirectCall(sheetProfile.id, "video");
        }}
        onChat={() => {
          if (!sheetProfile) return;
          const id = sheetProfile.id;
          setSheetProfile(null);
          void startDirectRoom(id);
        }}
        onToggleFavorite={() => {
          if (!sheetProfile) return;
          void toggleFavoriteFriend(sheetProfile.id);
        }}
      />

      {friendMenuOpen ? (
        <div className="fixed inset-0 z-[42] flex flex-col justify-end bg-black/40">
          <button type="button" className="min-h-0 flex-1 cursor-default" aria-label="닫기" onClick={() => setFriendMenuOpen(false)} />
          <div className="rounded-t-[12px] bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_32px_rgba(0,0,0,0.12)]">
            <p className="text-center text-[14px] font-semibold text-gray-900">친구 · 그룹</p>
            <button
              type="button"
              className="mt-4 w-full rounded-ui-rect border border-gray-200 py-3.5 text-[15px] font-medium text-gray-900"
              onClick={() => {
                setFriendMenuOpen(false);
                setTab("friends");
                requestAnimationFrame(() => friendSearchRef.current?.focus());
              }}
            >
              친구 찾기
            </button>
            <button
              type="button"
              className="mt-2 w-full rounded-ui-rect bg-[#06C755] py-3.5 text-[15px] font-semibold text-white"
              onClick={() => {
                setFriendMenuOpen(false);
                setGroupCreateStep("select");
              }}
            >
              그룹 만들기
            </button>
            <button type="button" className="mt-3 w-full py-2 text-[14px] text-gray-500" onClick={() => setFriendMenuOpen(false)}>
              취소
            </button>
          </div>
        </div>
      ) : null}

      {requestSheetOpen ? (
        <div className="fixed inset-0 z-[42] flex flex-col justify-end bg-black/40">
          <button type="button" className="min-h-0 flex-1 cursor-default" aria-label="닫기" onClick={() => setRequestSheetOpen(false)} />
          <div className="max-h-[70vh] overflow-y-auto rounded-t-[12px] bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_32px_rgba(0,0,0,0.12)]">
            <p className="text-center text-[14px] font-semibold text-gray-900">친구 요청</p>
            <div className="mt-3 space-y-2">
              {data?.requests?.length ? (
                data.requests.map((request) => (
                  <RequestCard
                    key={request.id}
                    request={request}
                    busyId={busyId}
                    onAction={respondRequest}
                  />
                ))
              ) : (
                <p className="py-8 text-center text-[13px] text-gray-500">대기 중인 요청이 없습니다.</p>
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
              <div className="space-y-4">
                <section>
                  <p className="mb-2 text-[13px] font-semibold text-gray-500">알림</p>
                  <div className="space-y-2">
                    <label className="flex items-center justify-between rounded-ui-rect border border-gray-100 px-4 py-3.5">
                      <span className="text-[15px] font-medium text-gray-900">수신 통화 알림음</span>
                      <input
                        type="checkbox"
                        checked={incomingCallSoundEnabled}
                        onChange={(event) => {
                          const next = event.target.checked;
                          setIncomingCallSoundEnabled(next);
                          setCommunityMessengerIncomingCallSoundEnabled(next);
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-[#06C755] focus:ring-[#06C755]"
                      />
                    </label>
                    <label className="flex items-center justify-between rounded-ui-rect border border-gray-100 px-4 py-3.5">
                      <span className="text-[15px] font-medium text-gray-900">수신 통화 안내</span>
                      <input
                        type="checkbox"
                        checked={incomingCallBannerEnabled}
                        onChange={(event) => {
                          const next = event.target.checked;
                          setIncomingCallBannerEnabled(next);
                          setCommunityMessengerIncomingCallBannerEnabled(next);
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-[#06C755] focus:ring-[#06C755]"
                      />
                    </label>
                  </div>
                </section>

                <section>
                  <p className="mb-2 text-[13px] font-semibold text-gray-500">차단</p>
                  {data.blocked.length ? (
                    <div className="space-y-2">
                      {data.blocked.map((user) => (
                        <ProfileCard
                          key={user.id}
                          profile={user}
                          actionSlot={
                            <button
                              type="button"
                              onClick={() => void toggleBlock(user.id)}
                              disabled={busyId === `block:${user.id}`}
                              className="rounded-ui-rect bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700"
                            >
                              해제
                            </button>
                          }
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-ui-rect border border-dashed border-gray-200 px-4 py-8 text-center text-[13px] text-gray-500">
                      차단된 사용자가 없습니다.
                    </div>
                  )}
                </section>

                <section>
                  <p className="mb-2 text-[13px] font-semibold text-gray-500">즐겨찾기</p>
                  {favoriteFriends.length ? (
                    <div className="space-y-2">
                      {favoriteFriends.map((friend) => (
                        <ProfileCard
                          key={friend.id}
                          profile={friend}
                          actionSlot={
                            <button
                              type="button"
                              onClick={() => void removeFriend(friend.id)}
                              disabled={busyId === `remove-friend:${friend.id}`}
                              className="rounded-ui-rect border border-red-200 px-3 py-2 text-[12px] font-medium text-red-600"
                            >
                              삭제
                            </button>
                          }
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-ui-rect border border-dashed border-gray-200 px-4 py-8 text-center text-[13px] text-gray-500">
                      즐겨찾기 친구가 없습니다.
                    </div>
                  )}
                </section>
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
                className="h-11 w-full rounded-ui-rect border border-gray-200 px-3 text-[14px] outline-none focus:border-[#06C755]"
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
                <p className="text-[13px] font-medium text-[#06C755]">그룹 생성</p>
                <h2 className="mt-1 text-[20px] font-semibold text-gray-900">어떤 그룹을 만들까요?</h2>
                <div className="mt-4 grid gap-3">
                  <button
                    type="button"
                    onClick={() => setGroupCreateStep("private_group")}
                    className="rounded-ui-rect border border-gray-200 px-4 py-4 text-left transition hover:border-[#06C755] hover:bg-[#F6FFF9]"
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
                    <p className="text-[13px] font-medium text-[#06C755]">비공개 그룹</p>
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
                  className="mt-4 h-11 w-full rounded-ui-rect border border-gray-200 px-3 text-[14px] outline-none focus:border-[#06C755]"
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
                  <div className="mt-3 rounded-ui-rect bg-[#F8FAF9] px-3 py-3 text-[12px] text-gray-600">
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
                          className="h-4 w-4 rounded border-gray-300 text-[#06C755] focus:ring-[#06C755]"
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
                        setTab("friends");
                      }}
                      className="mt-3 rounded-ui-rect bg-[#06C755] px-4 py-3 text-[13px] font-semibold text-white"
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
                    className="h-11 w-full rounded-ui-rect border border-gray-200 px-3 text-[14px] outline-none focus:border-[#06C755]"
                  />
                  <textarea
                    value={openGroupSummary}
                    onChange={(e) => setOpenGroupSummary(e.target.value)}
                    rows={3}
                    placeholder="방 소개를 입력하세요"
                    className="w-full rounded-ui-rect border border-gray-200 px-3 py-3 text-[14px] outline-none focus:border-[#06C755]"
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
                          className={`rounded-ui-rect px-3 py-2 text-[12px] font-semibold ${openGroupIdentityPolicy === "real_name" ? "bg-[#06C755] text-white" : "bg-gray-100 text-gray-700"}`}
                        >
                          실명 기반
                        </button>
                        <button
                          type="button"
                          onClick={() => setOpenGroupIdentityPolicy("alias_allowed")}
                          className={`rounded-ui-rect px-3 py-2 text-[12px] font-semibold ${openGroupIdentityPolicy === "alias_allowed" ? "bg-[#06C755] text-white" : "bg-gray-100 text-gray-700"}`}
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
                        className="h-11 w-full rounded-ui-rect border border-gray-200 px-3 text-[14px] outline-none focus:border-[#06C755]"
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
                      className="h-11 w-full rounded-ui-rect border border-gray-200 px-3 text-[14px] outline-none focus:border-[#06C755]"
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
                      className="h-4 w-4 rounded border-gray-300 text-[#06C755] focus:ring-[#06C755]"
                    />
                  </label>
                  {openGroupIdentityPolicy === "alias_allowed" ? (
                    <div className="rounded-ui-rect border border-gray-100 bg-gray-50 px-4 py-4">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setOpenGroupCreatorIdentityMode("real_name")}
                          className={`rounded-ui-rect px-3 py-2 text-[12px] font-semibold ${openGroupCreatorIdentityMode === "real_name" ? "bg-[#06C755] text-white" : "bg-white text-gray-700"}`}
                        >
                          방장도 실명 사용
                        </button>
                        <button
                          type="button"
                          onClick={() => setOpenGroupCreatorIdentityMode("alias")}
                          className={`rounded-ui-rect px-3 py-2 text-[12px] font-semibold ${openGroupCreatorIdentityMode === "alias" ? "bg-[#06C755] text-white" : "bg-white text-gray-700"}`}
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
                            className="h-11 w-full rounded-ui-rect border border-gray-200 px-3 text-[14px] outline-none focus:border-[#06C755]"
                          />
                          <input
                            value={openGroupCreatorAliasAvatarUrl}
                            onChange={(e) => setOpenGroupCreatorAliasAvatarUrl(e.target.value)}
                            placeholder="아바타 URL (선택)"
                            className="h-11 w-full rounded-ui-rect border border-gray-200 px-3 text-[14px] outline-none focus:border-[#06C755]"
                          />
                          <textarea
                            value={openGroupCreatorAliasBio}
                            onChange={(e) => setOpenGroupCreatorAliasBio(e.target.value)}
                            rows={2}
                            placeholder="방장 소개 (선택)"
                            className="w-full rounded-ui-rect border border-gray-200 px-3 py-3 text-[14px] outline-none focus:border-[#06C755]"
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
                  className="flex-1 rounded-ui-rect bg-[#06C755] px-4 py-3 text-[14px] font-semibold text-white disabled:opacity-40"
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
            <p className="text-[13px] font-medium text-[#06C755]">공개 그룹 입장</p>
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
                className="mt-4 h-11 w-full rounded-ui-rect border border-gray-200 px-3 text-[14px] outline-none focus:border-[#06C755]"
              />
            ) : null}
            <div className="mt-4 rounded-ui-rect border border-gray-100 px-4 py-4">
              <p className="text-[13px] font-semibold text-gray-900">표시 이름 선택</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setJoinIdentityMode("real_name")}
                  className={`rounded-ui-rect px-3 py-2 text-[12px] font-semibold ${joinIdentityMode === "real_name" ? "bg-[#06C755] text-white" : "bg-gray-100 text-gray-700"}`}
                >
                  실명 프로필
                </button>
                {joinTargetGroup.identityPolicy === "alias_allowed" ? (
                  <button
                    type="button"
                    onClick={() => setJoinIdentityMode("alias")}
                    className={`rounded-ui-rect px-3 py-2 text-[12px] font-semibold ${joinIdentityMode === "alias" ? "bg-[#06C755] text-white" : "bg-gray-100 text-gray-700"}`}
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
                    className="h-11 w-full rounded-ui-rect border border-gray-200 px-3 text-[14px] outline-none focus:border-[#06C755]"
                  />
                  <input
                    value={joinAliasAvatarUrl}
                    onChange={(e) => setJoinAliasAvatarUrl(e.target.value)}
                    placeholder="아바타 URL (선택)"
                    className="h-11 w-full rounded-ui-rect border border-gray-200 px-3 text-[14px] outline-none focus:border-[#06C755]"
                  />
                  <textarea
                    value={joinAliasBio}
                    onChange={(e) => setJoinAliasBio(e.target.value)}
                    rows={2}
                    placeholder="소개 (선택)"
                    className="w-full rounded-ui-rect border border-gray-200 px-3 py-3 text-[14px] outline-none focus:border-[#06C755]"
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
                className="flex-1 rounded-ui-rect bg-[#06C755] px-4 py-3 text-[14px] font-semibold text-white disabled:opacity-40"
              >
                {busyId === `join-open-group:${joinTargetGroup.id}` ? "입장 중..." : "이 그룹에 입장"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
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
  return (
    <div className="flex items-center justify-between gap-3 rounded-ui-rect border border-gray-100 px-3 py-3">
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
              className="rounded-ui-rect bg-[#06C755] px-3 py-2 text-[12px] font-semibold text-white"
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

function getRoomPreviewText(room: CommunityMessengerRoomSummary): string {
  const lastMessage = room.lastMessage?.trim();
  if (lastMessage) return lastMessage;
  const summary = room.summary?.trim();
  if (summary) return summary;
  return "최근 메시지가 아직 없습니다.";
}

function RoomCard({ room, href }: { room: CommunityMessengerRoomSummary; href: string }) {
  const previewText = getRoomPreviewText(room);
  return (
    <Link
      href={href}
      onPointerEnter={() => void prefetchCommunityMessengerRoomSnapshot(room.id)}
      className="block rounded-ui-rect border border-gray-100 px-4 py-3 transition hover:bg-gray-50"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-[14px] font-semibold text-gray-900">{room.title}</p>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                room.roomType === "open_group" ? "bg-sky-50 text-sky-700" : "bg-gray-100 text-gray-700"
              }`}
            >
              {room.roomType === "open_group" ? "공개" : room.roomType === "private_group" ? "비공개" : "대화"}
            </span>
            {room.roomStatus !== "active" ? (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                {room.roomStatus === "blocked" ? "차단됨" : "보관됨"}
              </span>
            ) : null}
            {room.isReadonly ? (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700">
                읽기 전용
              </span>
            ) : null}
            {room.unreadCount > 0 ? (
              <span className="rounded-full bg-[#06C755] px-2 py-0.5 text-[11px] font-semibold text-white">
                {room.unreadCount}
              </span>
            ) : null}
          </div>
          <p className="mt-1 truncate text-[12px] text-gray-500">{room.subtitle}</p>
          <p
            className={`mt-1 truncate text-[13px] ${
              room.unreadCount > 0 ? "font-semibold text-gray-900" : "text-gray-700"
            }`}
          >
            {previewText}
          </p>
        </div>
        <div className="shrink-0 text-[11px] text-gray-400">{formatRelative(room.lastMessageAt)}</div>
      </div>
    </Link>
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
            className="rounded-ui-rect bg-[#06C755] px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-40"
          >
            {busy ? "확인 중..." : group.isJoined ? "다시 입장" : "참여"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SolidPhoneIcon() {
  return (
    <svg className="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V21c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
    </svg>
  );
}

function SpeechBubblePlusSolidIcon() {
  return (
    <svg className="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4 4h16a2 2 0 012 2v9a2 2 0 01-2 2h-5.5l-3.3 3.3a1 1 0 01-1.7-.7V17H4a2 2 0 01-2-2V6a2 2 0 012-2zm8 3a1 1 0 00-1 1v3H8a1 1 0 000 2h3v3a1 1 0 002 0v-3h3a1 1 0 000-2h-3V8a1 1 0 00-1-1z" />
    </svg>
  );
}

function CallHistoryRow({ call }: { call: CommunityMessengerCallLog }) {
  const router = useRouter();
  const primary =
    call.title?.trim() || call.peerLabel?.trim() || "알 수 없음";
  return (
    <button
      type="button"
      onClick={() =>
        router.push(`/community-messenger/calls/${encodeURIComponent(call.id)}`)
      }
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-gray-50 active:bg-gray-100"
    >
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-200/90 text-gray-700"
        aria-hidden
      >
        <SolidPhoneIcon />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-[15px] font-semibold text-gray-900">{primary}</p>
          {call.status === "missed" ? (
            <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
              부재중
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-[12px] text-gray-500">{formatCallListDatetime(call.startedAt)}</p>
      </div>
      <span className="shrink-0 text-gray-300" aria-hidden>
        ›
      </span>
    </button>
  );
}

function sortRooms(rooms: CommunityMessengerRoomSummary[]): CommunityMessengerRoomSummary[] {
  return [...rooms].sort((a, b) => {
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

function formatCallListDatetime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatRelative(value: string): string {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "";
  const diff = Date.now() - time;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}
