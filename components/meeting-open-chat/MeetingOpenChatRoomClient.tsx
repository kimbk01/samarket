"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { MeetingPasswordOnlyModal } from "@/components/community/MeetingPasswordOnlyModal";
import { MeetingOpenChatJoinDialog } from "@/components/meeting-open-chat/MeetingOpenChatJoinDialog";
import { LineOpenChatHeader } from "@/components/meeting-open-chat/line/LineOpenChatHeader";
import { LineOpenChatParticipantSheet } from "@/components/meeting-open-chat/sheets/LineOpenChatParticipantSheet";
import { LineOpenChatMemberProfileSheet } from "@/components/meeting-open-chat/sheets/LineOpenChatMemberProfileSheet";
import {
  LineOpenChatOperatorMenuSheet,
  LineOpenChatPinnedNotices,
} from "@/components/meeting-open-chat/sheets/LineOpenChatOperatorMenuSheet";
import { LineOpenChatSearchSheet } from "@/components/meeting-open-chat/sheets/LineOpenChatSearchSheet";
import { LineOpenChatMessageActionSheet } from "@/components/meeting-open-chat/sheets/LineOpenChatMessageActionSheet";
import { meetingOpenChatRoleCanManage } from "@/lib/meeting-open-chat/permissions";
import { playLoudOpenChatPing } from "@/lib/meeting-open-chat/play-open-chat-ping";
import { BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { philifeAppPaths } from "@/lib/philife/paths";
import type {
  MeetingOpenChatMemberRole,
  MeetingOpenChatMessagePublic,
  MeetingOpenChatNoticePublic,
  MeetingOpenChatParticipantPublic,
  MeetingOpenChatRoomPublic,
} from "@/lib/meeting-open-chat/types";

type ChatMemberMe = {
  memberId: string;
  role: string;
  openNickname: string;
  openProfileImageUrl: string | null;
};

type ReplyTarget = { id: string; nickname: string; preview: string };

type MessageActionContext = {
  messageId: string;
  nickname: string;
  preview: string;
  plainText: string;
  canBlind: boolean;
};

function formatLineChatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("ko-KR", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
}

const LOUD_SOUND_STORAGE_KEY = "samarket.moc.loudSound";

function readLoudSoundPreference(): boolean {
  if (typeof window === "undefined") return true;
  const v = window.localStorage.getItem(LOUD_SOUND_STORAGE_KEY);
  if (v === "0" || v === "false") return false;
  return true;
}

function formatMeetingOpenJoinError(code: string | null): string | null {
  if (!code) return null;
  switch (code) {
    case "invalid_password":
      return "비밀번호가 올바르지 않습니다.";
    case "open_nickname_required":
      return "채팅 닉네임을 입력해 주세요.";
    case "open_nickname_taken":
      return "이 닉네임은 이미 사용 중입니다. 다른 닉네임을 입력해 주세요.";
    case "banned":
      return "이 방에 참여할 수 없습니다.";
    case "room_not_active":
      return "비활성화된 방입니다.";
    case "full":
      return "인원이 가득 찼습니다.";
    case "join_type_not_implemented":
      return "아직 지원하지 않는 입장 방식입니다.";
    default:
      return code.length < 100 ? code : "입장에 실패했습니다.";
  }
}

function openChatMessagePreviewLine(m: MeetingOpenChatMessagePublic): string {
  if (m.attachments?.some((a) => a.fileType === "image")) {
    const t = m.content.trim();
    return t ? `[사진] ${t}` : "[사진]";
  }
  const t = m.content.trim();
  if (t) return t.length > 100 ? `${t.slice(0, 100)}…` : t;
  return "(내용 없음)";
}

export function MeetingOpenChatRoomClient({
  meetingId,
  roomId,
}: {
  meetingId: string;
  roomId: string;
}) {
  const router = useRouter();
  const [room, setRoom] = useState<MeetingOpenChatRoomPublic | null>(null);
  const [chatMember, setChatMember] = useState<ChatMemberMe | null>(null);
  const [messages, setMessages] = useState<MeetingOpenChatMessagePublic[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const nearBottomRef = useRef(true);
  const messagesRef = useRef<MeetingOpenChatMessagePublic[]>([]);
  const lastReadAckRef = useRef<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);

  const [joinNick, setJoinNick] = useState("");
  const [joinPw, setJoinPw] = useState("");
  const [joinIntro, setJoinIntro] = useState("");
  const [joinErr, setJoinErr] = useState<string | null>(null);
  const [viewerSuggestedOpenNickname, setViewerSuggestedOpenNickname] = useState<string | null>(null);
  const [useFullJoinDialog, setUseFullJoinDialog] = useState(false);
  const lastPwdAttemptRef = useRef("");

  const apiRoom = `/api/community/meetings/${encodeURIComponent(meetingId)}/meeting-open-chat/rooms/${encodeURIComponent(roomId)}`;
  const apiMessages = `${apiRoom}/messages`;
  const apiJoin = `${apiRoom}/join`;
  const apiMembers = `${apiRoom}/members`;
  const apiNotices = `${apiRoom}/notices`;
  const apiUploadImage = `${apiRoom}/upload-image`;
  const apiRead = `${apiRoom}/read`;
  const apiLeave = `${apiRoom}/leave`;

  const [notices, setNotices] = useState<MeetingOpenChatNoticePublic[]>([]);
  const [loudSound, setLoudSound] = useState(true);
  const lastSeenMessageIdRef = useRef<string | null>(null);
  const [operatorOpen, setOperatorOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [participants, setParticipants] = useState<MeetingOpenChatParticipantPublic[]>([]);
  const [previewMemberId, setPreviewMemberId] = useState<string | null>(null);
  const [previewInitial, setPreviewInitial] = useState<MeetingOpenChatParticipantPublic | null>(null);
  const [viewerUnreadCount, setViewerUnreadCount] = useState(0);
  const [messageAction, setMessageAction] = useState<MessageActionContext | null>(null);
  const longPressTimerRef = useRef<number | null>(null);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const openMessageActionSheet = useCallback(
    (ctx: MessageActionContext) => {
      clearLongPressTimer();
      setMessageAction(ctx);
    },
    [clearLongPressTimer]
  );

  useEffect(() => () => clearLongPressTimer(), [clearLongPressTimer]);

  const loadRoom = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    if (!silent) setLoadErr(null);
    try {
      const res = await fetch(apiRoom, { credentials: "include" });
      const json = (await res.json()) as {
        ok?: boolean;
        room?: MeetingOpenChatRoomPublic;
        chatMember?: ChatMemberMe | null;
        viewerUnreadCount?: number;
        viewerSuggestedOpenNickname?: string | null;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.room) {
        if (!silent) setLoadErr(json.error ?? "방 정보를 불러오지 못했습니다.");
        return;
      }
      setRoom(json.room);
      setChatMember(json.chatMember ?? null);
      const sug = json.viewerSuggestedOpenNickname;
      setViewerSuggestedOpenNickname(
        typeof sug === "string" && sug.trim() ? sug.trim().slice(0, 40) : null
      );
      if (typeof json.viewerUnreadCount === "number") setViewerUnreadCount(json.viewerUnreadCount);
      if (!silent) setLoadErr(null);
    } catch {
      if (!silent) setLoadErr("네트워크 오류");
    }
  }, [apiRoom]);

  const requestMarkRead = useCallback(
    (messageId: string) => {
      if (!messageId || lastReadAckRef.current === messageId) return;
      lastReadAckRef.current = messageId;
      void fetch(apiRead, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
      })
        .then((res) => {
          if (!res.ok) lastReadAckRef.current = null;
          else void loadRoom({ silent: true });
        })
        .catch(() => {
          lastReadAckRef.current = null;
        });
    },
    [apiRead, loadRoom]
  );

  const loadMessages = useCallback(async () => {
    try {
      const res = await fetch(apiMessages, { credentials: "include" });
      const json = (await res.json()) as { ok?: boolean; messages?: MeetingOpenChatMessagePublic[] };
      if (res.ok && json.ok && json.messages) {
        const list = json.messages;
        messagesRef.current = list;
        setMessages(list);
        requestAnimationFrame(() => {
          const el = listRef.current;
          if (!el) return;
          if (nearBottomRef.current) {
            el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
            if (list.length > 0) {
              requestMarkRead(list[list.length - 1].id);
            }
          }
        });
      }
    } catch {
      /* ignore */
    }
  }, [apiMessages, requestMarkRead]);

  const onMessageListScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const threshold = 100;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    if (nearBottomRef.current) {
      const list = messagesRef.current;
      if (list.length > 0) {
        requestMarkRead(list[list.length - 1].id);
      }
    }
  }, [requestMarkRead]);

  useEffect(() => {
    void loadRoom();
  }, [loadRoom]);

  useEffect(() => {
    if (chatMember) {
      nearBottomRef.current = true;
      void loadMessages();
    }
  }, [chatMember, loadMessages]);

  useEffect(() => {
    setReplyTarget(null);
    lastReadAckRef.current = null;
    lastSeenMessageIdRef.current = null;
    setViewerUnreadCount(0);
    setJoinErr(null);
    setViewerSuggestedOpenNickname(null);
    setUseFullJoinDialog(false);
  }, [roomId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  /** 상대 새 메시지·강한 알림음 on: 백그라운드이거나 목록 하단이 아닐 때만 재생 */
  useEffect(() => {
    if (!chatMember) return;
    const list = messages;
    if (list.length === 0) return;
    const last = list[list.length - 1];
    if (last.message_type === "system") {
      lastSeenMessageIdRef.current = last.id;
      return;
    }
    const isMine = last.member_id != null && last.member_id === chatMember.memberId;
    const prev = lastSeenMessageIdRef.current;
    if (prev === null) {
      lastSeenMessageIdRef.current = last.id;
      return;
    }
    if (last.id !== prev && !isMine && loudSound) {
      if (
        typeof document !== "undefined" &&
        (document.visibilityState === "hidden" || !nearBottomRef.current)
      ) {
        playLoudOpenChatPing();
      }
    }
    lastSeenMessageIdRef.current = last.id;
  }, [messages, chatMember, loudSound]);

  const toggleLoudSound = useCallback(() => {
    setLoudSound((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LOUD_SOUND_STORAGE_KEY, next ? "1" : "0");
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!chatMember) return;
    const onVis = () => {
      if (typeof document === "undefined" || document.visibilityState !== "visible") return;
      if (!nearBottomRef.current) return;
      const list = messagesRef.current;
      if (list.length > 0) {
        requestMarkRead(list[list.length - 1].id);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [chatMember, requestMarkRead]);

  /** 메시지 + 안 읽음 배지: 한 번에, 탭 숨김 시 생략 (과도한 폴링으로 체감 느림 방지) */
  useEffect(() => {
    if (!chatMember) return;
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void loadMessages();
      void loadRoom({ silent: true });
    }, 20000);
    return () => window.clearInterval(id);
  }, [chatMember, loadMessages, loadRoom]);

  const loadParticipants = useCallback(async () => {
    setParticipantsLoading(true);
    try {
      const res = await fetch(apiMembers, { credentials: "include" });
      const json = (await res.json()) as {
        ok?: boolean;
        members?: MeetingOpenChatParticipantPublic[];
      };
      if (res.ok && json.ok && json.members) {
        setParticipants(json.members);
      } else {
        setParticipants([]);
      }
    } catch {
      setParticipants([]);
    } finally {
      setParticipantsLoading(false);
    }
  }, [apiMembers]);

  const openParticipantsSheet = useCallback(() => {
    setParticipantsOpen(true);
    void loadParticipants();
  }, [loadParticipants]);

  const loadNotices = useCallback(async () => {
    try {
      const res = await fetch(apiNotices, { credentials: "include" });
      const json = (await res.json()) as { ok?: boolean; notices?: MeetingOpenChatNoticePublic[] };
      if (res.ok && json.ok && json.notices) setNotices(json.notices);
      else setNotices([]);
    } catch {
      setNotices([]);
    }
  }, [apiNotices]);

  const refreshAll = useCallback(() => {
    void loadRoom();
    void loadMessages();
    void loadNotices();
  }, [loadRoom, loadMessages, loadNotices]);

  useEffect(() => {
    if (chatMember) void loadNotices();
  }, [chatMember, loadNotices]);

  const joinWith = async (opts: { openNickname: string; joinPassword?: string; introMessage?: string }) => {
    if (!room) return;
    setBusy(true);
    setJoinErr(null);
    try {
      const needsIntro = room.join_type === "approval" || room.join_type === "password_approval";
      const res = await fetch(apiJoin, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          openNickname: opts.openNickname.trim().slice(0, 40),
          joinPassword: room.has_password ? opts.joinPassword : undefined,
          introMessage: needsIntro ? opts.introMessage?.trim() || undefined : undefined,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        joined?: boolean;
        pendingApproval?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        const err = json.error ?? "join_failed";
        setJoinErr(err);
        if (err === "open_nickname_taken" && room.join_type === "password") {
          setUseFullJoinDialog(true);
          setJoinPw(lastPwdAttemptRef.current);
          setJoinNick("");
        }
        return;
      }
      if (json.pendingApproval) {
        setJoinErr(null);
        alert("입장 신청이 접수되었습니다. 운영자 승인을 기다려 주세요.");
        return;
      }
      await loadRoom();
    } finally {
      setBusy(false);
    }
  };

  const onJoinFromDialog = () => {
    lastPwdAttemptRef.current = joinPw;
    void joinWith({
      openNickname: joinNick,
      joinPassword: joinPw,
      introMessage: joinIntro,
    });
  };

  const onJoinFromPasswordModal = (password: string) => {
    lastPwdAttemptRef.current = password;
    const nickBase = (viewerSuggestedOpenNickname ?? "참가자").trim();
    const nick = (nickBase || "참가자").slice(0, 40);
    void joinWith({ openNickname: nick, joinPassword: password });
  };

  const onBlindMessage = async (messageId: string) => {
    const reason = window.prompt("블라인드 사유 (선택)", "") ?? "";
    if (!window.confirm("이 메시지를 블라인드할까요?")) return;
    setBusy(true);
    try {
      const res = await fetch(
        `${apiRoom}/messages/${encodeURIComponent(messageId)}/blind`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        }
      );
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        alert(json.error ?? "블라인드 처리에 실패했습니다.");
        return;
      }
      await loadMessages();
    } finally {
      setBusy(false);
    }
  };

  const onSend = async () => {
    const t = draft.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      const res = await fetch(apiMessages, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: t,
          replyToMessageId: replyTarget?.id ?? null,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setLoadErr(json.error ?? "전송 실패");
        return;
      }
      setDraft("");
      setReplyTarget(null);
      nearBottomRef.current = true;
      await loadMessages();
      setLoadErr(null);
    } finally {
      setBusy(false);
    }
  };

  const onPickImage = () => {
    imageInputRef.current?.click();
  };

  const onImageSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || busy) return;
    setBusy(true);
    setLoadErr(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const up = await fetch(apiUploadImage, { method: "POST", credentials: "include", body: form });
      const upJson = (await up.json()) as {
        ok?: boolean;
        url?: string;
        fileName?: string | null;
        fileSize?: number;
        error?: string;
      };
      if (!up.ok || !upJson.ok || !upJson.url) {
        alert(upJson.error ?? "이미지 업로드에 실패했습니다.");
        return;
      }
      const caption = draft.trim();
      const res = await fetch(apiMessages, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: caption,
          imageUrl: upJson.url,
          imageFileName: upJson.fileName ?? file.name,
          imageFileSize: upJson.fileSize ?? file.size,
          replyToMessageId: replyTarget?.id ?? null,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        alert(json.error ?? "사진 전송에 실패했습니다.");
        return;
      }
      setDraft("");
      setReplyTarget(null);
      nearBottomRef.current = true;
      await loadMessages();
    } finally {
      setBusy(false);
    }
  };

  const backHref = philifeAppPaths.meetingOpenChat(meetingId);

  const onLeaveRoom = async () => {
    if (!chatMember || busy) return;
    if (!window.confirm("이 채팅방을 나갈까요?")) return;
    setBusy(true);
    try {
      const res = await fetch(apiLeave, { method: "POST", credentials: "include" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        alert(json.error ?? "나가기에 실패했습니다.");
        return;
      }
      router.push(backHref);
    } finally {
      setBusy(false);
    }
  };

  if (loadErr && !room) {
    return (
      <div className="min-h-[40vh] bg-[#f7f7f7] p-4">
        <p className="text-center text-sm text-red-600">{loadErr}</p>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-[40vh] bg-[#f7f7f7] p-4">
        <p className="text-center text-sm text-gray-500">불러오는 중…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#e8e8e8]">
      <LineOpenChatHeader
        backHref={backHref}
        thumbnailUrl={room.thumbnail_url}
        title={room.title}
        participantCount={room.active_member_count}
        unreadBadgeCount={chatMember ? viewerUnreadCount : 0}
        onSearchClick={() => {
          if (!chatMember) {
            alert("방에 입장한 뒤 검색을 사용할 수 있습니다.");
            return;
          }
          setSearchOpen(true);
        }}
        onParticipantsClick={() => {
          if (chatMember) openParticipantsSheet();
        }}
        onMenuClick={() => {
          if (!chatMember) {
            alert("방에 입장한 뒤 메뉴를 사용할 수 있습니다.");
            return;
          }
          if (meetingOpenChatRoleCanManage((chatMember.role ?? "member") as MeetingOpenChatMemberRole)) {
            setOperatorOpen(true);
          } else {
            alert("운영 메뉴는 방장·부방장만 사용할 수 있습니다.");
          }
        }}
        {...(chatMember
          ? {
              loudSoundEnabled: loudSound,
              onLoudSoundToggle: toggleLoudSound,
              onLeaveClick: () => void onLeaveRoom(),
            }
          : {})}
      />

      {loadErr && (
        <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs text-amber-900">
          {loadErr}
        </div>
      )}

      {!chatMember ? (
        <>
          <div className="min-h-[30vh] flex-1 bg-[#ececec]/80" aria-hidden />
          {room.join_type === "password" && !useFullJoinDialog ? (
            <MeetingPasswordOnlyModal
              open
              onClose={() => router.push(backHref)}
              onSubmit={(pw) => onJoinFromPasswordModal(pw)}
              busy={busy}
              error={formatMeetingOpenJoinError(joinErr)}
              title="채팅방 비밀번호"
              hint="방장이 설정한 비밀번호를 입력하면 바로 입장합니다."
              submitLabel="입장하기"
            />
          ) : (
            <MeetingOpenChatJoinDialog
              roomTitle={room.title}
              hasPassword={room.has_password}
              needsApprovalIntro={room.join_type === "approval" || room.join_type === "password_approval"}
              joinNick={joinNick}
              setJoinNick={setJoinNick}
              joinPw={joinPw}
              setJoinPw={setJoinPw}
              joinIntro={joinIntro}
              setJoinIntro={setJoinIntro}
              busy={busy}
              error={formatMeetingOpenJoinError(joinErr)}
              onJoin={() => onJoinFromDialog()}
            />
          )}
        </>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col bg-[#bfe3f9]">
            <LineOpenChatPinnedNotices notices={notices} />
            <div
              ref={listRef}
              onScroll={onMessageListScroll}
              className="flex-1 space-y-2 overflow-y-auto px-2 py-2 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]"
            >
              {messages.map((m, idx) => {
                const canModerateMsg =
                  chatMember &&
                  meetingOpenChatRoleCanManage((chatMember.role ?? "member") as MeetingOpenChatMemberRole) &&
                  m.message_type !== "system";
                const parent =
                  m.reply_to_message_id && m.message_type !== "system"
                    ? messages.find((x) => x.id === m.reply_to_message_id)
                    : null;
                const isMine =
                  chatMember &&
                  m.message_type !== "system" &&
                  m.member_id != null &&
                  m.member_id === chatMember.memberId;

                if (m.message_type === "system") {
                  return (
                    <div key={m.id} className="px-3 py-1 text-center text-[12px] leading-relaxed text-gray-600/90">
                      {m.content}
                    </div>
                  );
                }

                const nickname = m.sender_open_nickname ?? "알 수 없음";
                const prev = idx > 0 ? messages[idx - 1] : null;
                const groupBreak =
                  prev?.message_type === "system" ||
                  prev == null ||
                  prev.member_id !== m.member_id ||
                  new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > 120000;
                const showAvatar = !isMine && groupBreak;
                const showNickname = showAvatar;
                const timeLabel = formatLineChatTime(m.created_at);

                const bubbleHandlers = {
                  onPointerDown: (e: React.PointerEvent) => {
                    if (e.button !== 0) return;
                    clearLongPressTimer();
                    longPressTimerRef.current = window.setTimeout(() => {
                      longPressTimerRef.current = null;
                      openMessageActionSheet({
                        messageId: m.id,
                        nickname,
                        preview: openChatMessagePreviewLine(m),
                        plainText: m.content ?? "",
                        canBlind: Boolean(canModerateMsg && !m.is_blinded),
                      });
                    }, 480);
                  },
                  onPointerUp: clearLongPressTimer,
                  onPointerCancel: clearLongPressTimer,
                  onContextMenu: (e: React.MouseEvent) => {
                    e.preventDefault();
                    openMessageActionSheet({
                      messageId: m.id,
                      nickname,
                      preview: openChatMessagePreviewLine(m),
                      plainText: m.content ?? "",
                      canBlind: Boolean(canModerateMsg && !m.is_blinded),
                    });
                  },
                };

                const replyQuote = m.reply_to_message_id ? (
                  <div
                    className={`mb-2 border-l-[3px] pl-2 text-[12px] leading-[1.35] ${
                      isMine
                        ? "border-[#5a8c3a] bg-black/[0.06] text-[#222]"
                        : "border-[#6cc655] bg-[#f5f5f5] text-[#333]"
                    } rounded-r py-1.5 pr-1`}
                  >
                    <span className="font-bold">{parent?.sender_open_nickname ?? "원본"}</span>
                    <p className="mt-0.5 line-clamp-2 opacity-90">
                      {parent ? openChatMessagePreviewLine(parent) : "원본 메시지를 불러올 수 없습니다."}
                    </p>
                  </div>
                ) : null;

                const imagesBlock =
                  m.attachments?.some((a) => a.fileType === "image") ? (
                    <div className={m.reply_to_message_id || m.content.trim() ? "mb-1.5 space-y-1" : "space-y-1"}>
                      {m.attachments
                        .filter((a) => a.fileType === "image")
                        .map((a) => (
                          <a
                            key={a.id}
                            href={a.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element -- 외부 스토리지 URL */}
                            <img
                              src={a.fileUrl}
                              alt=""
                              className="max-h-60 max-w-[min(100%,280px)] rounded-lg object-contain"
                              loading="lazy"
                              draggable={false}
                            />
                          </a>
                        ))}
                    </div>
                  ) : null;

                const bubbleBody = (
                  <div
                    className={`touch-manipulation select-none ${
                      isMine
                        ? "rounded-[18px] rounded-br-[5px] bg-[#A5E65A] px-3 py-2 text-[15px] leading-[1.42] text-[#111] shadow-[0_1px_0.5px_rgba(0,0,0,0.12)]"
                        : "rounded-[18px] rounded-bl-[5px] border border-[#d6d6d6] bg-white px-3 py-2 text-[15px] leading-[1.42] text-[#111] shadow-[0_1px_0.5px_rgba(0,0,0,0.08)]"
                    }`}
                    style={{ WebkitUserSelect: "none", userSelect: "none" }}
                    {...bubbleHandlers}
                  >
                    {replyQuote}
                    {imagesBlock}
                    {m.content.trim().length > 0 ? (
                      <div className="whitespace-pre-wrap break-words">{m.content}</div>
                    ) : null}
                  </div>
                );

                if (isMine) {
                  return (
                    <div key={m.id} className="flex w-full justify-end px-0.5">
                      <div className="flex max-w-[92%] items-end gap-1.5">
                        <span className="shrink-0 pb-0.5 text-[11px] leading-none text-gray-600 tabular-nums">
                          {timeLabel}
                        </span>
                        <div className="max-w-[min(100%,280px)] shrink-0">{bubbleBody}</div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={m.id} className="flex w-full justify-start px-0.5">
                    <div className="flex max-w-[94%] items-end gap-1">
                      <div className="w-9 shrink-0 self-end pb-0.5">
                        {showAvatar ? (
                          <div
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#9ca3af] text-[13px] font-bold text-white"
                            aria-hidden
                          >
                            {(nickname || "?").charAt(0)}
                          </div>
                        ) : (
                          <div className="h-9 w-9" aria-hidden />
                        )}
                      </div>
                      <div className="flex min-w-0 flex-col">
                        {showNickname ? (
                          <div className="mb-0.5 max-w-[220px] truncate pl-0.5 text-[12px] font-bold text-[#333]">
                            {nickname}
                          </div>
                        ) : null}
                        <div className="flex items-end gap-1.5">
                          <div className="max-w-[min(100%,280px)] shrink-0">{bubbleBody}</div>
                          <span className="shrink-0 pb-0.5 text-[11px] leading-none text-gray-600 tabular-nums">
                            {timeLabel}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div
            className={`fixed left-0 right-0 z-30 border-t border-[#c8c8c8] bg-white pb-[max(0.35rem,env(safe-area-inset-bottom,0px))] pt-1 shadow-[0_-2px_10px_rgba(0,0,0,0.06)] ${BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS}`}
          >
            {replyTarget && (
              <div className="mx-auto mb-1.5 flex max-w-lg items-start gap-2 border-b border-[#eee] px-3 pb-2 pt-1 text-[12px]">
                <div className="min-w-0 flex-1">
                  <span className="font-semibold text-[#06C755]">↩ {replyTarget.nickname}</span>
                  <p className="line-clamp-2 text-gray-600">{replyTarget.preview}</p>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-full px-2 py-1 text-xs font-semibold text-gray-500 hover:bg-gray-100"
                  onClick={() => setReplyTarget(null)}
                  aria-label="답장 취소"
                >
                  ✕
                </button>
              </div>
            )}
            <div className="mx-auto flex max-w-lg items-end gap-1 px-2">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(ev) => void onImageSelected(ev)}
              />
              <button
                type="button"
                className="mb-1 flex h-10 w-10 shrink-0 items-center justify-center text-[26px] font-light leading-none text-[#555] active:opacity-70"
                aria-label="첨부"
                disabled={busy}
                onClick={() => onPickImage()}
              >
                +
              </button>
              <button
                type="button"
                className="mb-1 flex h-10 w-10 shrink-0 items-center justify-center text-[#555] active:opacity-70"
                aria-label="사진"
                disabled={busy}
                onClick={() => onPickImage()}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M4 7h3l2-2h8v12H4V7z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                  <circle cx="12" cy="12" r="2.2" fill="currentColor" />
                </svg>
              </button>
              <button
                type="button"
                className="mb-1 flex h-10 w-10 shrink-0 items-center justify-center text-[#555] active:opacity-70"
                aria-label="앨범"
                disabled={busy}
                onClick={() => onPickImage()}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M8 14l2.5-3 3 3 3.5-4.5L19 15v3H5v-8l3-3z" fill="currentColor" opacity="0.25" />
                </svg>
              </button>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={1}
                className="mb-1 max-h-28 min-h-[40px] flex-1 resize-none rounded-[22px] border-0 bg-[#f2f2f2] px-3.5 py-2.5 text-[15px] text-[#111] outline-none placeholder:text-[#999] focus:ring-0"
                placeholder="메시지 입력"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void onSend();
                  }
                }}
              />
              <button
                type="button"
                className="mb-1 flex h-10 w-10 shrink-0 items-center justify-center text-[#888] active:opacity-70"
                aria-label="이모티콘"
                disabled={busy}
              >
                <span className="text-[22px] leading-none">☺</span>
              </button>
              <button
                type="button"
                disabled={busy || !draft.trim()}
                onClick={() => void onSend()}
                className="mb-1 shrink-0 rounded-[20px] bg-[#A5E65A] px-4 py-2 text-[14px] font-bold text-[#111] disabled:opacity-40"
              >
                전송
              </button>
            </div>
          </div>

          <LineOpenChatMessageActionSheet
            open={messageAction !== null}
            onClose={() => setMessageAction(null)}
            busy={busy}
            onReply={() => {
              if (!messageAction) return;
              setReplyTarget({
                id: messageAction.messageId,
                nickname: messageAction.nickname,
                preview: messageAction.preview,
              });
            }}
            onCopy={async () => {
              if (!messageAction) return;
              const t = messageAction.plainText.trim() || messageAction.preview;
              try {
                await navigator.clipboard.writeText(t);
              } catch {
                alert("복사에 실패했습니다.");
              }
            }}
            showBlind={Boolean(messageAction?.canBlind)}
            onBlind={() => {
              const id = messageAction?.messageId;
              setMessageAction(null);
              if (id) void onBlindMessage(id);
            }}
          />

          <LineOpenChatParticipantSheet
            open={participantsOpen}
            loading={participantsLoading}
            members={participants}
            viewerMemberId={chatMember?.memberId ?? null}
            onClose={() => {
              setParticipantsOpen(false);
              setPreviewMemberId(null);
              setPreviewInitial(null);
            }}
            onSelectMember={(m) => {
              setPreviewMemberId(m.memberId);
              setPreviewInitial(m);
            }}
          />
          <LineOpenChatMemberProfileSheet
            meetingId={meetingId}
            roomId={roomId}
            memberId={previewMemberId}
            initial={previewInitial}
            open={previewMemberId !== null}
            viewerMemberId={chatMember?.memberId ?? null}
            viewerRole={(chatMember?.role ?? "member") as MeetingOpenChatMemberRole}
            onClose={() => {
              setPreviewMemberId(null);
              setPreviewInitial(null);
            }}
            onUpdated={() => {
              void loadParticipants();
              void loadMessages();
              void loadRoom();
              void loadNotices();
            }}
          />
          {room && chatMember && meetingOpenChatRoleCanManage((chatMember.role ?? "member") as MeetingOpenChatMemberRole) && (
            <LineOpenChatOperatorMenuSheet
              open={operatorOpen}
              onClose={() => setOperatorOpen(false)}
              meetingId={meetingId}
              roomId={roomId}
              room={room}
              viewerRole={(chatMember.role ?? "member") as MeetingOpenChatMemberRole}
              onRefreshAll={refreshAll}
            />
          )}
          <LineOpenChatSearchSheet
            open={searchOpen}
            onClose={() => setSearchOpen(false)}
            apiMessagesBase={apiMessages}
          />
        </>
      )}
    </div>
  );
}
