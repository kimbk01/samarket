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
    roomType: snapshot?.room.roomType ?? "direct",
    viewerUserId: snapshot?.viewerUserId ?? "",
    peerUserId: snapshot?.activeCall?.peerUserId ?? snapshot?.room.peerUserId ?? null,
    peerLabel: snapshot?.activeCall?.peerLabel ?? snapshot?.room.title ?? "상대",
    activeCall: snapshot?.activeCall ?? null,
    onRefresh: refresh,
  });
  const groupCall = useCommunityMessengerGroupCall({
    enabled: snapshot?.room.roomType === "group",
    roomId,
    viewerUserId: snapshot?.viewerUserId ?? "",
    roomLabel: snapshot?.room.title ?? "그룹 통화",
    activeCall: snapshot?.activeCall ?? null,
    onRefresh: refresh,
  });
  const call = snapshot?.room.roomType === "group" ? groupCall : directCall;
  const roomUnavailable = snapshot ? snapshot.room.roomStatus !== "active" || snapshot.room.isReadonly : true;

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
        alert(
          json.error === "room_blocked"
            ? "관리자에 의해 차단된 방입니다."
            : json.error === "room_archived"
              ? "보관된 방이라 새 메시지를 보낼 수 없습니다."
              : json.error === "room_readonly"
                ? "읽기 전용 방이라 메시지를 보낼 수 없습니다."
                : "메시지 전송에 실패했습니다."
        );
        return;
      }
      setMessage("");
      await refresh();
    } finally {
      setBusy(null);
    }
  }, [message, refresh, roomId]);

  const inviteMembers = useCallback(async () => {
    if (inviteIds.length === 0) return;
    setBusy("invite");
    try {
      await fetch(`/api/community-messenger/rooms/${encodeURIComponent(roomId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "invite", memberIds: inviteIds }),
      });
      setInviteIds([]);
      await refresh();
    } finally {
      setBusy(null);
    }
  }, [inviteIds, refresh, roomId]);

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
    <div className="flex min-h-[100dvh] flex-col bg-[#F4F6F8]">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => router.replace(`/community-messenger?tab=${snapshot.room.roomType === "group" ? "groups" : "chats"}`)}
              className="mb-2 text-[12px] text-gray-500"
            >
              이전으로
            </button>
            <h1 className="truncate text-[18px] font-semibold text-gray-900">{snapshot.room.title}</h1>
            <p className="mt-1 truncate text-[12px] text-gray-500">{snapshot.room.description}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void reportTarget({ reportType: "room" })}
              className="rounded-full bg-white px-3 py-2 text-[12px] font-semibold text-red-600 shadow-sm ring-1 ring-red-200"
            >
              신고
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
              onClick={() => void call.openPreview("video")}
              disabled={roomUnavailable}
              className="rounded-full bg-[#06C755] px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-40"
            >
              영상
            </button>
          </div>
        </div>
      </header>

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
          {snapshot.members.map((member) => (
            <span
              key={member.id}
              className="rounded-full bg-gray-100 px-3 py-1 text-[12px] font-medium text-gray-700"
            >
              {member.label}
            </span>
          ))}
        </div>

        {snapshot.room.roomType === "group" ? (
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
      </div>

      <main className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
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

      <footer className="sticky bottom-0 border-t border-gray-200 bg-white px-4 py-3">
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
              {snapshot.room.roomType === "group"
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
                  {snapshot.room.roomType === "group" ? (
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
              {snapshot.room.roomType === "group" && groupCall.participants.length ? (
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
