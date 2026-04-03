"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MeetingOpenChatJoinDialog } from "@/components/meeting-open-chat/MeetingOpenChatJoinDialog";
import type { MeetingOpenChatListInitialData } from "@/lib/meeting-open-chat/meeting-open-chat-list-initial-data";
import type {
  MeetingOpenChatJoinAs,
  MeetingOpenChatRoomListEntry,
} from "@/lib/meeting-open-chat/types";
import { philifeAppPaths } from "@/lib/philife/paths";
import { MAIN_SCROLL_PADDING_WITH_BOTTOM_NAV_CLASS } from "@/lib/main-menu/bottom-nav-config";

function joinBadge(jt: MeetingOpenChatRoomListEntry["join_type"]) {
  if (jt === "password" || jt === "password_approval") return "비밀번호";
  if (jt === "approval") return "승인";
  return "즉시";
}

function identityBadge(mode: MeetingOpenChatRoomListEntry["identity_mode"]) {
  return mode === "realname" ? "실명" : "닉네임/실명";
}

function roomAccessSummary(room: MeetingOpenChatRoomListEntry): string {
  const joinLabel =
    room.join_type === "password" || room.join_type === "password_approval"
      ? "비밀번호 입력 후 참여"
      : room.join_type === "approval"
        ? "방장 승인 후 참여"
        : "누르면 바로 참여";
  const identityLabel =
    room.identity_mode === "realname" ? "실명으로 표시" : "실명 또는 닉네임 선택 가능";
  return `${joinLabel} · ${identityLabel}`;
}

function roomActionLabel(room: MeetingOpenChatRoomListEntry): string {
  return room.viewerIsChatMember ? "대화 보기" : "입장";
}

type RoomSortKey = "recent" | "members" | "unread";

const ROOM_AVATAR_BACKGROUNDS = [
  "linear-gradient(135deg, #34d399, #059669)",
  "linear-gradient(135deg, #60a5fa, #2563eb)",
  "linear-gradient(135deg, #f59e0b, #d97706)",
  "linear-gradient(135deg, #f472b6, #db2777)",
  "linear-gradient(135deg, #a78bfa, #7c3aed)",
  "linear-gradient(135deg, #22d3ee, #0891b2)",
];

