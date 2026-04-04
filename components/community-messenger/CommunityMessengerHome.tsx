"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TradeManagementTabBar } from "@/components/mypage/TradeManagementTabBar";
import { useCommunityMessengerHomeRealtime } from "@/lib/community-messenger/use-community-messenger-realtime";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerCallLog,
  CommunityMessengerDiscoverableGroupSummary,
  CommunityMessengerFriendRequest,
  CommunityMessengerProfileLite,
  CommunityMessengerRoomSummary,
  CommunityMessengerTab,
} from "@/lib/community-messenger/types";

const HOME_TABS = [
  { id: "friends", label: "친구" },
  { id: "chats", label: "1:1 채팅" },
  { id: "groups", label: "그룹" },
  { id: "calls", label: "통화" },
  { id: "settings", label: "설정" },
] as const satisfies readonly { id: CommunityMessengerTab; label: string }[];

const EMPTY_COUNTS: Record<CommunityMessengerTab, number> = {
  friends: 0,
  chats: 0,
  groups: 0,
  calls: 0,
  settings: 0,
};

function normalizeTab(value: string | null): CommunityMessengerTab {
  if (value === "friends" || value === "chats" || value === "groups" || value === "calls" || value === "settings") {
    return value;
  }
  return "friends";
}

export function CommunityMessengerHome({ initialTab }: { initialTab?: string }) {
  const router = useRouter();
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
  const counts = data?.tabs ?? EMPTY_COUNTS;
  const homeRoomIds = useMemo(
    () => [...(data?.chats ?? []), ...(data?.groups ?? [])].map((room) => room.id),
    [data?.chats, data?.groups]
  );

  const getMessengerActionErrorMessage = useCallback((error?: string) => {
    switch (error) {
      case "bad_peer":
        return "1:1 채팅 대상을 다시 확인해 주세요.";
      case "blocked_target":
        return "차단 관계에서는 채팅방을 만들 수 없습니다.";
      case "friend_required":
        return "그룹방과 그룹 초대는 친구 관계에서만 가능합니다.";
      case "title_required":
        return "그룹방 제목을 입력해 주세요.";
      case "password_required":
        return "비밀번호를 입력해 주세요.";
      case "alias_name_required":
        return "별칭으로 참여하려면 닉네임을 입력해 주세요.";
      case "members_required":
        return "그룹방에 초대할 친구를 1명 이상 선택해 주세요.";
      case "invalid_password":
        return "비밀번호가 맞지 않습니다.";
      case "room_full":
        return "정원이 가득 찬 그룹방입니다.";
      case "not_open_group_room":
        return "공개 그룹방만 비밀번호 입장이 가능합니다.";
      case "owner_cannot_leave":
        return "방장은 방을 나갈 수 없습니다. 필요하면 다른 방장을 지정하는 기능을 후속으로 연결해야 합니다.";
      case "room_lookup_failed":
        return "기존 채팅방 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.";
      case "room_create_failed":
      case "room_participant_create_failed":
        return "1:1 채팅방 생성에 실패했습니다.";
      case "group_create_failed":
      case "group_participant_create_failed":
        return "그룹방 생성에 실패했습니다.";
      case "messenger_storage_unavailable":
        return "메신저 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";
      case "messenger_migration_required":
        return "메신저 저장소 마이그레이션이 아직 반영되지 않았습니다. 데이터베이스 스키마를 먼저 업데이트해 주세요.";
      default:
        return "메신저 작업을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    }
  }, []);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/community-messenger/bootstrap", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as CommunityMessengerBootstrap & { ok?: boolean; error?: string };
      if (res.ok && json.ok) {
        setAuthRequired(false);
        setPageError(null);
        setData({
          me: json.me ?? null,
          tabs: json.tabs ?? EMPTY_COUNTS,
          friends: json.friends ?? [],
          following: json.following ?? [],
          blocked: json.blocked ?? [],
          requests: json.requests ?? [],
          chats: json.chats ?? [],
          groups: json.groups ?? [],
          discoverableGroups: json.discoverableGroups ?? [],
          calls: json.calls ?? [],
        });
      } else {
        setAuthRequired(res.status === 401 || res.status === 403);
        setPageError(
          res.status === 401 || res.status === 403
            ? "로그인 후 메신저를 사용할 수 있습니다."
            : "메신저 데이터를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요."
        );
        setData(null);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useCommunityMessengerHomeRealtime({
    userId: data?.me?.id ?? null,
    roomIds: homeRoomIds,
    enabled: !loading,
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

  const startDirectRoom = useCallback(
    async (peerUserId: string) => {
      setActionError(null);
      setBusyId(`room:${peerUserId}`);
      try {
        const res = await fetch("/api/community-messenger/rooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomType: "direct", peerUserId }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; roomId?: string; error?: string };
        if (res.ok && json.ok && json.roomId) {
          router.push(`/community-messenger/rooms/${encodeURIComponent(json.roomId)}`);
          return;
        }
        if (res.status === 401 || res.status === 403) {
          setAuthRequired(true);
          setPageError("로그인 후 메신저를 사용할 수 있습니다.");
          return;
        }
        setActionError(getMessengerActionErrorMessage(json.error));
      } finally {
        setBusyId(null);
      }
    },
    [getMessengerActionErrorMessage, router]
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
        await fetch("/api/community-messenger/friend-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetUserId }),
        });
        await refresh();
        await searchUsers();
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
        await fetch(`/api/community-messenger/friend-requests/${encodeURIComponent(requestId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        await refresh();
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
        await fetch(`/api/community-messenger/friends/${encodeURIComponent(friendUserId)}/favorite`, {
          method: "POST",
        });
        await refresh();
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
        await fetch("/api/community/neighbor-relations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetUserId }),
        });
        await refresh();
        await searchUsers();
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
        await fetch("/api/community/block-relations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetUserId }),
        });
        await refresh();
        await searchUsers();
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
      await refresh();
      if (res.ok && json.ok && json.roomId) {
        setGroupTitle("");
        setGroupMembers([]);
        setGroupCreateStep("closed");
        router.push(`/community-messenger/rooms/${encodeURIComponent(json.roomId)}`);
        return;
      }
      if (res.status === 401 || res.status === 403) {
        setAuthRequired(true);
        setPageError("로그인 후 메신저를 사용할 수 있습니다.");
        return;
      }
      setActionError(getMessengerActionErrorMessage(json.error));
    } finally {
      setBusyId(null);
    }
  }, [getMessengerActionErrorMessage, groupMembers, groupTitle, refresh, router]);

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
      await refresh();
      if (res.ok && json.ok && json.roomId) {
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
        setPageError("로그인 후 메신저를 사용할 수 있습니다.");
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
      await refresh();
      if (res.ok && json.ok && json.roomId) {
        setJoinPassword("");
        setJoinIdentityMode("real_name");
        setJoinAliasName("");
        setJoinAliasBio("");
        setJoinAliasAvatarUrl("");
        setJoinTargetGroup(null);
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

  const sortedChats = useMemo(() => sortRooms(data?.chats ?? []), [data?.chats]);
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
  const sortedCalls = useMemo(() => sortCalls(data?.calls ?? []), [data?.calls]);
  const missedCallCount = useMemo(
    () => (data?.calls ?? []).filter((call) => call.status === "missed").length,
    [data?.calls]
  );
  const groupCallCount = useMemo(
    () => (data?.calls ?? []).filter((call) => call.sessionMode === "group").length,
    [data?.calls]
  );
  const directCallCount = useMemo(
    () => (data?.calls ?? []).filter((call) => call.sessionMode === "direct").length,
    [data?.calls]
  );
  const endedCallCount = useMemo(
    () => (data?.calls ?? []).filter((call) => call.status === "ended").length,
    [data?.calls]
  );

  const removeFriend = useCallback(
    async (friendUserId: string) => {
      if (!window.confirm("이 친구를 삭제할까요? 친구 관계만 해제되고 기존 채팅방은 유지됩니다.")) return;
      setBusyId(`remove-friend:${friendUserId}`);
      try {
        await fetch(`/api/community-messenger/friends/${encodeURIComponent(friendUserId)}`, {
          method: "DELETE",
        });
        await refresh();
        await searchUsers();
      } finally {
        setBusyId(null);
      }
    },
    [refresh, searchUsers]
  );

  return (
    <div className="space-y-4 px-4 py-4">
      <section className="rounded-[24px] bg-[#06C755] px-5 py-5 text-white shadow-[0_18px_44px_rgba(6,199,85,0.22)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[13px] font-medium text-white/80">SAMarket 메신저</p>
            <h1 className="mt-1 text-[24px] font-semibold leading-tight">친구, 그룹, 통화를 한곳에서 관리하세요</h1>
            <p className="mt-2 text-[13px] leading-5 text-white/85">
              거래 채팅과 주문 채팅은 분리 유지하고, 커뮤니티 메신저만 별도 축으로 운영합니다.
            </p>
          </div>
          <div className="rounded-full bg-white/15 px-3 py-1 text-[12px] font-semibold">
            {data?.me?.label ?? "메신저"}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link
            href="/mypage/trade/chat"
            className="rounded-2xl bg-white/14 px-4 py-3 text-left transition hover:bg-white/20"
          >
            <p className="text-[11px] text-white/70">분리 유지</p>
            <p className="mt-1 text-[15px] font-semibold">거래 채팅</p>
          </Link>
          <Link
            href="/my/store-orders"
            className="rounded-2xl bg-white/14 px-4 py-3 text-left transition hover:bg-white/20"
          >
            <p className="text-[11px] text-white/70">분리 유지</p>
            <p className="mt-1 text-[15px] font-semibold">주문 채팅</p>
          </Link>
        </div>
      </section>

      <TradeManagementTabBar
        tabs={HOME_TABS}
        active={activeTab}
        counts={counts}
        onChange={setTab}
      />

      {actionError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">{actionError}</div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white px-4 py-10 text-center text-[14px] text-gray-500">
          메신저 데이터를 불러오는 중입니다.
        </div>
      ) : null}

      {!loading && authRequired ? (
        <section className="rounded-2xl border border-gray-200 bg-white px-4 py-8 text-center">
          <p className="text-[16px] font-semibold text-gray-900">로그인이 필요합니다.</p>
          <p className="mt-2 text-[13px] text-gray-500">{pageError ?? "메신저는 로그인 후 사용할 수 있습니다."}</p>
          <div className="mt-4 flex justify-center">
            <Link
              href={`/login?next=${encodeURIComponent("/community-messenger")}`}
              className="rounded-xl bg-[#06C755] px-4 py-3 text-[14px] font-semibold text-white"
            >
              로그인하러 가기
            </Link>
          </div>
        </section>
      ) : null}

      {!loading && !authRequired && !data ? (
        <section className="rounded-2xl border border-gray-200 bg-white px-4 py-8 text-center">
          <p className="text-[16px] font-semibold text-gray-900">메신저를 불러오지 못했습니다.</p>
          <p className="mt-2 text-[13px] text-gray-500">{pageError ?? "잠시 후 다시 시도해 주세요."}</p>
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-xl bg-[#06C755] px-4 py-3 text-[14px] font-semibold text-white"
            >
              다시 불러오기
            </button>
          </div>
        </section>
      ) : null}

      {!loading && data && activeTab === "friends" ? (
        <div className="space-y-4">
          <section className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex gap-2">
              <input
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="닉네임 또는 아이디로 친구 찾기"
                className="h-11 flex-1 rounded-xl border border-gray-200 px-3 text-[14px] outline-none focus:border-[#06C755]"
              />
              <button
                type="button"
                onClick={() => void searchUsers()}
                disabled={busyId === "user-search"}
                className="rounded-xl bg-[#06C755] px-4 text-[14px] font-semibold text-white disabled:opacity-50"
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
                          className="rounded-lg border border-gray-200 px-3 py-2 text-[12px] font-medium text-gray-700"
                        >
                          {user.following ? "팔로우 해제" : "팔로우"}
                        </button>
                        {user.isFriend ? (
                          <button
                            type="button"
                            onClick={() => void startDirectRoom(user.id)}
                            disabled={busyId === `room:${user.id}`}
                            className="rounded-lg bg-[#06C755] px-3 py-2 text-[12px] font-semibold text-white"
                          >
                            채팅
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void requestFriend(user.id)}
                            disabled={busyId === `friend:${user.id}` || user.blocked}
                            className="rounded-lg bg-[#111827] px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-40"
                          >
                            친구 요청
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void toggleBlock(user.id)}
                          disabled={busyId === `block:${user.id}`}
                          className={`rounded-lg px-3 py-2 text-[12px] font-medium ${
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

          <InfoSection title="친구 요청" subtitle="수락하면 바로 1:1 채팅과 그룹 초대가 가능해집니다.">
            {data?.requests.length ? (
              data.requests.map((request) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  busyId={busyId}
                  onAction={respondRequest}
                />
              ))
            ) : (
              <EmptyCard message="대기 중인 친구 요청이 없습니다." />
            )}
          </InfoSection>

          <InfoSection title="즐겨찾는 친구" subtitle="라인 스타일로 상단 고정해 빠르게 접근합니다.">
            {favoriteFriends.length ? (
              favoriteFriends.map((friend) => (
                <ProfileCard
                  key={friend.id}
                  profile={friend}
                  actionSlot={
                    <>
                      <button
                        type="button"
                        onClick={() => void toggleFavoriteFriend(friend.id)}
                        disabled={busyId === `favorite:${friend.id}`}
                        className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-700"
                      >
                        즐겨찾기 해제
                      </button>
                      <button
                        type="button"
                        onClick={() => void startDirectRoom(friend.id)}
                        disabled={busyId === `room:${friend.id}`}
                        className="rounded-lg bg-[#06C755] px-3 py-2 text-[12px] font-semibold text-white"
                      >
                        채팅
                      </button>
                    </>
                  }
                />
              ))
            ) : (
              <EmptyCard message="즐겨찾기 친구가 없습니다." />
            )}
          </InfoSection>

          <InfoSection title="친구 목록" subtitle="1:1 채팅과 그룹 생성에 사용할 수 있습니다.">
            {sortedFriends.length ? (
              sortedFriends.map((friend) => (
                <ProfileCard
                  key={friend.id}
                  profile={friend}
                  actionSlot={
                    <>
                      <button
                        type="button"
                        onClick={() => void toggleFavoriteFriend(friend.id)}
                        disabled={busyId === `favorite:${friend.id}`}
                        className={`rounded-lg px-3 py-2 text-[12px] font-semibold ${
                          friend.isFavoriteFriend
                            ? "bg-amber-50 text-amber-700"
                            : "border border-amber-200 text-amber-700"
                        }`}
                      >
                        {friend.isFavoriteFriend ? "즐겨찾기 해제" : "즐겨찾기"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void startDirectRoom(friend.id)}
                        disabled={busyId === `room:${friend.id}`}
                        className="rounded-lg bg-[#06C755] px-3 py-2 text-[12px] font-semibold text-white"
                      >
                        1:1 채팅
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeFriend(friend.id)}
                        disabled={busyId === `remove-friend:${friend.id}`}
                        className="rounded-lg border border-red-200 px-3 py-2 text-[12px] font-medium text-red-600"
                      >
                        친구 삭제
                      </button>
                    </>
                  }
                />
              ))
            ) : (
              <EmptyCard message="아직 친구가 없습니다. 검색으로 친구를 추가해 보세요." />
            )}
          </InfoSection>

          <InfoSection title="팔로우 중" subtitle="친구로 전환하기 전에도 소셜 관계를 계속 유지할 수 있습니다.">
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
                        className="rounded-lg border border-gray-200 px-3 py-2 text-[12px] font-medium text-gray-700"
                      >
                        팔로우 해제
                      </button>
                      {!user.isFriend ? (
                        <button
                          type="button"
                          onClick={() => void requestFriend(user.id)}
                          disabled={busyId === `friend:${user.id}`}
                          className="rounded-lg bg-[#111827] px-3 py-2 text-[12px] font-semibold text-white"
                        >
                          친구 요청
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void startDirectRoom(user.id)}
                          disabled={busyId === `room:${user.id}`}
                          className="rounded-lg bg-[#06C755] px-3 py-2 text-[12px] font-semibold text-white"
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
        <InfoSection title="1:1 채팅방" subtitle="거래/주문 채팅과 분리된 커뮤니티 메신저 대화입니다.">
          {sortedChats.length ? (
            sortedChats.map((room) => <RoomCard key={room.id} room={room} href={`/community-messenger/rooms/${room.id}`} />)
          ) : (
            <EmptyCard message="아직 1:1 채팅방이 없습니다." />
          )}
        </InfoSection>
      ) : null}

      {!loading && data && activeTab === "groups" ? (
        <div className="space-y-4">
          <section className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[16px] font-semibold text-gray-900">그룹방 만들기</h2>
                <p className="mt-1 text-[13px] text-gray-500">카카오톡/라인처럼 상단 버튼에서 바로 생성 플로우를 시작합니다.</p>
              </div>
              <button
                type="button"
                onClick={() => setGroupCreateStep("select")}
                className="shrink-0 rounded-xl bg-[#06C755] px-4 py-3 text-[14px] font-semibold text-white"
              >
                그룹방 만들기
              </button>
            </div>
          </section>

          <InfoSection title="내 그룹방" subtitle="비공개 그룹과 내가 참여 중인 공개 그룹을 함께 봅니다.">
            {sortedGroups.length ? (
              <>
                {myPrivateGroups.length ? (
                  <div className="space-y-2">
                    <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">비공개 그룹</p>
                    {myPrivateGroups.map((room) => (
                      <RoomCard key={room.id} room={room} href={`/community-messenger/rooms/${room.id}`} />
                    ))}
                  </div>
                ) : null}
                {myOpenGroups.length ? (
                  <div className="space-y-2">
                    <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">참여 중인 공개 그룹</p>
                    {myOpenGroups.map((room) => (
                      <RoomCard key={room.id} room={room} href={`/community-messenger/rooms/${room.id}`} />
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <EmptyCard message="아직 참여 중인 그룹방이 없습니다." />
            )}
          </InfoSection>

          <InfoSection title="공개 그룹 찾기" subtitle="방 정책을 보고 입장 전에 미리보기, 실명/별칭 선택, 비밀번호 입력까지 처리합니다.">
            <input
              value={openGroupSearch}
              onChange={(e) => setOpenGroupSearch(e.target.value)}
              placeholder="제목, 소개, 방장으로 검색"
              className="h-11 w-full rounded-xl border border-gray-200 px-3 text-[14px] outline-none focus:border-[#06C755]"
            />
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
              <EmptyCard message="노출 중인 공개 그룹이 없습니다." />
            )}
          </InfoSection>
        </div>
      ) : null}

      {!loading && data && activeTab === "calls" ? (
        <div className="space-y-4">
          <section className="grid grid-cols-2 gap-2">
            <CallSummaryCard label="부재중" value={missedCallCount} tone="red" />
            <CallSummaryCard label="그룹 통화" value={groupCallCount} tone="sky" />
            <CallSummaryCard label="1:1 통화" value={directCallCount} tone="slate" />
            <CallSummaryCard label="완료" value={endedCallCount} tone="green" />
          </section>
          {missedCallCount > 0 ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
              최근 부재중 통화가 {missedCallCount}건 있습니다. 통화 탭에서 바로 확인해 보세요.
            </div>
          ) : null}
          {groupCallCount > 0 ? (
            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-[13px] text-sky-700">
              최근 그룹 통화가 {groupCallCount}건 있습니다. 참여 인원과 방 기준으로 기록을 확인할 수 있습니다.
            </div>
          ) : null}
          <InfoSection title="통화 기록" subtitle="실제 WebRTC 연결 기준으로 최근 상태를 표시합니다.">
            {sortedCalls.length ? (
              sortedCalls.map((call) => <CallCard key={call.id} call={call} />)
            ) : (
              <EmptyCard message="통화 기록이 없습니다." />
            )}
          </InfoSection>
        </div>
      ) : null}

      {!loading && data && activeTab === "settings" ? (
        <div className="space-y-4">
          <section className="rounded-2xl border border-gray-200 bg-white p-4">
            <h2 className="text-[16px] font-semibold text-gray-900">메신저 운영 원칙</h2>
            <ul className="mt-2 space-y-2 text-[13px] text-gray-600">
              <li>거래 채팅은 `거래 채팅`, 주문 채팅은 `주문 채팅`, 커뮤니티 대화는 `메신저`로 분리됩니다.</li>
              <li>친구 기반 1:1 채팅과 그룹 채팅을 기본으로 하고, 팔로우는 소셜 그래프 용도로 유지합니다.</li>
              <li>통화는 1:1과 최대 4인 그룹 메쉬 WebRTC를 지원하며, 홈 통화 탭에서 상태와 기록을 함께 관리합니다.</li>
            </ul>
          </section>

          <InfoSection title="차단 목록" subtitle="차단된 사용자는 친구/검색/채팅 진입에서 제외됩니다.">
            {data?.blocked.length ? (
              data.blocked.map((user) => (
                <ProfileCard
                  key={user.id}
                  profile={user}
                  actionSlot={
                    <button
                      type="button"
                      onClick={() => void toggleBlock(user.id)}
                      disabled={busyId === `block:${user.id}`}
                      className="rounded-lg bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700"
                    >
                      차단 해제
                    </button>
                  }
                />
              ))
            ) : (
              <EmptyCard message="차단된 사용자가 없습니다." />
            )}
          </InfoSection>

          <InfoSection title="즐겨찾기 친구" subtitle="라인 스타일 상단 고정 후보입니다.">
            {favoriteFriends.length ? (
              favoriteFriends.map((friend) => (
                <ProfileCard
                  key={friend.id}
                  profile={friend}
                  actionSlot={
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] text-amber-700">즐겨찾기됨</span>
                      <button
                        type="button"
                        onClick={() => void removeFriend(friend.id)}
                        disabled={busyId === `remove-friend:${friend.id}`}
                        className="rounded-lg border border-red-200 px-3 py-2 text-[12px] font-medium text-red-600"
                      >
                        친구 삭제
                      </button>
                    </div>
                  }
                />
              ))
            ) : (
              <EmptyCard message="즐겨찾기 친구가 없습니다." />
            )}
          </InfoSection>
        </div>
      ) : null}

      {groupCreateStep !== "closed" ? (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 px-4 pb-6 pt-10">
          <div className="w-full max-w-[520px] rounded-[28px] bg-white p-5 shadow-2xl">
            {groupCreateStep === "select" ? (
              <>
                <p className="text-[13px] font-medium text-[#06C755]">그룹 생성</p>
                <h2 className="mt-1 text-[20px] font-semibold text-gray-900">어떤 그룹을 만들까요?</h2>
                <div className="mt-4 grid gap-3">
                  <button
                    type="button"
                    onClick={() => setGroupCreateStep("private_group")}
                    className="rounded-2xl border border-gray-200 px-4 py-4 text-left transition hover:border-[#06C755] hover:bg-[#F6FFF9]"
                  >
                    <p className="text-[12px] text-gray-500">친구 초대형</p>
                    <p className="mt-1 text-[16px] font-semibold text-gray-900">비공개 그룹</p>
                    <p className="mt-1 text-[13px] text-gray-500">친구를 선택해 바로 만드는 초대형 그룹입니다.</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroupCreateStep("open_group")}
                    className="rounded-2xl border border-gray-200 px-4 py-4 text-left transition hover:border-[#111827] hover:bg-gray-50"
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
                    className="rounded-lg border border-gray-200 px-3 py-2 text-[12px] text-gray-700"
                  >
                    이전
                  </button>
                </div>
                <input
                  value={groupTitle}
                  onChange={(e) => setGroupTitle(e.target.value)}
                  placeholder="예: 사마켓 운영팀 (선택 입력)"
                  className="mt-4 h-11 w-full rounded-xl border border-gray-200 px-3 text-[14px] outline-none focus:border-[#06C755]"
                />
                <div className="mt-3 flex items-center justify-between gap-3 text-[12px] text-gray-500">
                  <span>선택된 친구 {groupMembers.length}명</span>
                  {groupMembers.length ? (
                    <button
                      type="button"
                      onClick={() => setGroupMembers([])}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-medium text-gray-700"
                    >
                      선택 해제
                    </button>
                  ) : null}
                </div>
                {groupTitlePreview ? (
                  <div className="mt-3 rounded-xl bg-[#F8FAF9] px-3 py-3 text-[12px] text-gray-600">
                    생성 예정 그룹명: <span className="font-semibold text-gray-900">{groupTitlePreview}</span>
                  </div>
                ) : null}
                <div className="mt-3 max-h-[280px] space-y-2 overflow-y-auto">
                  {(data?.friends ?? []).map((friend) => {
                    const checked = groupMembers.includes(friend.id);
                    return (
                      <label key={friend.id} className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-3">
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
                  <div className="mt-4 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-center">
                    <p className="text-[14px] font-semibold text-gray-900">초대할 친구가 아직 없습니다.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setGroupCreateStep("closed");
                        setTab("friends");
                      }}
                      className="mt-3 rounded-xl bg-[#06C755] px-4 py-3 text-[13px] font-semibold text-white"
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
                    className="rounded-lg border border-gray-200 px-3 py-2 text-[12px] text-gray-700"
                  >
                    이전
                  </button>
                </div>
                <div className="mt-4 grid gap-3">
                  <input
                    value={openGroupTitle}
                    onChange={(e) => setOpenGroupTitle(e.target.value)}
                    placeholder="공개 그룹 제목"
                    className="h-11 w-full rounded-xl border border-gray-200 px-3 text-[14px] outline-none focus:border-[#06C755]"
                  />
                  <textarea
                    value={openGroupSummary}
                    onChange={(e) => setOpenGroupSummary(e.target.value)}
                    rows={3}
                    placeholder="방 소개를 입력하세요"
                    className="w-full rounded-xl border border-gray-200 px-3 py-3 text-[14px] outline-none focus:border-[#06C755]"
                  />
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="rounded-xl border border-gray-100 px-3 py-3">
                      <p className="text-[13px] font-semibold text-gray-900">입장 방식</p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setOpenGroupJoinPolicy("password")}
                          className={`rounded-lg px-3 py-2 text-[12px] font-semibold ${openGroupJoinPolicy === "password" ? "bg-[#111827] text-white" : "bg-gray-100 text-gray-700"}`}
                        >
                          비밀번호
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenGroupJoinPolicy("free");
                            setOpenGroupPassword("");
                          }}
                          className={`rounded-lg px-3 py-2 text-[12px] font-semibold ${openGroupJoinPolicy === "free" ? "bg-[#111827] text-white" : "bg-gray-100 text-gray-700"}`}
                        >
                          자유 입장
                        </button>
                      </div>
                    </label>
                    <label className="rounded-xl border border-gray-100 px-3 py-3">
                      <p className="text-[13px] font-semibold text-gray-900">신원 정책</p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setOpenGroupIdentityPolicy("real_name");
                            setOpenGroupCreatorIdentityMode("real_name");
                          }}
                          className={`rounded-lg px-3 py-2 text-[12px] font-semibold ${openGroupIdentityPolicy === "real_name" ? "bg-[#06C755] text-white" : "bg-gray-100 text-gray-700"}`}
                        >
                          실명 기반
                        </button>
                        <button
                          type="button"
                          onClick={() => setOpenGroupIdentityPolicy("alias_allowed")}
                          className={`rounded-lg px-3 py-2 text-[12px] font-semibold ${openGroupIdentityPolicy === "alias_allowed" ? "bg-[#06C755] text-white" : "bg-gray-100 text-gray-700"}`}
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
                        className="h-11 w-full rounded-xl border border-gray-200 px-3 text-[14px] outline-none focus:border-[#06C755]"
                      />
                    ) : (
                      <div className="flex h-11 items-center rounded-xl bg-gray-50 px-3 text-[13px] text-gray-500">
                        자유 입장 선택됨
                      </div>
                    )}
                    <input
                      value={openGroupMemberLimit}
                      onChange={(e) => setOpenGroupMemberLimit(e.target.value.replace(/[^0-9]/g, ""))}
                      placeholder="최대 인원"
                      className="h-11 w-full rounded-xl border border-gray-200 px-3 text-[14px] outline-none focus:border-[#06C755]"
                    />
                  </div>
                  <label className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-3">
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
                    <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setOpenGroupCreatorIdentityMode("real_name")}
                          className={`rounded-lg px-3 py-2 text-[12px] font-semibold ${openGroupCreatorIdentityMode === "real_name" ? "bg-[#06C755] text-white" : "bg-white text-gray-700"}`}
                        >
                          방장도 실명 사용
                        </button>
                        <button
                          type="button"
                          onClick={() => setOpenGroupCreatorIdentityMode("alias")}
                          className={`rounded-lg px-3 py-2 text-[12px] font-semibold ${openGroupCreatorIdentityMode === "alias" ? "bg-[#06C755] text-white" : "bg-white text-gray-700"}`}
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
                            className="h-11 w-full rounded-xl border border-gray-200 px-3 text-[14px] outline-none focus:border-[#06C755]"
                          />
                          <input
                            value={openGroupCreatorAliasAvatarUrl}
                            onChange={(e) => setOpenGroupCreatorAliasAvatarUrl(e.target.value)}
                            placeholder="아바타 URL (선택)"
                            className="h-11 w-full rounded-xl border border-gray-200 px-3 text-[14px] outline-none focus:border-[#06C755]"
                          />
                          <textarea
                            value={openGroupCreatorAliasBio}
                            onChange={(e) => setOpenGroupCreatorAliasBio(e.target.value)}
                            rows={2}
                            placeholder="방장 소개 (선택)"
                            className="w-full rounded-xl border border-gray-200 px-3 py-3 text-[14px] outline-none focus:border-[#06C755]"
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
                className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-[14px] font-medium text-gray-700"
              >
                닫기
              </button>
              {groupCreateStep === "private_group" ? (
                <button
                  type="button"
                  onClick={() => void createPrivateGroup()}
                  disabled={busyId === "create-private-group" || groupMembers.length === 0}
                  className="flex-1 rounded-xl bg-[#06C755] px-4 py-3 text-[14px] font-semibold text-white disabled:opacity-40"
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
                  className="flex-1 rounded-xl bg-[#111827] px-4 py-3 text-[14px] font-semibold text-white disabled:opacity-40"
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
          <div className="w-full max-w-[440px] rounded-[28px] bg-white p-5 shadow-2xl">
            <p className="text-[13px] font-medium text-[#06C755]">공개 그룹 입장</p>
            <h2 className="mt-1 text-[20px] font-semibold text-gray-900">{joinTargetGroup.title}</h2>
            <p className="mt-2 text-[13px] leading-5 text-gray-500">
              {joinTargetGroup.summary || "입장 정책을 확인한 뒤 이 방에 참여할 수 있습니다."}
            </p>
            <div className="mt-4 rounded-2xl bg-gray-50 px-4 py-3 text-[12px] text-gray-600">
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
                className="mt-4 h-11 w-full rounded-xl border border-gray-200 px-3 text-[14px] outline-none focus:border-[#06C755]"
              />
            ) : null}
            <div className="mt-4 rounded-2xl border border-gray-100 px-4 py-4">
              <p className="text-[13px] font-semibold text-gray-900">표시 이름 선택</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setJoinIdentityMode("real_name")}
                  className={`rounded-lg px-3 py-2 text-[12px] font-semibold ${joinIdentityMode === "real_name" ? "bg-[#06C755] text-white" : "bg-gray-100 text-gray-700"}`}
                >
                  실명 프로필
                </button>
                {joinTargetGroup.identityPolicy === "alias_allowed" ? (
                  <button
                    type="button"
                    onClick={() => setJoinIdentityMode("alias")}
                    className={`rounded-lg px-3 py-2 text-[12px] font-semibold ${joinIdentityMode === "alias" ? "bg-[#06C755] text-white" : "bg-gray-100 text-gray-700"}`}
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
                    className="h-11 w-full rounded-xl border border-gray-200 px-3 text-[14px] outline-none focus:border-[#06C755]"
                  />
                  <input
                    value={joinAliasAvatarUrl}
                    onChange={(e) => setJoinAliasAvatarUrl(e.target.value)}
                    placeholder="아바타 URL (선택)"
                    className="h-11 w-full rounded-xl border border-gray-200 px-3 text-[14px] outline-none focus:border-[#06C755]"
                  />
                  <textarea
                    value={joinAliasBio}
                    onChange={(e) => setJoinAliasBio(e.target.value)}
                    rows={2}
                    placeholder="소개 (선택)"
                    className="w-full rounded-xl border border-gray-200 px-3 py-3 text-[14px] outline-none focus:border-[#06C755]"
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
                className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-[14px] font-medium text-gray-700"
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
                className="flex-1 rounded-xl bg-[#06C755] px-4 py-3 text-[14px] font-semibold text-white disabled:opacity-40"
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
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="mb-3">
        <h2 className="text-[16px] font-semibold text-gray-900">{title}</h2>
        <p className="mt-1 text-[13px] text-gray-500">{subtitle}</p>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function EmptyCard({ message }: { message: string }) {
  return (
    <div className="rounded-xl bg-gray-50 px-4 py-8 text-center text-[13px] text-gray-500">
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
    <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-3 py-3">
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
    <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-3 py-3">
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
              className="rounded-lg border border-gray-200 px-3 py-2 text-[12px] text-gray-700"
            >
              거절
            </button>
            <button
              type="button"
              onClick={() => void onAction(request.id, "accept")}
              disabled={busyId === `request:${request.id}:accept`}
              className="rounded-lg bg-[#06C755] px-3 py-2 text-[12px] font-semibold text-white"
            >
              수락
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => void onAction(request.id, "cancel")}
            disabled={busyId === `request:${request.id}:cancel`}
            className="rounded-lg border border-gray-200 px-3 py-2 text-[12px] text-gray-700"
          >
            요청 취소
          </button>
        )}
      </div>
    </div>
  );
}

function RoomCard({ room, href }: { room: CommunityMessengerRoomSummary; href: string }) {
  return (
    <Link href={href} className="block rounded-xl border border-gray-100 px-4 py-3 transition hover:bg-gray-50">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-[14px] font-semibold text-gray-900">{room.title}</p>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                room.roomType === "open_group" ? "bg-sky-50 text-sky-700" : "bg-gray-100 text-gray-700"
              }`}
            >
              {room.roomType === "open_group" ? "공개 그룹" : room.roomType === "private_group" ? "비공개 그룹" : "1:1"}
            </span>
            {room.roomType === "open_group" ? (
              <>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700">
                  {room.joinPolicy === "password" ? "비밀번호" : room.joinPolicy === "free" ? "자유 입장" : "초대형"}
                </span>
                <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                  {room.identityPolicy === "alias_allowed" ? "별칭 허용" : "실명 기반"}
                </span>
              </>
            ) : null}
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
          <p className="mt-1 truncate text-[13px] text-gray-700">{room.summary || room.lastMessage}</p>
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
    <div className="rounded-xl border border-gray-100 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-[14px] font-semibold text-gray-900">{group.title}</p>
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">공개 그룹</span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700">
              {group.joinPolicy === "password" ? "비밀번호" : "자유 입장"}
            </span>
            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
              {group.identityPolicy === "alias_allowed" ? "별칭 허용" : "실명 기반"}
            </span>
            {group.isJoined ? (
              <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">참여 중</span>
            ) : null}
          </div>
          <p className="mt-1 text-[12px] text-gray-500">{group.summary || "방 소개가 아직 없습니다."}</p>
          <p className="mt-1 text-[12px] text-gray-500">{group.lastMessage || "최근 활동 내역이 없습니다."}</p>
          <p className="mt-2 text-[12px] text-gray-600">
            방장 {group.ownerLabel} · 현재 {group.memberCount}명
            {group.memberLimit ? ` / 최대 ${group.memberLimit}명` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-gray-400">{formatRelative(group.lastMessageAt)}</p>
          <button
            type="button"
            onClick={onJoin}
            disabled={busy}
            className="mt-3 rounded-xl bg-[#06C755] px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-40"
          >
            {busy ? "입장 중..." : group.isJoined ? "다시 입장" : "입장"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CallCard({ call }: { call: CommunityMessengerCallLog }) {
  const tone =
    call.status === "missed"
      ? "text-red-600"
      : call.status === "rejected" || call.status === "cancelled"
        ? "text-gray-600"
        : call.status === "ended"
          ? "text-[#15803D]"
          : "text-[#06C755]";
  return (
    <div className="rounded-xl border border-gray-100 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[14px] font-semibold text-gray-900">{call.title}</p>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                call.sessionMode === "group" ? "bg-sky-50 text-sky-700" : "bg-gray-100 text-gray-700"
              }`}
            >
              {call.sessionMode === "group" ? "그룹" : "1:1"}
            </span>
          </div>
          <p className={`mt-1 text-[12px] ${tone}`}>
            {call.callKind === "video" ? "영상 통화" : "음성 통화"} · {formatCallStatus(call.status)}
          </p>
          <p className="mt-1 text-[12px] text-gray-500">
            {call.sessionMode === "group"
              ? `${call.peerLabel} · 총 ${call.participantCount}명`
              : call.peerLabel}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-gray-400">{formatRelative(call.startedAt)}</p>
          <p className="mt-1 text-[12px] font-medium text-gray-700">{formatDurationShort(call.durationSeconds)}</p>
        </div>
      </div>
    </div>
  );
}

function CallSummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "red" | "slate" | "green" | "sky";
}) {
  const className =
    tone === "red"
      ? "border-red-200 bg-red-50 text-red-700"
      : tone === "sky"
        ? "border-sky-200 bg-sky-50 text-sky-700"
      : tone === "green"
        ? "border-green-200 bg-green-50 text-green-700"
        : "border-gray-200 bg-gray-50 text-gray-700";
  return (
    <div className={`rounded-2xl border px-4 py-3 ${className}`}>
      <p className="text-[12px] font-medium">{label}</p>
      <p className="mt-1 text-[20px] font-semibold">{value}</p>
    </div>
  );
}

function sortRooms(rooms: CommunityMessengerRoomSummary[]): CommunityMessengerRoomSummary[] {
  return [...rooms].sort((a, b) => {
    if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
  });
}

function sortCalls(calls: CommunityMessengerCallLog[]): CommunityMessengerCallLog[] {
  return [...calls].sort((a, b) => {
    const aMissed = a.status === "missed" ? 1 : 0;
    const bMissed = b.status === "missed" ? 1 : 0;
    if (aMissed !== bMissed) return bMissed - aMissed;
    return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
  });
}

function formatCallStatus(status: CommunityMessengerCallLog["status"]): string {
  if (status === "missed") return "부재중";
  if (status === "rejected") return "거절됨";
  if (status === "cancelled") return "취소됨";
  if (status === "ended") return "통화 종료";
  if (status === "incoming") return "수신 중";
  return "발신 중";
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

function formatDurationShort(value: number): string {
  const total = Math.max(0, Math.floor(value));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins < 1) return `${secs}초`;
  return `${mins}분 ${secs}초`;
}
