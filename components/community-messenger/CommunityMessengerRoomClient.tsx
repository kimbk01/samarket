"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  getCommunityMessengerPermissionGuide,
  hasUsablePrimedCommunityMessengerDeviceStream,
  primeCommunityMessengerDevicePermissionFromUserGesture,
  openCommunityMessengerPermissionSettings,
} from "@/lib/community-messenger/call-permission";
import { startCommunityMessengerCallTone } from "@/lib/community-messenger/call-feedback-sound";
import { bindMediaStreamToElement } from "@/lib/community-messenger/media-element";
import { useCommunityMessengerGroupCall } from "@/lib/community-messenger/use-community-messenger-group-call";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import { useCommunityMessengerRoomRealtime } from "@/lib/community-messenger/use-community-messenger-realtime";
import type {
  CommunityMessengerMessage,
  CommunityMessengerProfileLite,
  CommunityMessengerRoomSnapshot,
} from "@/lib/community-messenger/types";
import { VoiceMessageBubble } from "@/components/community-messenger/VoiceMessageBubble";
import { pickCommunityMessengerVoiceRecorderMime } from "@/lib/community-messenger/voice-recording";

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
  const searchParams = useSearchParams();
  /** 같은 방에 머문 채 전역 배너에서 수락할 때도 반응하도록 URL 을 구독한다(RSC initial props 만으론 갱신이 안 될 수 있음). */
  const callActionFromUrl = searchParams.get("callAction") ?? initialCallAction ?? undefined;
  const sessionIdFromUrl = searchParams.get("sessionId") ?? initialCallSessionId ?? undefined;
  const autoHandledSessionRef = useRef<string | null>(null);
  const autoAcceptInFlightRef = useRef<string | null>(null);
  const pendingMessageIdRef = useRef(0);
  const voiceFinalizingRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordStartMsRef = useRef(0);
  const voiceStartYRef = useRef(0);
  const voiceCancelledRef = useRef(false);
  const voiceMimeRef = useRef<{ mimeType: string; fileExtension: string } | null>(null);
  const voiceTickRef = useRef<number | null>(null);
  const voiceMaxTimerRef = useRef<number | null>(null);
  const loadedRef = useRef(false);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const [snapshot, setSnapshot] = useState<CommunityMessengerRoomSnapshot | null>(null);
  const [roomMessages, setRoomMessages] = useState<Array<CommunityMessengerMessage & { pending?: boolean }>>([]);
  const [friends, setFriends] = useState<CommunityMessengerProfileLite[]>([]);
  const [friendsLoaded, setFriendsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [voiceRecordSeconds, setVoiceRecordSeconds] = useState(0);
  const [voiceCancelHint, setVoiceCancelHint] = useState(false);
  const [inviteIds, setInviteIds] = useState<string[]>([]);
  const [openGroupTitle, setOpenGroupTitle] = useState("");
  const [openGroupSummary, setOpenGroupSummary] = useState("");
  const [openGroupPassword, setOpenGroupPassword] = useState("");
  const [openGroupMemberLimit, setOpenGroupMemberLimit] = useState("200");
  const [openGroupDiscoverable, setOpenGroupDiscoverable] = useState(true);
  const [openGroupJoinPolicy, setOpenGroupJoinPolicy] = useState<"password" | "free">("password");
  const [openGroupIdentityPolicy, setOpenGroupIdentityPolicy] = useState<"real_name" | "alias_allowed">("alias_allowed");
  const [activeSheet, setActiveSheet] = useState<null | "menu" | "members" | "info">(null);
  const [managedDirectCallError, setManagedDirectCallError] = useState<string | null>(null);

  const refresh = useCallback(async (silent = false) => {
    const shouldBlock = !silent && !loadedRef.current;
    if (shouldBlock) setLoading(true);
    try {
      const roomRes = await fetch(`/api/community-messenger/rooms/${encodeURIComponent(roomId)}`, { cache: "no-store" });
      const roomJson = (await roomRes.json()) as (CommunityMessengerRoomSnapshot & { ok?: boolean }) | {
        ok?: boolean;
      };
      setSnapshot(roomRes.ok && roomJson.ok ? (roomJson as CommunityMessengerRoomSnapshot) : null);
    } finally {
      loadedRef.current = true;
      if (shouldBlock) setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleRealtimeMessageEvent = useCallback(
    (event: {
      eventType: "INSERT" | "UPDATE" | "DELETE";
      message: {
        id: string;
        roomId: string;
        senderId: string | null;
        messageType: "text" | "image" | "system" | "call_stub" | "voice";
        content: string;
        metadata: Record<string, unknown>;
        createdAt: string;
      };
    }) => {
      if (!snapshot) return;
      if (event.eventType === "DELETE") {
        setRoomMessages((prev) => prev.filter((item) => item.id !== event.message.id));
        return;
      }
      setRoomMessages((prev) => mergeRoomMessages(prev, [mapRealtimeRoomMessage(snapshot, event.message)]));
    },
    [snapshot]
  );

  useCommunityMessengerRoomRealtime({
    roomId,
    enabled: Boolean(roomId),
    onRefresh: () => {
      void refresh(true);
    },
    onMessageEvent: handleRealtimeMessageEvent,
  });

  useEffect(() => {
    if (!snapshot) {
      setRoomMessages([]);
      return;
    }
    setRoomMessages((prev) => mergeRoomMessages(prev, snapshot.messages));
  }, [snapshot]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      messageEndRef.current?.scrollIntoView({ block: "end" });
    });
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [roomMessages]);

  const inviteCandidates = useMemo(() => {
    const memberIds = new Set((snapshot?.members ?? []).map((member) => member.id));
    return friends.filter((friend) => !memberIds.has(friend.id));
  }, [friends, snapshot?.members]);

  const loadFriends = useCallback(async () => {
    if (friendsLoaded) return;
    const res = await fetch("/api/community-messenger/friends", { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; friends?: CommunityMessengerProfileLite[] };
    setFriends(res.ok && json.ok ? json.friends ?? [] : []);
    setFriendsLoaded(true);
  }, [friendsLoaded]);

  const groupCall = useCommunityMessengerGroupCall({
    enabled: false,
    roomId,
    viewerUserId: snapshot?.viewerUserId ?? "",
    roomLabel: snapshot?.room.title ?? "그룹 통화",
    activeCall: null,
    onRefresh: () => refresh(true),
  });
  const call = groupCall;
  const roomUnavailable = snapshot ? snapshot.room.roomStatus !== "active" || snapshot.room.isReadonly : true;
  const isGroupRoom = snapshot ? snapshot.room.roomType !== "direct" : false;
  const permissionGuide = call.panel ? getCommunityMessengerPermissionGuide(call.panel.kind) : null;
  const isPrivateGroupRoom = snapshot?.room.roomType === "private_group";
  const isOpenGroupRoom = snapshot?.room.roomType === "open_group";
  const isOwner = snapshot?.myRole === "owner";
  const roomTypeLabel = isOpenGroupRoom ? "공개 그룹" : isPrivateGroupRoom ? "비공개 그룹" : "1:1 대화";
  const roomSubtitle = snapshot?.room.description || (isGroupRoom ? `${snapshot?.room.memberCount ?? 0}명 참여 중인 대화방` : "친구와 나누는 대화");
  const roomJoinLabel = isOpenGroupRoom
    ? snapshot?.room.joinPolicy === "password"
      ? "비밀번호 입장"
      : "자유 입장"
    : null;
  const roomIdentityLabel = isOpenGroupRoom
    ? snapshot?.room.identityPolicy === "alias_allowed"
      ? "별칭 허용"
      : "실명 기반"
    : null;

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
      case "peer_not_found":
        return "상대방 정보를 찾지 못했습니다.";
      case "forbidden":
        return "이 작업을 수행할 권한이 없습니다.";
      case "call_provider_not_configured":
        return "통화 서비스 설정이 아직 완료되지 않았습니다.";
      case "call_session_start_failed":
      case "call_session_participants_insert_failed":
        return "통화 세션을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.";
      case "messenger_storage_unavailable":
        return "메신저 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";
      case "messenger_migration_required":
        return "메신저 저장소 마이그레이션이 아직 반영되지 않았습니다. DB 스키마를 먼저 업데이트해 주세요.";
      case "file_too_large":
        return "음성 파일이 너무 큽니다. 2MB 이하로 녹음해 주세요.";
      case "unsupported_audio":
        return "이 기기에서 녹음된 형식은 전송할 수 없습니다.";
      case "file_required":
      case "multipart_required":
        return "음성 데이터를 확인할 수 없습니다.";
      case "upload_failed":
      case "server_config":
        return "음성 업로드에 실패했습니다. 잠시 후 다시 시도해 주세요.";
      default:
        return "메신저 작업을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    }
  }, []);

  const openCallPermissionHelp = useCallback(() => {
    if (openCommunityMessengerPermissionSettings()) return;
    alert(
      call.panel?.kind === "video"
        ? "브라우저 주소창 왼쪽의 사이트 설정에서 카메라와 마이크를 허용해 주세요."
        : "브라우저 주소창 왼쪽의 사이트 설정에서 마이크를 허용해 주세요."
    );
  }, [call.panel?.kind]);

  const retryCallDevicePermission = useCallback(() => {
    const kind = call.panel?.kind;
    if (!kind) return;
    void primeCommunityMessengerDevicePermissionFromUserGesture(kind)
      .then(async () => {
        await call.prepareDevices();
        if (call.panel?.mode === "dialing" && !call.panel.sessionId) {
          await call.startOutgoingCall(kind);
          return;
        }
        if (call.panel?.mode === "incoming") {
          await call.acceptIncomingCall();
        }
      })
      .catch(() => {
        alert(
          kind === "video"
            ? "카메라·마이크 권한을 허용한 뒤 다시 시도해 주세요."
            : "마이크 권한을 허용한 뒤 다시 시도해 주세요."
        );
      });
  }, [call, call.panel?.kind, call.panel?.mode, call.panel?.sessionId]);

  const handleAcceptIncomingCall = useCallback((): Promise<boolean> => {
    return call.acceptIncomingCall();
  }, [call]);

  const openDirectCallPage = useCallback(
    (nextSessionId: string, action?: "accept") => {
      const suffix = action ? `?action=${encodeURIComponent(action)}` : "";
      router.push(`/community-messenger/calls/${encodeURIComponent(nextSessionId)}${suffix}`);
    },
    [router]
  );

  const startManagedDirectCall = useCallback(
    async (kind: "voice" | "video") => {
      if (roomUnavailable || isGroupRoom) return;
      setManagedDirectCallError(null);
      setBusy(`managed-call:${kind}`);
      try {
        void primeCommunityMessengerDevicePermissionFromUserGesture(kind).catch(() => null);
        const existingSession = snapshot?.activeCall;
        if (existingSession && existingSession.sessionMode === "direct" && (existingSession.status === "ringing" || existingSession.status === "active")) {
          openDirectCallPage(existingSession.id);
          return;
        }
        const res = await fetch(`/api/community-messenger/rooms/${encodeURIComponent(roomId)}/calls`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callKind: kind }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          session?: { id?: string };
        };
        if (!res.ok || !json.ok || !json.session?.id) {
          setManagedDirectCallError(getRoomActionErrorMessage(json.error));
          return;
        }
        openDirectCallPage(String(json.session.id));
      } finally {
        setBusy(null);
      }
    },
    [getRoomActionErrorMessage, isGroupRoom, openDirectCallPage, roomId, roomUnavailable, snapshot?.activeCall]
  );

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

  useEffect(() => {
    if (activeSheet !== "members" || !isPrivateGroupRoom || friendsLoaded) return;
    void loadFriends();
  }, [activeSheet, friendsLoaded, isPrivateGroupRoom, loadFriends]);

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
      await refresh(true);
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
    if (!content || !snapshot) return;
    const tempId = `pending:${roomId}:${pendingMessageIdRef.current++}`;
    const optimisticMessage: CommunityMessengerMessage & { pending?: boolean } = {
      id: tempId,
      roomId,
      senderId: snapshot.viewerUserId,
      senderLabel:
        snapshot.members.find((member) => member.id === snapshot.viewerUserId)?.label ?? "나",
      messageType: "text",
      content,
      createdAt: new Date().toISOString(),
      isMine: true,
      pending: true,
      callKind: null,
      callStatus: null,
    };
    setRoomMessages((prev) => mergeRoomMessages(prev, [optimisticMessage]));
    setMessage("");
    setBusy("send");
    try {
      const res = await fetch(`/api/community-messenger/rooms/${encodeURIComponent(roomId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: CommunityMessengerMessage;
      };
      if (!res.ok || !json.ok) {
        setRoomMessages((prev) => prev.filter((item) => item.id !== tempId));
        setMessage(content);
        alert(getRoomActionErrorMessage(json.error));
        return;
      }
      if (json.message) {
        const confirmedMessage = json.message;
        setRoomMessages((prev) =>
          mergeRoomMessages(
            prev.filter((item) => item.id !== tempId),
            [confirmedMessage]
          )
        );
        return;
      }
      setRoomMessages((prev) => prev.map((item) => (item.id === tempId ? { ...item, pending: false } : item)));
    } finally {
      setBusy(null);
    }
  }, [getRoomActionErrorMessage, message, roomId, snapshot]);

  const finalizeVoiceRecording = useCallback(
    async (shouldUpload: boolean) => {
      if (voiceFinalizingRef.current) return;
      voiceFinalizingRef.current = true;
      if (voiceTickRef.current) {
        clearInterval(voiceTickRef.current);
        voiceTickRef.current = null;
      }
      if (voiceMaxTimerRef.current) {
        clearTimeout(voiceMaxTimerRef.current);
        voiceMaxTimerRef.current = null;
      }
      const rec = mediaRecorderRef.current;
      mediaRecorderRef.current = null;
      const stream = recordStreamRef.current;
      const startedAt = recordStartMsRef.current;
      setVoiceRecording(false);
      setVoiceCancelHint(false);
      setVoiceRecordSeconds(0);

      if (rec && rec.state !== "inactive") {
        await new Promise<void>((resolve) => {
          rec.addEventListener("stop", () => resolve(), { once: true });
          try {
            rec.stop();
          } catch {
            resolve();
          }
        });
      }
      stream?.getTracks().forEach((t) => t.stop());
      recordStreamRef.current = null;

      const chunks = [...mediaChunksRef.current];
      mediaChunksRef.current = [];
      const durationSeconds = startedAt ? (Date.now() - startedAt) / 1000 : 0;

      if (!shouldUpload) {
        voiceFinalizingRef.current = false;
        return;
      }

      const mime = voiceMimeRef.current?.mimeType || "audio/webm";
      const ext = voiceMimeRef.current?.fileExtension || "webm";
      const blob = new Blob(chunks, { type: mime });
      if (blob.size < 400) {
        voiceFinalizingRef.current = false;
        window.alert("녹음이 너무 짧습니다.");
        return;
      }
      if (!snapshot) {
        voiceFinalizingRef.current = false;
        return;
      }

      const roundedDur = Math.max(1, Math.min(600, Math.round(durationSeconds)));
      const blobUrl = URL.createObjectURL(blob);
      const tempId = `pending:${roomId}:voice:${pendingMessageIdRef.current++}`;
      const optimisticMessage: CommunityMessengerMessage & { pending?: boolean } = {
        id: tempId,
        roomId,
        senderId: snapshot.viewerUserId,
        senderLabel: snapshot.members.find((member) => member.id === snapshot.viewerUserId)?.label ?? "나",
        messageType: "voice",
        content: blobUrl,
        createdAt: new Date().toISOString(),
        isMine: true,
        pending: true,
        callKind: null,
        callStatus: null,
        voiceDurationSeconds: roundedDur,
      };
      setRoomMessages((prev) => mergeRoomMessages(prev, [optimisticMessage]));
      setBusy("send-voice");
      try {
        const form = new FormData();
        form.append("file", blob, `voice.${ext}`);
        form.append("durationSeconds", String(roundedDur));
        const res = await fetch(`/api/community-messenger/rooms/${encodeURIComponent(roomId)}/voice`, {
          method: "POST",
          body: form,
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          message?: CommunityMessengerMessage;
        };
        if (!res.ok || !json.ok) {
          URL.revokeObjectURL(blobUrl);
          setRoomMessages((prev) => prev.filter((item) => item.id !== tempId));
          window.alert(getRoomActionErrorMessage(json.error));
          return;
        }
        const confirmedVoice = json.message;
        if (confirmedVoice) {
          URL.revokeObjectURL(blobUrl);
          setRoomMessages((prev) =>
            mergeRoomMessages(
              prev.filter((item) => item.id !== tempId),
              [confirmedVoice]
            )
          );
          return;
        }
        URL.revokeObjectURL(blobUrl);
        setRoomMessages((prev) => prev.map((item) => (item.id === tempId ? { ...item, pending: false } : item)));
      } finally {
        setBusy(null);
        voiceFinalizingRef.current = false;
      }
    },
    [getRoomActionErrorMessage, roomId, snapshot]
  );

  const onVoiceMicPointerDown = useCallback(
    async (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (roomUnavailable || !snapshot || message.trim() || busy === "send" || busy === "send-voice") return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      voiceCancelledRef.current = false;
      voiceStartYRef.current = e.clientY;
      const picked = pickCommunityMessengerVoiceRecorderMime();
      if (!picked) {
        window.alert("이 브라우저에서는 음성 녹음을 지원하지 않습니다.");
        return;
      }
      voiceMimeRef.current = picked;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recordStreamRef.current = stream;
        const rec = new MediaRecorder(stream, { mimeType: picked.mimeType });
        mediaChunksRef.current = [];
        rec.ondataavailable = (ev) => {
          if (ev.data.size > 0) mediaChunksRef.current.push(ev.data);
        };
        rec.start(200);
        mediaRecorderRef.current = rec;
        recordStartMsRef.current = Date.now();
        setVoiceRecording(true);
        setVoiceRecordSeconds(0);
        if (voiceTickRef.current) clearInterval(voiceTickRef.current);
        voiceTickRef.current = window.setInterval(() => {
          setVoiceRecordSeconds(Math.floor((Date.now() - recordStartMsRef.current) / 1000));
        }, 250);
        if (voiceMaxTimerRef.current) clearTimeout(voiceMaxTimerRef.current);
        voiceMaxTimerRef.current = window.setTimeout(() => {
          void finalizeVoiceRecording(true);
        }, 120_000);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      } catch {
        window.alert(
          getCommunityMessengerPermissionGuide("voice")?.description ?? "마이크 권한을 허용한 뒤 다시 시도해 주세요."
        );
      }
    },
    [busy, finalizeVoiceRecording, message, roomUnavailable, snapshot]
  );

  const onVoiceMicPointerMove = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!mediaRecorderRef.current) return;
    if (e.clientY - voiceStartYRef.current < -72) {
      voiceCancelledRef.current = true;
      setVoiceCancelHint(true);
    } else {
      voiceCancelledRef.current = false;
      setVoiceCancelHint(false);
    }
  }, []);

  const onVoiceMicPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (!mediaRecorderRef.current && !recordStreamRef.current) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      void finalizeVoiceRecording(!voiceCancelledRef.current);
    },
    [finalizeVoiceRecording]
  );

  const onVoiceMicPointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      void finalizeVoiceRecording(false);
    },
    [finalizeVoiceRecording]
  );

  useEffect(() => {
    return () => {
      if (voiceTickRef.current) clearInterval(voiceTickRef.current);
      if (voiceMaxTimerRef.current) clearTimeout(voiceMaxTimerRef.current);
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        /* ignore */
      }
      recordStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

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
      await refresh(true);
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
    if (!isGroupRoom) return;
    const activeCall = snapshot?.activeCall;
    if (!activeCall) return;
    if (callActionFromUrl !== "accept") return;
    if (sessionIdFromUrl && !messengerUserIdsEqual(sessionIdFromUrl, activeCall.id)) return;
    if (autoHandledSessionRef.current && messengerUserIdsEqual(autoHandledSessionRef.current, activeCall.id)) return;
    if (autoAcceptInFlightRef.current && messengerUserIdsEqual(autoAcceptInFlightRef.current, activeCall.id)) return;
    if (activeCall.isMineInitiator) return;
    const shouldAutoAccept =
      activeCall.sessionMode === "group"
        ? (activeCall.status === "ringing" || activeCall.status === "active") &&
          activeCall.participants.some((participant) => participant.isMe && participant.status === "invited")
        : activeCall.status === "ringing";
    if (!shouldAutoAccept) return;
    /* URL 자동 수락은 useEffect 라서 브라우저가 사용자 제스처로 보지 않는다.
     * 전역 배너에서 프라임된 스트림이 있을 때만 자동으로 이어가고, 없으면 방 안 「수락」 한 번 필요. */
    if (!hasUsablePrimedCommunityMessengerDeviceStream(activeCall.callKind)) return;

    const sessionKey = activeCall.id;
    autoAcceptInFlightRef.current = sessionKey;
    void (async () => {
      try {
        const ok = await handleAcceptIncomingCall();
        if (ok) {
          autoHandledSessionRef.current = sessionKey;
        }
      } catch {
        /* 프라임 실패·수락 API 실패 등 — 방 안에서 다시 「수락」 가능 */
      } finally {
        if (messengerUserIdsEqual(autoAcceptInFlightRef.current, sessionKey)) {
          autoAcceptInFlightRef.current = null;
        }
      }
    })();
  }, [callActionFromUrl, handleAcceptIncomingCall, isGroupRoom, roomId, router, sessionIdFromUrl, snapshot?.activeCall]);

  useEffect(() => {
    if (!isGroupRoom) return;
    if (callActionFromUrl !== "accept" || !sessionIdFromUrl) return;
    if (snapshot?.activeCall?.id && messengerUserIdsEqual(snapshot.activeCall.id, sessionIdFromUrl)) return;
    let cancelled = false;
    const refreshNow = () => {
      if (cancelled) return;
      void refresh(true);
    };
    refreshNow();
    const timer = window.setInterval(refreshNow, 500);
    const stopTimer = window.setTimeout(() => {
      window.clearInterval(timer);
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.clearTimeout(stopTimer);
    };
  }, [callActionFromUrl, isGroupRoom, refresh, sessionIdFromUrl, snapshot?.activeCall?.id]);

  useEffect(() => {
    if (!isGroupRoom) return;
    if (callActionFromUrl !== "accept" || !sessionIdFromUrl) return;
    const samePanelSession =
      call.panel?.sessionId &&
      messengerUserIdsEqual(call.panel.sessionId, sessionIdFromUrl) &&
      call.panel.mode !== "incoming";
    const sameActiveSession =
      snapshot?.activeCall?.id &&
      messengerUserIdsEqual(snapshot.activeCall.id, sessionIdFromUrl) &&
      snapshot.activeCall.status === "active";
    if (!samePanelSession && !sameActiveSession) return;
    router.replace(`/community-messenger/rooms/${encodeURIComponent(roomId)}`);
  }, [
    call.panel?.mode,
    call.panel?.sessionId,
    callActionFromUrl,
    sessionIdFromUrl,
    roomId,
    router,
    snapshot?.activeCall?.id,
    snapshot?.activeCall?.status,
    isGroupRoom,
  ]);

  useEffect(() => {
    if (!call.panel || (call.panel.mode !== "incoming" && call.panel.mode !== "dialing")) return;
    const tone = startCommunityMessengerCallTone(call.panel.mode === "incoming" ? "incoming" : "outgoing");
    return () => {
      tone.stop();
    };
  }, [call.panel?.mode, call.panel?.sessionId]);

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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#F4F6F8]">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 px-3 py-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.replace(`/community-messenger?tab=${isGroupRoom ? "groups" : "chats"}`)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-700 transition hover:bg-gray-100"
            aria-label="뒤로가기"
          >
            <BackIcon className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-semibold text-gray-900">{snapshot.room.title}</p>
            <p className="truncate text-[12px] text-gray-500">
              {roomTypeLabel}
              {roomSubtitle ? ` · ${roomSubtitle}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {!isGroupRoom && snapshot.room.roomStatus === "active" && !snapshot.room.isReadonly ? (
              <>
                <button
                  type="button"
                  onClick={() => void startManagedDirectCall("voice")}
                  disabled={roomUnavailable || busy === "managed-call:voice" || busy === "managed-call:video"}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-[#06C755] transition hover:bg-[#06C755]/10 disabled:opacity-35"
                  aria-label="음성 통화"
                >
                  <VoiceCallIcon className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => void startManagedDirectCall("video")}
                  disabled={roomUnavailable || busy === "managed-call:voice" || busy === "managed-call:video"}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-[#06C755] transition hover:bg-[#06C755]/10 disabled:opacity-35"
                  aria-label="영상 통화"
                >
                  <VideoCallIcon className="h-5 w-5" />
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => setActiveSheet("menu")}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-700 transition hover:bg-gray-100"
              aria-label="채팅방 메뉴"
            >
              <MoreIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <main className="space-y-3 px-4 py-4 pb-6">
          {snapshot.room.roomStatus !== "active" || snapshot.room.isReadonly ? (
            <div className="rounded-2xl bg-amber-50 px-3 py-3 text-[13px] text-amber-800">
              {snapshot.room.roomStatus === "blocked"
                ? "이 방은 관리자에 의해 차단되었습니다."
                : snapshot.room.roomStatus === "archived"
                  ? "이 방은 관리자에 의해 보관되었습니다."
                  : "이 방은 현재 제한 상태입니다."}
              {snapshot.room.isReadonly ? " 현재 읽기 전용 상태입니다." : ""}
            </div>
          ) : null}
          {(managedDirectCallError || (call.errorMessage && !call.panel)) ? (
            <div className="rounded-2xl bg-red-50 px-3 py-3 text-[13px] text-red-700">
              {managedDirectCallError ?? call.errorMessage}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-[#06C755]/10 px-3 py-1 text-[12px] font-semibold text-[#06C755]">
              SAMarket 메신저
            </span>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-[12px] font-medium text-gray-700">
              {roomTypeLabel}
            </span>
            {roomJoinLabel ? (
              <span className="rounded-full bg-sky-50 px-3 py-1 text-[12px] font-medium text-sky-700">
                {roomJoinLabel}
              </span>
            ) : null}
            {roomIdentityLabel ? (
              <span className="rounded-full bg-violet-50 px-3 py-1 text-[12px] font-medium text-violet-700">
                {roomIdentityLabel}
              </span>
            ) : null}
            {snapshot.room.myIdentityMode ? (
              <span className="rounded-full bg-gray-100 px-3 py-1 text-[12px] font-medium text-gray-700">
                내 표시 {snapshot.room.myIdentityMode === "alias" ? "별칭" : "실명"}
              </span>
            ) : null}
          </div>
          {roomMessages.length ? (
            roomMessages.map((item) => (
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
                    {item.messageType === "voice" ? (
                      <VoiceMessageBubble
                        src={item.content}
                        durationSeconds={item.voiceDurationSeconds ?? 0}
                        isMine={item.isMine}
                        pending={item.pending}
                      />
                    ) : item.messageType === "call_stub" ? (
                      <div>
                        <p className="font-semibold">
                          {item.callKind === "video" ? "영상 통화" : "음성 통화"}
                        </p>
                        <p className="mt-1 text-[12px]">{formatRoomCallStatus(item.callStatus)}</p>
                      </div>
                    ) : (
                      <div className="flex items-end gap-2">
                        <span>{item.content}</span>
                        {item.pending ? <span className="text-[11px] opacity-70">전송 중</span> : null}
                      </div>
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
          <div ref={messageEndRef} />
        </main>
      </div>

      <footer className="shrink-0 border-t border-gray-200 bg-white px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
        <div className="flex min-w-0 items-end gap-2">
          <button
            type="button"
            onClick={() => setActiveSheet("menu")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gray-200 text-gray-700"
            aria-label="채팅방 액션"
          >
            <PlusIcon className="h-5 w-5" />
          </button>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={1}
            disabled={roomUnavailable || voiceRecording}
            placeholder={
              roomUnavailable
                ? snapshot.room.isReadonly
                  ? "읽기 전용 방입니다"
                  : snapshot.room.roomStatus === "blocked"
                    ? "차단된 방입니다"
                    : "보관된 방입니다"
                : "메시지 입력 · 오른쪽 마이크를 길게 눌러 음성"
            }
            className="max-h-28 min-h-[44px] min-w-0 flex-1 resize-none rounded-2xl border border-gray-200 px-4 py-3 text-[14px] outline-none focus:border-[#06C755] disabled:bg-gray-100 disabled:text-gray-500"
          />
          <div className="flex shrink-0 items-end gap-1.5">
            <button
              type="button"
              onPointerDown={onVoiceMicPointerDown}
              onPointerMove={onVoiceMicPointerMove}
              onPointerUp={onVoiceMicPointerUp}
              onPointerCancel={onVoiceMicPointerCancel}
              disabled={
                roomUnavailable || busy === "send" || busy === "send-voice" || Boolean(message.trim())
              }
              className="flex h-11 w-11 touch-none select-none items-center justify-center rounded-full bg-[#06C755]/12 text-[#06C755] ring-2 ring-[#06C755]/25 transition active:scale-95 disabled:opacity-35"
              aria-label="음성 메시지 — 누른 채로 녹음, 손을 떼면 전송, 위로 밀면 취소"
              title={
                message.trim()
                  ? "글자를 지우면 음성 녹음을 사용할 수 있습니다"
                  : "길게 눌러 녹음 · 손 떼면 전송 · 위로 밀면 취소"
              }
            >
              <MicHoldIcon className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={() => void sendMessage()}
              disabled={roomUnavailable || !message.trim() || busy === "send" || busy === "send-voice"}
              className="rounded-2xl bg-[#06C755] px-3.5 py-3 text-[14px] font-semibold text-white disabled:opacity-40 sm:px-4"
            >
              전송
            </button>
          </div>
        </div>
      </footer>

      {voiceRecording ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)]">
          <div
            className={`max-w-md rounded-2xl px-4 py-3 text-center text-[14px] font-semibold shadow-lg ${
              voiceCancelHint ? "bg-red-600 text-white" : "bg-gray-900/92 text-white"
            }`}
          >
            {voiceCancelHint
              ? "위로 밀었습니다 · 손을 떼면 녹음이 취소됩니다"
              : `녹음 중 ${formatDuration(voiceRecordSeconds)} · 손을 떼면 전송 · 위로 밀면 취소`}
          </div>
        </div>
      ) : null}

      {activeSheet ? (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 px-4 pb-6" onClick={() => setActiveSheet(null)}>
          <div
            className="max-h-[78vh] w-full max-w-[520px] overflow-y-auto rounded-[28px] bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            {activeSheet === "menu" ? (
              <>
                <p className="text-[13px] font-medium text-[#06C755]">채팅방 메뉴</p>
                <h2 className="mt-1 text-[20px] font-semibold text-gray-900">{snapshot.room.title}</h2>
                <div className="mt-4 grid gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveSheet("members")}
                    className="flex items-center justify-between rounded-2xl border border-gray-200 px-4 py-4 text-left"
                  >
                    <div>
                      <p className="text-[15px] font-semibold text-gray-900">참가자 보기</p>
                      <p className="mt-1 text-[12px] text-gray-500">{snapshot.room.memberCount}명 참여 중</p>
                    </div>
                    <span className="text-[18px] text-gray-300">›</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSheet("info")}
                    className="flex items-center justify-between rounded-2xl border border-gray-200 px-4 py-4 text-left"
                  >
                    <div>
                      <p className="text-[15px] font-semibold text-gray-900">방 정보 보기</p>
                      <p className="mt-1 text-[12px] text-gray-500">정책, 소개, 방장 정보를 확인합니다.</p>
                    </div>
                    <span className="text-[18px] text-gray-300">›</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSheet(null);
                      if (isGroupRoom) return;
                      void startManagedDirectCall("voice");
                    }}
                    disabled={roomUnavailable || isGroupRoom || busy === "managed-call:voice"}
                    className="rounded-2xl border border-gray-200 px-4 py-4 text-left text-[15px] font-semibold text-gray-900 disabled:opacity-40"
                  >
                    {isGroupRoom ? "1:1 통화 준비 중" : "음성 통화"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSheet(null);
                      if (isGroupRoom) return;
                      void startManagedDirectCall("video");
                    }}
                    disabled={roomUnavailable || isGroupRoom || busy === "managed-call:video"}
                    className="rounded-2xl border border-gray-200 px-4 py-4 text-left text-[15px] font-semibold text-gray-900 disabled:opacity-40"
                  >
                    {isGroupRoom ? "그룹 통화 준비 중" : "영상 통화"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSheet(null);
                      void reportTarget({ reportType: "room" });
                    }}
                    className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-left text-[15px] font-semibold text-red-700"
                  >
                    신고
                  </button>
                </div>
              </>
            ) : null}

            {activeSheet === "members" ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-medium text-[#06C755]">참가자</p>
                    <h2 className="mt-1 text-[20px] font-semibold text-gray-900">참여 멤버</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveSheet("menu")}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-[12px] text-gray-700"
                  >
                    이전
                  </button>
                </div>
                <div className="mt-4 grid gap-2">
                  {snapshot.members.map((member) => (
                    <div key={member.id} className="rounded-2xl border border-gray-200 px-4 py-3">
                      <p className="text-[14px] font-semibold text-gray-900">{member.label}</p>
                      <p className="mt-1 text-[12px] text-gray-500">
                        {member.subtitle ?? (member.identityMode === "alias" ? "별칭 참여" : "참여 중")}
                      </p>
                    </div>
                  ))}
                </div>
                {isPrivateGroupRoom ? (
                  <div className="mt-4 rounded-2xl bg-[#F8FAF9] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[14px] font-semibold text-gray-900">멤버 초대</p>
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
              </>
            ) : null}

            {activeSheet === "info" ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-medium text-[#06C755]">방 정보</p>
                    <h2 className="mt-1 text-[20px] font-semibold text-gray-900">대화방 상세</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveSheet("menu")}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-[12px] text-gray-700"
                  >
                    이전
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl border border-gray-200 p-4">
                    <p className="text-[14px] font-semibold text-gray-900">{snapshot.room.title}</p>
                    <p className="mt-2 text-[13px] leading-5 text-gray-600">
                      {snapshot.room.summary?.trim() || roomSubtitle || "아직 소개가 없는 대화방입니다."}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full bg-gray-100 px-3 py-1 text-[12px] font-medium text-gray-700">
                        {roomTypeLabel}
                      </span>
                      {roomJoinLabel ? (
                        <span className="rounded-full bg-sky-50 px-3 py-1 text-[12px] font-medium text-sky-700">
                          {roomJoinLabel}
                        </span>
                      ) : null}
                      {roomIdentityLabel ? (
                        <span className="rounded-full bg-violet-50 px-3 py-1 text-[12px] font-medium text-violet-700">
                          {roomIdentityLabel}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-3 text-[12px] text-gray-500">
                      방장 {snapshot.room.ownerLabel} · 현재 {snapshot.room.memberCount}명
                      {snapshot.room.memberLimit ? ` / 최대 ${snapshot.room.memberLimit}명` : ""}
                    </p>
                  </div>

                  {isOpenGroupRoom ? (
                    <div className="rounded-2xl bg-[#F8FAF9] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[14px] font-semibold text-gray-900">공개 그룹 설정</p>
                          <p className="mt-1 text-[12px] text-gray-500">
                            {isOwner ? "방장으로서 입장 정책과 노출 정책을 수정할 수 있습니다." : "현재 공개 그룹 정책을 확인합니다."}
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
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {isGroupRoom && call.panel ? (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/70 px-4 pb-4 sm:items-center sm:pb-0">
          <div className="w-full max-w-[420px] rounded-[32px] bg-[#111827] px-5 pb-5 pt-6 text-white shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <span className="rounded-full bg-white/10 px-3 py-1 text-[12px] font-semibold text-white/85">
                {isGroupRoom ? "그룹 " : ""}
                {call.panel.kind === "video" ? "영상 통화" : "음성 통화"}
              </span>
              {call.panel.mode === "active" ? (
                <span className="rounded-full bg-[#06C755]/20 px-3 py-1 text-[12px] font-semibold text-[#86EFAC]">
                  {formatDuration(call.elapsedSeconds)}
                </span>
              ) : null}
            </div>

            <div className="mt-5 overflow-hidden rounded-[28px] bg-black">
              {call.panel.kind === "video" ? (
                <div className="relative min-h-[250px] bg-black">
                  {call.localStream ? (
                    <video
                      ref={call.localVideoRef}
                      autoPlay
                      muted
                      playsInline
                      className="h-[250px] w-full bg-black object-cover"
                    />
                  ) : (
                    <div className="flex h-[250px] flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_top,#1f2937,#020617)] px-6 text-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-[12px] font-semibold">
                        VIDEO
                      </div>
                      <p className="text-[13px] text-white/75">
                        {call.panel.mode === "incoming"
                          ? "카메라와 마이크 권한을 확인하면 바로 통화에 참여합니다."
                          : "카메라와 마이크 권한을 확인하는 중입니다."}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex h-[250px] flex-col items-center justify-center gap-4 bg-[radial-gradient(circle_at_top,#1f2937,#020617)]">
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#06C755]/90 text-[26px] font-semibold text-white">
                    MIC
                  </div>
                  <p className="text-[13px] text-white/70">
                    {call.panel.mode === "incoming" ? "마이크 확인 후 바로 연결합니다." : "마이크 연결을 준비하고 있습니다."}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-5 text-center">
              <h2 className="text-[24px] font-semibold text-white">{call.panel.peerLabel}</h2>
              <p className="mt-1 text-[14px] text-white/70">{call.callStatusLabel}</p>
              {call.connectionBadge ? (
                <p
                  className={`mt-3 inline-flex rounded-full px-3 py-1 text-[12px] font-semibold ${
                    call.connectionBadge.tone === "good"
                      ? "bg-green-500/15 text-green-200"
                      : call.connectionBadge.tone === "poor"
                        ? "bg-red-500/15 text-red-200"
                        : "bg-white/10 text-white/80"
                  }`}
                >
                  {call.connectionBadge.label}
                </p>
              ) : null}
              {isGroupRoom && groupCall.participants.length ? (
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {groupCall.participants.map((participant) => (
                    <span
                      key={participant.userId}
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                        participant.status === "joined"
                          ? "bg-green-500/15 text-green-200"
                          : participant.status === "invited"
                            ? "bg-white/10 text-white/75"
                            : "bg-red-500/15 text-red-200"
                      }`}
                    >
                      {participant.label} · {formatParticipantStatus(participant.status)}
                    </span>
                  ))}
                </div>
              ) : null}
              {isGroupRoom && groupCall.remotePeers.length ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {groupCall.remotePeers.map((peer) => (
                    <div key={peer.userId} className="overflow-hidden rounded-2xl bg-black">
                      <video
                        ref={(node) => {
                          groupCall.bindRemoteVideo(peer.userId, node);
                        }}
                        autoPlay
                        playsInline
                        className="h-24 w-full bg-black object-cover"
                      />
                      <p className="px-2 py-2 text-[11px] text-white/75">{peer.label}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {call.errorMessage ? (
              <div className="mt-4 rounded-2xl bg-white/10 p-4 text-left">
                <p className="text-[13px] font-semibold text-[#FECACA]">{call.errorMessage}</p>
                <p className="mt-2 text-[12px] leading-5 text-white/70">{permissionGuide?.description}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void retryCallDevicePermission()}
                    disabled={call.busy === "call-start" || call.busy === "call-accept" || call.busy === "device-prepare"}
                    className="flex-1 rounded-2xl bg-white px-4 py-3 text-[13px] font-semibold text-[#111827] disabled:opacity-40"
                  >
                    {call.busy === "call-start" || call.busy === "call-accept" || call.busy === "device-prepare"
                      ? "확인 중..."
                      : permissionGuide?.retryLabel ?? "권한 확인"}
                  </button>
                  <button
                    type="button"
                    onClick={openCallPermissionHelp}
                    className="rounded-2xl border border-white/15 px-4 py-3 text-[13px] font-medium text-white"
                  >
                    {permissionGuide?.settingsLabel ?? "권한 안내"}
                  </button>
                </div>
              </div>
            ) : (call.panel.mode === "dialing" || call.panel.mode === "connecting") && !call.localStream ? (
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => void retryCallDevicePermission()}
                  disabled={call.busy === "call-start" || call.busy === "call-accept" || call.busy === "device-prepare"}
                  className="flex-1 rounded-2xl bg-white px-4 py-3 text-[13px] font-semibold text-[#111827] disabled:opacity-40"
                >
                  {call.busy === "call-start" || call.busy === "call-accept" || call.busy === "device-prepare"
                    ? "확인 중..."
                    : permissionGuide?.retryLabel ?? "권한 확인"}
                </button>
                <button
                  type="button"
                  onClick={openCallPermissionHelp}
                  className="rounded-2xl border border-white/15 px-4 py-3 text-[13px] font-medium text-white"
                >
                  {permissionGuide?.settingsLabel ?? "권한 안내"}
                </button>
              </div>
            ) : null}

            <div className="mt-5 flex gap-2">
              {call.panel.mode === "incoming" ? (
                <>
                  <button
                    type="button"
                    onClick={() => void call.rejectIncomingCall()}
                    disabled={call.busy === "call-reject"}
                    className="cursor-pointer touch-manipulation rounded-2xl border border-white/15 px-4 py-3 text-[14px] text-white/80 transition-colors hover:border-white/30 hover:bg-white/10 hover:text-white active:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111827]"
                  >
                    거절
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAcceptIncomingCall()}
                    disabled={call.busy === "call-accept"}
                    className="flex-1 cursor-pointer touch-manipulation select-none rounded-2xl bg-[#06C755] px-4 py-3 text-[14px] font-semibold text-white shadow-md transition-[transform,colors] duration-150 hover:bg-[#05b34c] hover:shadow-lg active:scale-[95%] active:bg-[#049c42] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111827]"
                  >
                    수락
                  </button>
                </>
              ) : call.panel.mode === "dialing" || call.panel.mode === "connecting" ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (call.panel?.sessionId) {
                        void call.cancelOutgoingCall();
                        return;
                      }
                      call.dismissPanel();
                    }}
                    disabled={call.panel?.sessionId ? call.busy === "call-cancel" : false}
                    className="flex-1 rounded-2xl bg-[#ef4444] px-4 py-3 text-[14px] font-semibold text-white disabled:opacity-40"
                  >
                    통화 끊기
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void call.endActiveCall()}
                    disabled={call.busy === "call-end"}
                    className="flex-1 rounded-2xl bg-[#ef4444] px-4 py-3 text-[14px] font-semibold text-white disabled:opacity-40"
                  >
                    통화 끊기
                  </button>
                  {call.connectionBadge?.tone === "poor" ? (
                    <button
                      type="button"
                      onClick={() => void call.retryConnection()}
                      disabled={call.busy === "call-retry"}
                      className="rounded-2xl border border-white/15 px-4 py-3 text-[14px] font-medium text-white/80"
                    >
                      다시 연결
                    </button>
                  ) : null}
                </>
              )}
            </div>
            {call.panel.kind !== "video" ? (
              groupCall.remotePeers.map((peer) => (
                <audio
                  key={`audio:${peer.userId}`}
                  ref={(node) => {
                    bindMediaStreamToElement(node, peer.stream);
                  }}
                  autoPlay
                  playsInline
                  className="hidden"
                />
              ))
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function mergeRoomMessages(
  prev: Array<CommunityMessengerMessage & { pending?: boolean }>,
  next: CommunityMessengerMessage[]
): Array<CommunityMessengerMessage & { pending?: boolean }> {
  const mergedConfirmed = new Map<string, CommunityMessengerMessage & { pending?: boolean }>();
  for (const item of prev) {
    if (item.pending) continue;
    mergedConfirmed.set(item.id, item);
  }
  for (const item of next) {
    mergedConfirmed.set(item.id, {
      ...mergedConfirmed.get(item.id),
      ...item,
      pending: false,
    });
  }
  const pending = prev.filter((item) => item.pending);
  const mergedPending = pending.filter((item) => {
    return !next.some((confirmedItem) => {
      if (confirmedItem.senderId !== item.senderId || confirmedItem.messageType !== item.messageType) return false;
      const dt = Math.abs(new Date(confirmedItem.createdAt).getTime() - new Date(item.createdAt).getTime());
      if (item.messageType === "voice" && item.pending) {
        return dt < 15_000;
      }
      return confirmedItem.content === item.content && dt < 15_000;
    });
  });
  return [...mergedConfirmed.values(), ...mergedPending].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

function mapRealtimeRoomMessage(
  snapshot: CommunityMessengerRoomSnapshot,
  message: {
    id: string;
    roomId: string;
    senderId: string | null;
    messageType: "text" | "image" | "system" | "call_stub" | "voice";
    content: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }
): CommunityMessengerMessage {
  const sender = message.senderId ? snapshot.members.find((member) => member.id === message.senderId) : null;
  const callKind =
    message.metadata.callKind === "video" || message.metadata.callKind === "voice"
      ? message.metadata.callKind
      : null;
  const callStatus =
    message.metadata.callStatus === "missed" ||
    message.metadata.callStatus === "rejected" ||
    message.metadata.callStatus === "cancelled" ||
    message.metadata.callStatus === "ended" ||
    message.metadata.callStatus === "incoming" ||
    message.metadata.callStatus === "dialing"
      ? message.metadata.callStatus
      : null;
  const voiceDurationSeconds =
    message.messageType === "voice"
      ? Math.max(0, Math.floor(Number(message.metadata.durationSeconds ?? 0)) || 0)
      : undefined;
  return {
    id: message.id,
    roomId: message.roomId,
    senderId: message.senderId,
    senderLabel: sender?.label ?? (message.senderId === snapshot.viewerUserId ? "나" : "상대"),
    messageType: message.messageType,
    content: message.content,
    createdAt: message.createdAt,
    isMine: message.senderId === snapshot.viewerUserId,
    callKind,
    callStatus,
    ...(voiceDurationSeconds !== undefined ? { voiceDurationSeconds } : {}),
  };
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatRoomCallStatus(status?: string | null): string {
  if (status === "missed") return "부재중";
  if (status === "rejected") return "거절됨";
  if (status === "cancelled") return "취소됨";
  if (status === "ended") return "통화 종료";
  if (status === "incoming") return "수신 중";
  if (status === "dialing") return "발신 중";
  return "상태 확인 중";
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

function BackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MoreIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MicHoldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
    </svg>
  );
}

function VoiceCallIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path
        d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function VideoCallIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="2" y="6" width="14" height="12" rx="2" strokeLinejoin="round" />
      <path d="M22 8v8l-5-3.2V11.2L22 8z" strokeLinejoin="round" />
    </svg>
  );
}