function hashText(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function roomAvatarBackground(room: MeetingOpenChatRoomListEntry): string {
  const key = `${room.id}:${room.title}:${room.identity_mode}`;
  return ROOM_AVATAR_BACKGROUNDS[hashText(key) % ROOM_AVATAR_BACKGROUNDS.length] ?? ROOM_AVATAR_BACKGROUNDS[0];
}

function roomAvatarLabel(room: MeetingOpenChatRoomListEntry): string {
  const trimmed = room.title.trim();
  if (!trimmed) return "OC";
  return trimmed.replace(/\s+/g, "").slice(0, 2).toUpperCase();
}

function formatJoinError(code: string | null): string | null {
  if (!code) return null;
  switch (code) {
    case "invalid_password":
      return "비밀번호가 올바르지 않습니다.";
    case "open_nickname_required":
      return "닉네임을 입력해 주세요.";
    case "open_nickname_taken":
      return "이미 사용 중인 닉네임입니다. 다른 닉네임으로 시도해 주세요.";
    case "realname_required":
      return "프로필 실명이 있어야 실명 참여를 사용할 수 있습니다.";
    case "room_full":
    case "full":
      return "인원이 가득 찼습니다.";
    default:
      return code.length < 100 ? code : "입장에 실패했습니다.";
  }
}

export function MeetingOpenChatListClient({
  meetingId,
  variant = "standalone",
  postBackHref,
  initialData,
}: {
  meetingId: string;
  /** 모임 상세에 넣을 때: 높이·헤더 축소 */
  variant?: "standalone" | "embedded";
  /** embedded일 때 '← 글' (피드 게시글) */
  postBackHref?: string;
  initialData?: MeetingOpenChatListInitialData | null;
}) {
  const router = useRouter();
  const autoEnteredRef = useRef(false);
  const autoPromptedJoinRef = useRef(false);
  useEffect(() => {
    autoEnteredRef.current = false;
    autoPromptedJoinRef.current = false;
  }, [meetingId]);

  useEffect(() => {
    setRooms(initialData?.rooms ?? null);
    setViewerSuggestedOpenNickname(initialData?.viewerSuggestedOpenNickname ?? null);
    setViewerSuggestedRealname(initialData?.viewerSuggestedRealname ?? null);
    setLoading(!initialData);
    setError(null);
  }, [initialData, meetingId]);
  const [rooms, setRooms] = useState<MeetingOpenChatRoomListEntry[] | null>(() => initialData?.rooms ?? null);
  const [viewerSuggestedOpenNickname, setViewerSuggestedOpenNickname] = useState<string | null>(
    () => initialData?.viewerSuggestedOpenNickname ?? null
  );
  const [viewerSuggestedRealname, setViewerSuggestedRealname] = useState<string | null>(
    () => initialData?.viewerSuggestedRealname ?? null
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !initialData);
  const [joinRoom, setJoinRoom] = useState<MeetingOpenChatRoomListEntry | null>(null);
  const [joinNick, setJoinNick] = useState("");
  const [joinPw, setJoinPw] = useState("");
  const [joinIntro, setJoinIntro] = useState("");
  const [joinErr, setJoinErr] = useState<string | null>(null);
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinAs, setJoinAs] = useState<MeetingOpenChatJoinAs>("nickname");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<RoomSortKey>("recent");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const qs = searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : "";
      const res = await fetch(
        `/api/community/meetings/${encodeURIComponent(meetingId)}/meeting-open-chat/rooms${qs}`,
        { credentials: "include", cache: "no-store" }
      );
      const json = (await res.json()) as {
        ok?: boolean;
        rooms?: MeetingOpenChatRoomListEntry[];
        viewerSuggestedOpenNickname?: string | null;
        viewerSuggestedRealname?: string | null;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        if (!silent) {
          setError(json.error ?? "목록을 불러오지 못했습니다.");
          setRooms([]);
        }
        return;
      }
      const raw = json.rooms ?? [];
      const byId = new Map<string, MeetingOpenChatRoomListEntry>();
      for (const r of raw) {
        if (r?.id && !byId.has(r.id)) byId.set(r.id, r);
      }
      setRooms([...byId.values()]);
      setViewerSuggestedOpenNickname(
        typeof json.viewerSuggestedOpenNickname === "string" && json.viewerSuggestedOpenNickname.trim()
          ? json.viewerSuggestedOpenNickname.trim().slice(0, 40)
          : null
      );
      setViewerSuggestedRealname(
        typeof json.viewerSuggestedRealname === "string" && json.viewerSuggestedRealname.trim()
          ? json.viewerSuggestedRealname.trim().slice(0, 40)
          : null
      );
      if (!silent) setError(null);
    } catch {
      if (!silent) {
        setError("네트워크 오류");
        setRooms([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [meetingId, searchQuery]);

  useEffect(() => {
    void load({ silent: Boolean(initialData) });
  }, [initialData, load]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void load({ silent: true });
    }, 45000);
    return () => window.clearInterval(id);
  }, [load]);

  const base = `/philife/meetings/${encodeURIComponent(meetingId)}/meeting-open-chat`;

  const sortedRooms = useMemo(() => {
    const list = [...(rooms ?? [])];
    if (sortKey === "members") {
      return list.sort((a, b) => {
        const memberGap = b.active_member_count - a.active_member_count;
        if (memberGap !== 0) return memberGap;
        return new Date(b.last_message_at ?? b.created_at).getTime() - new Date(a.last_message_at ?? a.created_at).getTime();
      });
    }
    if (sortKey === "unread") {
      return list.sort((a, b) => {
        const unreadGap = (b.viewerUnreadCount ?? 0) - (a.viewerUnreadCount ?? 0);
        if (unreadGap !== 0) return unreadGap;
        return new Date(b.last_message_at ?? b.created_at).getTime() - new Date(a.last_message_at ?? a.created_at).getTime();
      });
    }
    return list.sort(
      (a, b) =>
        new Date(b.last_message_at ?? b.created_at).getTime() - new Date(a.last_message_at ?? a.created_at).getTime()
    );
  }, [rooms, sortKey]);

  /** 방이 1개뿐이면 목록 없이 바로 채팅 화면으로 (다중 방만 목록 유지) */
  useEffect(() => {
    if (loading || error || searchQuery || sortedRooms.length !== 1 || autoEnteredRef.current) return;
    autoEnteredRef.current = true;
    const only = sortedRooms[0];
    if (!only?.id || !only.viewerIsChatMember) return;
    router.replace(`${base}/${encodeURIComponent(only.id)}`);
  }, [loading, error, searchQuery, sortedRooms, base, router]);

  useEffect(() => {
    if (loading || error || searchQuery || sortedRooms.length !== 1 || autoPromptedJoinRef.current) return;
    const only = sortedRooms[0];
    if (!only?.id || only.viewerIsChatMember || joinRoom) return;
    autoPromptedJoinRef.current = true;
    setJoinRoom(only);
    setJoinErr(null);
    setJoinPw("");
    setJoinIntro("");
    setJoinNick(viewerSuggestedOpenNickname ?? "");
    setJoinAs(only.identity_mode === "realname" ? "realname" : viewerSuggestedRealname ? "realname" : "nickname");
  }, [
    loading,
    error,
    searchQuery,
    sortedRooms,
    joinRoom,
    viewerSuggestedOpenNickname,
    viewerSuggestedRealname,
  ]);

  const openJoinModal = useCallback(
    (room: MeetingOpenChatRoomListEntry) => {
      setJoinRoom(room);
      setJoinErr(null);
      setJoinPw("");
      setJoinIntro("");
      setJoinNick(viewerSuggestedOpenNickname ?? "");
      setJoinAs(room.identity_mode === "realname" ? "realname" : viewerSuggestedRealname ? "realname" : "nickname");
    },
    [viewerSuggestedOpenNickname, viewerSuggestedRealname]
  );

  const closeJoinModal = useCallback(() => {
    if (joinBusy) return;
    setJoinRoom(null);
    setJoinErr(null);
    setJoinPw("");
    setJoinIntro("");
  }, [joinBusy]);

  const handleRoomSelect = useCallback(
    (room: MeetingOpenChatRoomListEntry) => {
      if (room.viewerIsChatMember) {
        router.push(`${base}/${encodeURIComponent(room.id)}`);
        return;
      }
      openJoinModal(room);
    },
    [base, openJoinModal, router]
  );

  const submitJoin = useCallback(async () => {
    if (!joinRoom) return;
    setJoinBusy(true);
    setJoinErr(null);
    try {
      const apiJoin = `/api/community/meetings/${encodeURIComponent(meetingId)}/meeting-open-chat/rooms/${encodeURIComponent(joinRoom.id)}/join`;
      const needsIntro = joinRoom.join_type === "approval" || joinRoom.join_type === "password_approval";
      const res = await fetch(apiJoin, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          joinAs,
          openNickname: joinAs === "nickname" ? joinNick.trim().slice(0, 40) : undefined,
          joinPassword: joinRoom.has_password ? joinPw : undefined,
          introMessage: needsIntro ? joinIntro.trim() : undefined,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        joined?: boolean;
        pendingApproval?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setJoinErr(json.error ?? "join_failed");
        return;
      }
      if (json.pendingApproval) {
        alert("입장 신청이 접수되었습니다. 운영자 승인을 기다려 주세요.");
        closeJoinModal();
        void load({ silent: true });
        return;
      }
      router.push(`${base}/${encodeURIComponent(joinRoom.id)}`);
    } finally {
      setJoinBusy(false);
    }
  }, [base, closeJoinModal, joinAs, joinIntro, joinNick, joinPw, joinRoom, load, meetingId, router]);

  const totalUnread = (rooms ?? []).reduce(
    (s, r) => s + (r.viewerIsChatMember ? r.viewerUnreadCount : 0),
    0
  );

  const shellClass =
    variant === "embedded"
      ? "flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-[#f7f7f7] shadow-sm"
      : "min-h-[60vh] bg-[#f7f7f7]";

  const bodyClass =
    variant === "embedded"
      ? `min-h-0 flex-1 overflow-y-auto px-3 py-3 ${MAIN_SCROLL_PADDING_WITH_BOTTOM_NAV_CLASS}`
      : `px-3 py-3 ${MAIN_SCROLL_PADDING_WITH_BOTTOM_NAV_CLASS}`;

  return (
    <div className={shellClass}>
      {variant === "standalone" ? (
        <header className="sticky top-0 z-30 border-b border-gray-200/90 bg-[#f7f7f7]/95 backdrop-blur-md">
          <div className="flex h-[52px] items-center gap-2 px-3">
            <Link
              href={postBackHref ?? philifeAppPaths.meetingOpenChat(meetingId)}
              className="text-[15px] text-emerald-700"
            >
              {postBackHref ? "← 글" : "← 뒤로"}
            </Link>
            <h1 className="flex flex-1 items-center justify-center gap-1.5 text-center text-[16px] font-bold text-gray-900">
              <span>채팅</span>
              {totalUnread > 0 && (
                <span
                  className="rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-bold leading-none text-white"
                  aria-label={`읽지 않은 메시지 합계 ${totalUnread > 99 ? "99개 이상" : `${totalUnread}개`}`}
                >
                  {totalUnread > 99 ? "99+" : totalUnread}
                </span>
              )}
            </h1>
            <span className="w-14" />
          </div>
        </header>
      ) : (
        <div className="flex shrink-0 items-center gap-2 border-b border-gray-200/90 bg-[#f7f7f7] px-2 py-2">
          {postBackHref ? (
            <Link href={postBackHref} className="shrink-0 text-[13px] font-semibold text-emerald-700">
              ← 글
            </Link>
          ) : (
            <span className="w-8 shrink-0" />
          )}
          <h2 className="flex min-w-0 flex-1 items-center justify-center gap-1.5 text-center text-[14px] font-bold text-gray-900">
            <span>채팅</span>
            {totalUnread > 0 && (
              <span className="shrink-0 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold leading-none text-white">
                {totalUnread > 99 ? "99+" : totalUnread}
              </span>
            )}
          </h2>
          <Link
            href={base}
            className="shrink-0 text-[12px] font-semibold text-emerald-700"
            title="전체 화면"
          >
            전체
          </Link>
        </div>
      )}

      <div className={bodyClass}>
        <div className="mb-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="채팅방 이름 검색"
              className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as RoomSortKey)}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            >
              <option value="recent">최신순</option>
              <option value="members">인원순</option>
              <option value="unread">안 읽은순</option>
            </select>
          </div>
          <p className="mt-2 text-[11px] text-gray-500">
            방을 누르면 바로 입장하거나, 비밀번호 방이면 같은 화면 팝업에서 비밀번호를 입력합니다.
          </p>
        </div>
        {loading && <p className="text-center text-sm text-gray-500">채팅방으로 이동하는 중…</p>}
        {error && <p className="text-center text-sm text-red-600">{error}</p>}
        {!loading && sortedRooms.length === 0 && !error && (
          <p className="text-center text-sm text-gray-500">
            {searchQuery ? "검색 결과가 없습니다." : "아직 채팅방이 없습니다."}
          </p>
        )}
        {!loading && sortedRooms.length === 1 && sortedRooms[0]?.viewerIsChatMember && !error && !searchQuery ? (
          <p className="text-center text-sm text-gray-500">채팅방으로 연결하는 중…</p>
        ) : null}
        <ul className="mt-2 space-y-2">
          {sortedRooms.map((r) => {
            const badge = joinBadge(r.join_type);
            const idBadge = identityBadge(r.identity_mode);
            const accessSummary = roomAccessSummary(r);
            const actionLabel = roomActionLabel(r);
            const avatarLabel = roomAvatarLabel(r);
            const avatarBackground = roomAvatarBackground(r);
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => handleRoomSelect(r)}
                  className={`flex w-full gap-3 rounded-2xl border bg-white p-3 text-left shadow-sm transition ${
                    r.viewerIsChatMember && r.viewerUnreadCount > 0
                      ? "border-emerald-200 shadow-[0_8px_24px_rgba(16,185,129,0.10)]"
                      : "border-gray-100"
                  }`}
                >
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl text-xs font-bold text-white"
                    style={
                      r.thumbnail_url?.trim()
                        ? {
                            backgroundImage: `url("${r.thumbnail_url.trim().replace(/"/g, '\\"')}")`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                            backgroundColor: "#d1d5db",
                          }
                        : { backgroundImage: avatarBackground }
                    }
                    aria-hidden
                  >
                    {!r.thumbnail_url?.trim() ? avatarLabel : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`truncate ${r.viewerIsChatMember && r.viewerUnreadCount > 0 ? "font-bold text-gray-900" : "font-semibold text-gray-900"}`}
                      >
                        {r.title}
                      </span>
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                        {badge}
                      </span>
                      <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-800">
                        {idBadge}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-gray-500">{accessSummary}</p>
                    <p
                      className={`mt-1 truncate text-[13px] ${r.viewerIsChatMember && r.viewerUnreadCount > 0 ? "font-medium text-gray-800" : "text-gray-500"}`}
                    >
                      {r.last_message_preview?.trim() || "메시지가 없습니다."}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-400">
                      <span>{r.active_member_count}명</span>
                      {r.last_message_at && (
                        <span>{new Date(r.last_message_at).toLocaleString("ko-KR")}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end justify-center gap-2 self-center">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                        r.viewerIsChatMember
                          ? "bg-gray-100 text-gray-700"
                          : "bg-emerald-600 text-white"
                      }`}
                    >
                      {actionLabel}
                    </span>
                    {r.viewerIsChatMember && r.viewerUnreadCount > 0 && (
                      <span className="min-w-[1.5rem] rounded-full bg-rose-500 px-2 py-1 text-center text-[11px] font-bold leading-none text-white">
                        {r.viewerUnreadCount > 99 ? "99+" : r.viewerUnreadCount}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        {!loading && !error && (sortedRooms.length === 0 || sortedRooms.length > 1) ? (
          <div className="mt-6 flex justify-center">
            <Link
              href={`${base}/new`}
              className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-md"
            >
              새 채팅방
            </Link>
          </div>
        ) : null}
      </div>
      {joinRoom ? (
        <MeetingOpenChatJoinDialog
          roomTitle={joinRoom.title}
          hasPassword={joinRoom.has_password}
          needsApprovalIntro={joinRoom.join_type === "approval" || joinRoom.join_type === "password_approval"}
          identityMode={joinRoom.identity_mode}
          joinAs={joinRoom.identity_mode === "realname" ? "realname" : joinAs}
          setJoinAs={setJoinAs}
          suggestedRealname={viewerSuggestedRealname}
          joinNick={joinNick}
          setJoinNick={setJoinNick}
          joinPw={joinPw}
          setJoinPw={setJoinPw}
          joinIntro={joinIntro}
          setJoinIntro={setJoinIntro}
          busy={joinBusy}
          error={formatJoinError(joinErr)}
          onClose={closeJoinModal}
          onJoin={() => void submitJoin()}
        />
      ) : null}
    </div>
  );
}
