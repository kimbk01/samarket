"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCommunityMessengerCall } from "@/lib/community-messenger/use-community-messenger-call";
import { useCommunityMessengerGroupCall } from "@/lib/community-messenger/use-community-messenger-group-call";
import { useCommunityMessengerRoomRealtime } from "@/lib/community-messenger/use-community-messenger-realtime";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerProfileLite,
  CommunityMessengerRoomSnapshot,
} from "@/lib/community-messenger/types";

export function CommunityMessengerRoomClient({
  roomId,
  initialCallAction,
  initialCallSessionId,
}: {
  roomId: string;
  initialCallAction?: string;
  initialCallSessionId?: string;
}) {
  const router = useRouter();
  const autoHandledSessionRef = useRef<string | null>(null);
  const [snapshot, setSnapshot] = useState<CommunityMessengerRoomSnapshot | null>(null);
  const [friends, setFriends] = useState<CommunityMessengerProfileLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [inviteIds, setInviteIds] = useState<string[]>([]);
  const [openGroupTitle, setOpenGroupTitle] = useState("");
  const [openGroupSummary, setOpenGroupSummary] = useState("");
  const [openGroupPassword, setOpenGroupPassword] = useState("");
  const [openGroupMemberLimit, setOpenGroupMemberLimit] = useState("200");
  const [openGroupDiscoverable, setOpenGroupDiscoverable] = useState(true);
  const [openGroupJoinPolicy, setOpenGroupJoinPolicy] = useState<"password" | "free">("password");
  const [openGroupIdentityPolicy, setOpenGroupIdentityPolicy] = useState<"real_name" | "alias_allowed">("alias_allowed");

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [roomRes, bootRes] = await Promise.all([
        fetch(`/api/community-messenger/rooms/${encodeURIComponent(roomId)}`, { cache: "no-store" }),
        fetch("/api/community-messenger/bootstrap", { cache: "no-store" }),
      ]);
      const roomJson = (await roomRes.json()) as (CommunityMessengerRoomSnapshot & { ok?: boolean }) | {
        ok?: boolean;
      };
      const bootJson = (await bootRes.json()) as (CommunityMessengerBootstrap & { ok?: boolean }) | {
        ok?: boolean;
      };
      setSnapshot(roomRes.ok && roomJson.ok ? (roomJson as CommunityMessengerRoomSnapshot) : null);
      setFriends(bootRes.ok && bootJson.ok ? ((bootJson as CommunityMessengerBootstrap).friends ?? []) : []);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useCommunityMessengerRoomRealtime({
    roomId,
    enabled: !loading,
    onRefresh: () => {
      void refresh(true);
    },
  });

  const inviteCandidates = useMemo(() => {
    const memberIds = new Set((snapshot?.members ?? []).map((member) => member.id));
    return friends.filter((friend) => !memberIds.has(friend.id));
  }, [friends, snapshot?.members]);

  const directCall = useCommunityMessengerCall({
    roomId,
    roomType:
      snapshot?.room.roomType === "private_group" || snapshot?.room.roomType === "open_group" ? "group" : "direct",
    viewerUserId: snapshot?.viewerUserId ?? "",
    peerUserId: snapshot?.activeCall?.peerUserId ?? snapshot?.room.peerUserId ?? null,
    peerLabel: snapshot?.activeCall?.peerLabel ?? snapshot?.room.title ?? "상대",
    activeCall: snapshot?.activeCall ?? null,
    onRefresh: refresh,
  });
  const groupCall = useCommunityMessengerGroupCall({
    enabled: snapshot?.room.roomType === "private_group" || snapshot?.room.roomType === "open_group",
    roomId,
    viewerUserId: snapshot?.viewerUserId ?? "",
    roomLabel: snapshot?.room.title ?? "그룹 통화",
    activeCall: snapshot?.activeCall ?? null,
    onRefresh: refresh,
  });
  const call =
    snapshot?.room.roomType === "private_group" || snapshot?.room.roomType === "open_group" ? groupCall : directCall;
  const roomUnavailable = snapshot ? snapshot.room.roomStatus !== "active" || snapshot.room.isReadonly : true;
  const isGroupRoom = snapshot ? snapshot.room.roomType !== "direct" : false;
  const isPrivateGroupRoom = snapshot?.room.roomType === "private_group";
  const isOpenGroupRoom = snapshot?.room.roomType === "open_group";
  const isOwner = snapshot?.myRole === "owner";
  const roomTypeLabel = isOpenGroupRoom ? "공개 그룹" : isPrivateGroupRoom ? "비공개 그룹" : "1:1 대화";

  const getRoomActionErrorMessage = useCallback((error?: string) => {
    switch (error) {
      case "room_not_found":
        return "채팅방을 찾을 수 없습니다.";
      case "content_required":
        return "메시지를 입력해 주세요.";
      case "room_blocked":
        return "관리자에 의해 차단된 방입니다.";
      case "room_archived":
        return "보관된 방이라 새 메시지를 보낼 수 없습니다.";
      case "room_readonly":
        return "읽기 전용 방이라 메시지를 보낼 수 없습니다.";
      case "friend_required":
        return "그룹 초대는 친구 관계에서만 가능합니다.";
      case "not_group_room":
        return "그룹방에서만 멤버를 초대할 수 있습니다.";
      case "not_open_group_room":
        return "공개 그룹방에서만 사용할 수 있는 기능입니다.";
      case "password_required":
        return "비밀번호를 입력해 주세요.";
      case "alias_name_required":
        return "별칭 닉네임을 입력해 주세요.";
      case "invalid_password":
        return "비밀번호가 맞지 않습니다.";
      case "room_full":
        return "정원이 가득 찬 방입니다.";
      case "owner_cannot_leave":
        return "방장은 이 방을 바로 나갈 수 없습니다.";
      case "room_unavailable":
        return "현재 이 방에서는 초대 또는 통화를 진행할 수 없습니다.";
      case "forbidden":
        return "이 작업을 수행할 권한이 없습니다.";
      case "messenger_storage_unavailable":
        return "메신저 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";
      case "messenger_migration_required":
        return "메신저 저장소 마이그레이션이 아직 반영되지 않았습니다. DB 스키마를 먼저 업데이트해 주세요.";
      default:
        return "메신저 작업을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    }
  }, []);

  useEffect(() => {
    if (!snapshot || !isOpenGroupRoom) return;
    setOpenGroupTitle(snapshot.room.title);
    setOpenGroupSummary(snapshot.room.summary ?? "");
    setOpenGroupPassword("");
    setOpenGroupMemberLimit(String(snapshot.room.memberLimit ?? 200));
    setOpenGroupDiscoverable(snapshot.room.isDiscoverable);
    setOpenGroupJoinPolicy(snapshot.room.joinPolicy === "free" ? "free" : "password");
    setOpenGroupIdentityPolicy(snapshot.room.identityPolicy === "real_name" ? "real_name" : "alias_allowed");
  }, [isOpenGroupRoom, snapshot]);

  const saveOpenGroupSettings = useCallback(async () => {
    if (!isOpenGroupRoom || !snapshot) return;
    setBusy("open-group-settings");
    try {
      const res = await fetch(`/api/community-messenger/rooms/${encodeURIComponent(roomId)}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: openGroupTitle,
          summary: openGroupSummary,
          password: openGroupPassword,
          memberLimit: Number(openGroupMemberLimit || "200"),
          isDiscoverable: openGroupDiscoverable,
          joinPolicy: openGroupJoinPolicy,
          identityPolicy: openGroupIdentityPolicy,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        alert(getRoomActionErrorMessage(json.error));
        return;
      }
      setOpenGroupPassword("");
      await refresh();
    } finally {
      setBusy(null);
    }
  }, [
    getRoomActionErrorMessage,
    isOpenGroupRoom,
    openGroupDiscoverable,
    openGroupIdentityPolicy,
    openGroupJoinPolicy,
    openGroupMemberLimit,
    openGroupPassword,
    openGroupSummary,
    openGroupTitle,
    refresh,
    roomId,
    snapshot,
  ]);

  const leaveRoom = useCallback(async () => {
    if (!window.confirm("이 그룹방에서 나가시겠습니까?")) return;
    setBusy("leave-room");
    try {
      const res = await fetch(`/api/community-messenger/rooms/${encodeURIComponent(roomId)}/leave`, {
        method: "POST",
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        alert(getRoomActionErrorMessage(json.error));
        return;
      }
      router.replace("/community-messenger?tab=groups");
    } finally {
      setBusy(null);
    }
  }, [getRoomActionErrorMessage, roomId, router]);

  const sendMessage = useCallback(async () => {
    const content = message.trim();
    if (!content) return;
    setBusy("send");
    try {
      const res = await fetch(`/api/community-messenger/rooms/${encodeURIComponent(roomId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        alert(getRoomActionErrorMessage(json.error));
        return;
      }
      setMessage("");
      await refresh();
    } finally {
      setBusy(null);
    }
  }, [getRoomActionErrorMessage, message, refresh, roomId]);

  const inviteMembers = useCallback(async () => {
    if (inviteIds.length === 0) return;
    setBusy("invite");
    try {
      const res = await fetch(`/api/community-messenger/rooms/${encodeURIComponent(roomId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "invite", memberIds: inviteIds }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        alert(getRoomActionErrorMessage(json.error));
        return;
      }
      setInviteIds([]);
      await refresh();
    } finally {
      setBusy(null);
    }
  }, [getRoomActionErrorMessage, inviteIds, refresh, roomId]);

  const reportTarget = useCallback(
    async (input: { reportType: "room" | "message" | "user"; messageId?: string; reportedUserId?: string }) => {
      const reasonDetail = window.prompt("신고 사유를 입력해 주세요.");
      if (!reasonDetail || !reasonDetail.trim()) return;
      const res = await fetch("/api/community-messenger/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportType: input.reportType,
          roomId,
          messageId: input.messageId,
          reportedUserId: input.reportedUserId,
          reasonType: "etc",
          reasonDetail: reasonDetail.trim(),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        alert(json.error ?? "신고 접수에 실패했습니다.");
        return;
      }
      alert("신고가 접수되었습니다.");
    },
    [roomId]
  );

  useEffect(() => {
    const activeCall = snapshot?.activeCall;
    if (!activeCall) return;
    if (initialCallAction !== "accept") return;
    if (initialCallSessionId && activeCall.id !== initialCallSessionId) return;
    if (autoHandledSessionRef.current === activeCall.id) return;
    if (activeCall.isMineInitiator) return;
    const shouldAutoAccept =
      activeCall.sessionMode === "group"
        ? (activeCall.status === "ringing" || activeCall.status === "active") &&
          activeCall.participants.some((participant) => participant.isMe && participant.status === "invited")
        : activeCall.status === "ringing";
    if (!shouldAutoAccept) return;
    autoHandledSessionRef.current = activeCall.id;
    void call.acceptIncomingCall().finally(() => {
      router.replace(`/community-messenger/rooms/${encodeURIComponent(roomId)}`);
    });
  }, [call, initialCallAction, initialCallSessionId, roomId, router, snapshot?.activeCall]);

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4 text-[14px] text-gray-500">
        채팅방을 불러오는 중입니다.
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-[16px] font-semibold text-gray-900">채팅방을 찾을 수 없습니다.</p>
        <button
          type="button"
          onClick={() => router.replace("/community-messenger?tab=chats")}
          className="rounded-xl bg-[#06C755] px-4 py-3 text-[14px] font-semibold text-white"
        >
          메신저 홈으로
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-[100svh] min-h-[100svh] flex-col overflow-hidden bg-[#F4F6F8] supports-[height:100dvh]:h-[100dvh] supports-[height:100dvh]:min-h-[100dvh]">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => router.replace(`/community-messenger?tab=${isGroupRoom ? "groups" : "chats"}`)}
              className="mb-2 rounded-full bg-gray-100 px-3 py-1.5 text-[12px] font-medium text-gray-600"
            >
              이전으로
            </button>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#06C755]/10 px-2.5 py-1 text-[11px] font-semibold text-[#06C755]">
                SAMarket 메신저
              </span>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-700">
                {roomTypeLabel}
              </span>
              {isOpenGroupRoom ? (
                <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                  {snapshot.room.identityPolicy === "alias_allowed" ? "별칭 허용" : "실명 기반"}
                </span>
              ) : null}
            </div>
            <h1 className="truncate text-[18px] font-semibold text-gray-900">{snapshot.room.title}</h1>
            <p className="mt-1 truncate text-[12px] text-gray-500">
              {snapshot.room.description || (isGroupRoom ? `${snapshot.room.memberCount}명 참여 중인 대화방` : "친구와 나누는 대화")}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void call.openPreview("video")}
              disabled={roomUnavailable}
              className="rounded-full bg-[#06C755] px-3 py-2 text-[12px] font-semibold text-white shadow-sm disabled:opacity-40"
            >
              영상 통화
            </button>
            <button
              type="button"
              onClick={() => void call.openPreview("voice")}
              disabled={roomUnavailable}
              className="rounded-full bg-white px-3 py-2 text-[12px] font-semibold text-gray-800 shadow-sm ring-1 ring-gray-200 disabled:opacity-40"
            >
              음성
            </button>
            <button
              type="button"
              onClick={() => void reportTarget({ reportType: "room" })}
              className="rounded-full bg-white px-3 py-2 text-[12px] font-semibold text-red-600 shadow-sm ring-1 ring-red-200"
            >
              신고
            </button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-b border-gray-200 bg-white px-4 py-3">
          {snapshot.room.roomStatus !== "active" || snapshot.room.isReadonly ? (
            <div className="mb-3 rounded-2xl bg-amber-50 px-3 py-3 text-[13px] text-amber-800">
              {snapshot.room.roomStatus === "blocked"
                ? "이 방은 관리자에 의해 차단되었습니다."
                : snapshot.room.roomStatus === "archived"
                  ? "이 방은 관리자에 의해 보관되었습니다."
                  : "이 방은 현재 제한 상태입니다."}
              {snapshot.room.isReadonly ? " 현재 읽기 전용 상태입니다." : ""}
            </div>
          ) : null}
          {call.errorMessage ? (
            <div className="mb-3 rounded-2xl bg-red-50 px-3 py-3 text-[13px] text-red-700">{call.errorMessage}</div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {isOpenGroupRoom ? (
              <>
                <span className="rounded-full bg-sky-50 px-3 py-1 text-[12px] font-medium text-sky-700">
                  {snapshot.room.joinPolicy === "password" ? "비밀번호 입장" : "자유 입장"}
                </span>
                <span className="rounded-full bg-violet-50 px-3 py-1 text-[12px] font-medium text-violet-700">
                  {snapshot.room.identityPolicy === "alias_allowed" ? "이 방은 별칭 참여 허용" : "이 방은 실명 기반"}
                </span>
                {snapshot.room.myIdentityMode ? (
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-[12px] font-medium text-gray-700">
                    내 표시 방식 {snapshot.room.myIdentityMode === "alias" ? "별칭" : "실명"}
                  </span>
                ) : null}
              </>
            ) : null}
            {snapshot.members.map((member) => (
              <span
                key={member.id}
                className="rounded-full bg-gray-100 px-3 py-1 text-[12px] font-medium text-gray-700"
              >
                {member.label}
              </span>
            ))}
          </div>

          {isPrivateGroupRoom ? (
            <div className="mt-3 rounded-2xl bg-[#F8FAF9] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[13px] font-semibold text-gray-900">멤버 초대</p>
                  <p className="mt-1 text-[12px] text-gray-500">친구 목록에서 그룹방에 새 멤버를 초대합니다.</p>
                </div>
                <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-gray-600">
                  내 역할 {snapshot.myRole}
                </span>
              </div>
              <div className="mt-3 grid gap-2">
                {inviteCandidates.length ? (
                  inviteCandidates.map((friend) => (
                    <label
                      key={friend.id}
                      className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-3"
                    >
                      <div>
                        <p className="text-[13px] font-semibold text-gray-900">{friend.label}</p>
                        <p className="text-[12px] text-gray-500">{friend.subtitle ?? "친구"}</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={inviteIds.includes(friend.id)}
                        onChange={(e) => {
                          setInviteIds((prev) =>
                            e.target.checked ? [...prev, friend.id] : prev.filter((id) => id !== friend.id)
                          );
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-[#06C755] focus:ring-[#06C755]"
                      />
                    </label>
                  ))
                ) : (
                  <p className="text-[12px] text-gray-500">초대 가능한 친구가 없습니다.</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => void inviteMembers()}
                disabled={inviteIds.length === 0 || busy === "invite"}
                className="mt-3 rounded-xl bg-[#06C755] px-4 py-3 text-[13px] font-semibold text-white disabled:opacity-40"
              >
                선택한 친구 초대
              </button>
            </div>
          ) : null}

          {isOpenGroupRoom ? (
            <div className="mt-3 rounded-2xl bg-[#F8FAF9] p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[13px] font-semibold text-gray-900">공개 그룹 정보</p>
                  <p className="mt-1 text-[12px] text-gray-500">
                    방장 {snapshot.room.ownerLabel} · 현재 {snapshot.room.memberCount}명
                    {snapshot.room.memberLimit ? ` / 최대 ${snapshot.room.memberLimit}명` : ""}
                  </p>
                </div>
                <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-gray-600">
                  {isOwner ? "방장" : `내 역할 ${snapshot.myRole}`}
                </span>
              </div>

              {isOwner ? (
                <div className="mt-3 grid gap-3">
                  <input
                    value={openGroupTitle}
                    onChange={(e) => setOpenGroupTitle(e.target.value)}
                    placeholder="방 제목"
                    className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-[14px] outline-none focus:border-[#06C755]"
                  />
                  <textarea
                    value={openGroupSummary}
                    onChange={(e) => setOpenGroupSummary(e.target.value)}
                    rows={3}
                    placeholder="방 소개"
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-[14px] outline-none focus:border-[#06C755]"
                  />
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="grid grid-cols-2 gap-2 rounded-xl border border-gray-200 bg-white p-2">
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
                    <input
                      value={openGroupMemberLimit}
                      onChange={(e) => setOpenGroupMemberLimit(e.target.value.replace(/[^0-9]/g, ""))}
                      placeholder="최대 인원"
                      className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-[14px] outline-none focus:border-[#06C755]"
                    />
                  </div>
                  {openGroupJoinPolicy === "password" ? (
                    <input
                      value={openGroupPassword}
                      onChange={(e) => setOpenGroupPassword(e.target.value)}
                      placeholder="새 비밀번호"
                      className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-[14px] outline-none focus:border-[#06C755]"
                    />
                  ) : null}
                  <div className="grid grid-cols-2 gap-2 rounded-xl border border-gray-200 bg-white p-2">
                    <button
                      type="button"
                      onClick={() => setOpenGroupIdentityPolicy("real_name")}
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
                  <label className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-3">
                    <div>
                      <p className="text-[13px] font-semibold text-gray-900">공개 목록 노출</p>
                      <p className="mt-1 text-[12px] text-gray-500">OFF면 새 참여자는 검색으로 찾을 수 없습니다.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={openGroupDiscoverable}
                      onChange={(e) => setOpenGroupDiscoverable(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-[#06C755] focus:ring-[#06C755]"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void saveOpenGroupSettings()}
                    disabled={busy === "open-group-settings" || !openGroupTitle.trim()}
                    className="rounded-xl bg-[#111827] px-4 py-3 text-[13px] font-semibold text-white disabled:opacity-40"
                  >
                    {busy === "open-group-settings" ? "설정 저장 중..." : "방 설정 저장"}
                  </button>
                </div>
              ) : (
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void leaveRoom()}
                    disabled={busy === "leave-room"}
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700 disabled:opacity-40"
                  >
                    {busy === "leave-room" ? "나가는 중..." : "그룹방 나가기"}
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <main className="space-y-3 px-4 py-4 pb-6">
          {snapshot.messages.length ? (
            snapshot.messages.map((item) => (
              <div
                key={item.id}
                className={`flex ${item.isMine ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[78%] ${item.isMine ? "items-end" : "items-start"} flex flex-col gap-1`}>
                  <span className="text-[11px] text-gray-400">{item.senderLabel}</span>
                  <div
                    className={`rounded-2xl px-4 py-3 text-[14px] leading-5 shadow-sm ${
                      item.messageType === "call_stub"
                        ? "bg-[#EEF9F2] text-[#15803D]"
                        : item.isMine
                          ? "bg-[#06C755] text-white"
                          : "bg-white text-gray-900"
                    }`}
                  >
                    {item.messageType === "call_stub" ? (
                      <div>
                        <p className="font-semibold">
                          {item.callKind === "video" ? "영상 통화" : "음성 통화"}
                        </p>
                        <p className="mt-1 text-[12px]">{item.callStatus ?? "상태 없음"}</p>
                      </div>
                    ) : (
                      item.content
                    )}
                  </div>
                  {!item.isMine && item.messageType !== "system" ? (
                    <div className="flex gap-2 text-[11px] text-gray-400">
                      <button
                        type="button"
                        onClick={() =>
                          void reportTarget({
                            reportType: "message",
                            messageId: item.id,
                            reportedUserId: item.senderId ?? undefined,
                          })
                        }
                        className="hover:text-red-600"
                      >
                        메시지 신고
                      </button>
                      {item.senderId ? (
                        <button
                          type="button"
                          onClick={() =>
                            void reportTarget({
                              reportType: "user",
                              reportedUserId: item.senderId ?? undefined,
                            })
                          }
                          className="hover:text-red-600"
                        >
                          사용자 신고
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  <span className="text-[11px] text-gray-400">{formatTime(item.createdAt)}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl bg-white px-4 py-8 text-center text-[13px] text-gray-500 shadow-sm">
              첫 메시지를 보내서 대화를 시작해 보세요.
            </div>
          )}
        </main>
      </div>

      <footer className="shrink-0 border-t border-gray-200 bg-white px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
        <div className="flex items-end gap-2">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={1}
            disabled={roomUnavailable}
            placeholder={
              roomUnavailable
                ? snapshot.room.isReadonly
                  ? "읽기 전용 방입니다"
                  : snapshot.room.roomStatus === "blocked"
                    ? "차단된 방입니다"
                    : "보관된 방입니다"
                : "메시지를 입력하세요"
            }
            className="max-h-28 min-h-[44px] flex-1 resize-none rounded-2xl border border-gray-200 px-4 py-3 text-[14px] outline-none focus:border-[#06C755] disabled:bg-gray-100 disabled:text-gray-500"
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={roomUnavailable || !message.trim() || busy === "send"}
            className="rounded-2xl bg-[#06C755] px-4 py-3 text-[14px] font-semibold text-white disabled:opacity-40"
          >
            전송
          </button>
        </div>
      </footer>

      {call.panel ? (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 px-4 pb-6">
          <div className="w-full max-w-[440px] rounded-[28px] bg-white p-5 shadow-2xl">
            <p className="text-[13px] font-medium text-[#06C755]">
              {call.panel.kind === "video" ? "영상 통화" : "음성 통화"} 실연결
            </p>
            <h2 className="mt-1 text-[20px] font-semibold text-gray-900">{call.panel.peerLabel}</h2>
            <p className="mt-2 text-[13px] leading-5 text-gray-500">
              {isGroupRoom
                ? "그룹 메신저 방에서 최대 4인 메쉬 WebRTC 연결을 시도합니다. 마이크 및 카메라 권한이 필요할 수 있습니다."
                : "1:1 메신저 방에서 실제 WebRTC 연결을 시도합니다. 마이크 및 카메라 권한이 필요할 수 있습니다."}
            </p>

            <div className="mt-5 rounded-3xl bg-[#F4F6F8] px-4 py-8 text-center">
              {call.panel.kind === "video" ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="overflow-hidden rounded-3xl bg-black">
                    <video
                      ref={call.localVideoRef}
                      autoPlay
                      muted
                      playsInline
                      className="h-40 w-full bg-black object-cover"
                    />
                    <p className="px-3 py-2 text-[12px] font-medium text-white/85">내 화면</p>
                  </div>
                  {isGroupRoom ? (
                    groupCall.remotePeers.length ? (
                      groupCall.remotePeers.map((peer) => (
                        <div key={peer.userId} className="overflow-hidden rounded-3xl bg-black">
                          <video
                            ref={(node) => {
                              groupCall.bindRemoteVideo(peer.userId, node);
                            }}
                            autoPlay
                            playsInline
                            className="h-40 w-full bg-black object-cover"
                          />
                          <p className="px-3 py-2 text-[12px] font-medium text-white/85">{peer.label}</p>
                        </div>
                      ))
                    ) : (
                      <div className="flex items-center justify-center rounded-3xl bg-white text-[12px] text-gray-500">
                        참여자 연결 대기 중
                      </div>
                    )
                  ) : (
                    <div className="overflow-hidden rounded-3xl bg-black">
                      <video
                        ref={directCall.remoteVideoRef}
                        autoPlay
                        playsInline
                        className="h-40 w-full bg-black object-cover"
                      />
                      <p className="px-3 py-2 text-[12px] font-medium text-white/85">상대 화면</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#06C755] text-[26px] text-white">
                  AUD
                </div>
              )}
              <p className="mt-4 text-[18px] font-semibold text-gray-900">{call.panel.peerLabel}</p>
              <p className="mt-1 text-[13px] text-gray-500">{call.callStatusLabel}</p>
              {isGroupRoom && groupCall.participants.length ? (
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {groupCall.participants.map((participant) => (
                    <span
                      key={participant.userId}
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                        participant.status === "joined"
                          ? "bg-green-50 text-green-700"
                          : participant.status === "invited"
                            ? "bg-gray-100 text-gray-700"
                            : "bg-red-50 text-red-700"
                      }`}
                    >
                      {participant.label} · {formatParticipantStatus(participant.status)}
                    </span>
                  ))}
                </div>
              ) : null}
              {call.connectionBadge ? (
                <p
                  className={`mt-2 inline-flex rounded-full px-3 py-1 text-[12px] font-semibold ${
                    call.connectionBadge.tone === "good"
                      ? "bg-green-50 text-green-700"
                      : call.connectionBadge.tone === "poor"
                        ? "bg-red-50 text-red-700"
                        : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {call.connectionBadge.label}
                </p>
              ) : null}
              {call.panel.mode === "active" ? (
                <p className="mt-1 text-[12px] font-medium text-[#06C755]">{formatDuration(call.elapsedSeconds)}</p>
              ) : null}
            </div>

            <div className="mt-5 flex gap-2">
              {call.panel.mode === "preview" ? (
                <>
                  <button
                    type="button"
                    onClick={() => void call.startCall()}
                    disabled={call.busy === "call-start"}
                    className="flex-1 rounded-2xl bg-[#06C755] px-4 py-3 text-[14px] font-semibold text-white"
                  >
                    통화 시작
                  </button>
                  <button
                    type="button"
                    onClick={call.closePreview}
                    className="rounded-2xl border border-gray-200 px-4 py-3 text-[14px] text-gray-700"
                  >
                    닫기
                  </button>
                </>
              ) : call.panel.mode === "incoming" ? (
                <>
                  <button
                    type="button"
                    onClick={() => void call.rejectIncomingCall()}
                    disabled={call.busy === "call-reject"}
                    className="rounded-2xl border border-gray-200 px-4 py-3 text-[14px] text-gray-700"
                  >
                    거절
                  </button>
                  <button
                    type="button"
                    onClick={() => void call.acceptIncomingCall()}
                    disabled={call.busy === "call-accept"}
                    className="flex-1 rounded-2xl bg-[#06C755] px-4 py-3 text-[14px] font-semibold text-white"
                  >
                    수락
                  </button>
                </>
              ) : call.panel.mode === "outgoing" ? (
                <>
                  <button
                    type="button"
                    onClick={() => void call.cancelOutgoingCall()}
                    disabled={call.busy === "call-cancel"}
                    className="flex-1 rounded-2xl bg-red-50 px-4 py-3 text-[14px] font-semibold text-red-700"
                  >
                    호출 취소
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void call.endActiveCall()}
                    disabled={call.busy === "call-end"}
                    className="flex-1 rounded-2xl bg-[#111827] px-4 py-3 text-[14px] font-semibold text-white"
                  >
                    통화 종료
                  </button>
                  {call.connectionBadge?.tone === "poor" ? (
                    <button
                      type="button"
                      onClick={() => void call.retryConnection()}
                      disabled={call.busy === "call-retry"}
                      className="rounded-2xl border border-gray-200 px-4 py-3 text-[14px] font-medium text-gray-700"
                    >
                      다시 연결
                    </button>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatDuration(value: number): string {
  const total = Math.max(0, Math.floor(value));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatParticipantStatus(value: "invited" | "joined" | "left" | "rejected"): string {
  if (value === "joined") return "참여 중";
  if (value === "invited") return "대기";
  if (value === "rejected") return "거절";
  return "종료";
}
