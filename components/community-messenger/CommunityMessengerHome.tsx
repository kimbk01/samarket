"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TradeManagementTabBar } from "@/components/mypage/TradeManagementTabBar";
import { useCommunityMessengerHomeRealtime } from "@/lib/community-messenger/use-community-messenger-realtime";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerCallLog,
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
  const counts = data?.tabs ?? EMPTY_COUNTS;

  const getMessengerActionErrorMessage = useCallback((error?: string) => {
    switch (error) {
      case "bad_peer":
        return "1:1 채팅 대상을 다시 확인해 주세요.";
      case "blocked_target":
        return "차단 관계에서는 채팅방을 만들 수 없습니다.";
      case "title_required":
        return "그룹방 제목을 입력해 주세요.";
      case "members_required":
        return "그룹방에 초대할 친구를 1명 이상 선택해 주세요.";
      case "room_lookup_failed":
        return "기존 채팅방 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.";
      case "room_create_failed":
      case "room_participant_create_failed":
        return "1:1 채팅방 생성에 실패했습니다.";
      case "group_create_failed":
      case "group_participant_create_failed":
        return "그룹방 생성에 실패했습니다.";
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

  const createGroup = useCallback(async () => {
    const memberIds = groupMembers.filter(Boolean);
    if (!groupTitle.trim() || memberIds.length === 0) return;
    setActionError(null);
    setBusyId("create-group");
    try {
      const res = await fetch("/api/community-messenger/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomType: "group",
          title: groupTitle,
          memberIds,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; roomId?: string; error?: string };
      await refresh();
      if (res.ok && json.ok && json.roomId) {
        setGroupTitle("");
        setGroupMembers([]);
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
            <h2 className="text-[16px] font-semibold text-gray-900">새 그룹 만들기</h2>
            <p className="mt-1 text-[13px] text-gray-500">제목은 선택 입력입니다. 비워두면 선택한 친구 이름으로 자동 생성됩니다.</p>
            <input
              value={groupTitle}
              onChange={(e) => setGroupTitle(e.target.value)}
              placeholder="예: 사마켓 운영팀 (선택 입력)"
              className="mt-3 h-11 w-full rounded-xl border border-gray-200 px-3 text-[14px] outline-none focus:border-[#06C755]"
            />
            <div className="mt-3 flex items-center justify-between gap-3 text-[12px] text-gray-500">
              <span>선택된 친구 {groupMembers.length}명</span>
              {groupMembers.length > 0 ? (
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
            {(data?.friends ?? []).length > 0 ? (
              <>
                <div className="mt-3 grid gap-2">
                  {(data?.friends ?? []).map((friend) => {
                    const checked = groupMembers.includes(friend.id);
                    return (
                      <label
                        key={friend.id}
                        className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-3"
                      >
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
                <button
                  type="button"
                  onClick={() => void createGroup()}
                  disabled={busyId === "create-group" || groupMembers.length === 0}
                  className="mt-4 w-full rounded-xl bg-[#06C755] px-4 py-3 text-[14px] font-semibold text-white disabled:opacity-40"
                >
                  {busyId === "create-group" ? "그룹 생성 중..." : "그룹 생성"}
                </button>
              </>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-center">
                <p className="text-[14px] font-semibold text-gray-900">그룹에 초대할 친구가 아직 없습니다.</p>
                <p className="mt-1 text-[12px] text-gray-500">친구를 먼저 추가하면 그룹방 생성이 바로 활성화됩니다.</p>
                <button
                  type="button"
                  onClick={() => setTab("friends")}
                  className="mt-3 rounded-xl bg-[#06C755] px-4 py-3 text-[13px] font-semibold text-white"
                >
                  친구 탭으로 이동
                </button>
              </div>
            )}
          </section>

          <InfoSection title="그룹 채팅방" subtitle="운영 공지, 동호회, 지역 모임 메신저를 별도 축으로 운영합니다.">
            {sortedGroups.length ? (
              sortedGroups.map((room) => <RoomCard key={room.id} room={room} href={`/community-messenger/rooms/${room.id}`} />)
            ) : (
              <EmptyCard message="아직 그룹 채팅방이 없습니다." />
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
          <p className="mt-1 truncate text-[13px] text-gray-700">{room.lastMessage}</p>
        </div>
        <div className="shrink-0 text-[11px] text-gray-400">{formatRelative(room.lastMessageAt)}</div>
      </div>
    </Link>
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
