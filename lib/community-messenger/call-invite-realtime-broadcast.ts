"use client";

/**
 * DB `postgres_changes`·폴링보다 빠른 1:1 통화 초대/종료 힌트 — Supabase Realtime **Broadcast** (영속 테이블 없음).
 * 페이로드는 신뢰하지 않고 항상 `GET .../incoming` 으로 검증한다 (스푸핑 완화).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  cmCallIncomingTracePatch,
  cmCallIncomingTracePublishToStorage,
} from "@/lib/community-messenger/cm-call-debug";
import {
  createMessengerPrivateChannelStatusHandler,
  messengerPrivateBroadcastChannelOptions,
  primeMessengerPrivateRealtimeAuth,
  sendMessengerPrivateBroadcastFromClient,
} from "@/lib/community-messenger/realtime/private-broadcast-client";

export const CM_CALL_INVITE_BROADCAST_RING = "cm_invite_ring";
export const CM_CALL_INVITE_BROADCAST_HANGUP = "cm_invite_hangup";
/** 발신 취소·종료 — `cm_invite_hangup` 과 동일 채널, 터미널 메타 우선 */
export const CM_CALL_INVITE_BROADCAST_TERMINAL = "cm_invite_terminal";

export function communityMessengerCallInviteChannelName(userId: string): string {
  return `cm-call-invite:${userId.trim().toLowerCase()}`;
}

/**
 * 비공개 토픽 `cm-call-invite:<uid>` — 수신 = 본인만(`realtime.messages` SELECT 정책).
 * 발신 = 상대 토픽 REST broadcast(사용자 JWT, INSERT 정책 = 1:1 통화 세션을 공유한 사용자).
 * 상대 토픽을 join 하지 않으므로(이전: join 대기 최대 1.8s) 상대 수신함 SELECT 권한이 필요 없다.
 */
async function sendCallInviteBroadcast(
  sb: SupabaseClient,
  recipientUserId: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  const res = await sendMessengerPrivateBroadcastFromClient({
    sb,
    topic: communityMessengerCallInviteChannelName(recipientUserId),
    event,
    payload,
    scope: `call_invite:${event}`,
    timeoutMs: 3_000,
  });
  if (!res.ok) throw new Error(`cm_invite_send_${res.status || res.error}`);
}

export async function publishCommunityMessengerCallInviteRing(
  sb: SupabaseClient,
  args: {
    recipientUserId: string;
    sessionId: string;
    roomId: string;
    callKind: string;
    startedAtIso: string;
    initiatorUserId: string;
    /** 직전 `/calls/tmp_*` 다이얼 — 수신 프리뷰와 터미널 이벤트 tmp 매칭용 */
    tmpSessionId?: string | null;
  }
): Promise<void> {
  void publishCommunityMessengerCallInviteRingInner(sb, args).catch(() => {
    /* postgres_changes·수신 GET 백업으로 정합 */
  });
}

async function publishCommunityMessengerCallInviteRingInner(
  sb: SupabaseClient,
  args: {
    recipientUserId: string;
    sessionId: string;
    roomId: string;
    callKind: string;
    startedAtIso: string;
    initiatorUserId: string;
    tmpSessionId?: string | null;
  }
): Promise<void> {
  const tmp = typeof args.tmpSessionId === "string" ? args.tmpSessionId.trim() : "";
  await sendCallInviteBroadcast(sb, args.recipientUserId, CM_CALL_INVITE_BROADCAST_RING, {
    sessionId: args.sessionId,
    roomId: args.roomId,
    callKind: args.callKind,
    startedAt: args.startedAtIso,
    initiatorUserId: args.initiatorUserId,
    ...(tmp ? { tmpSessionId: tmp } : {}),
  });
}

export async function publishCommunityMessengerCallInviteHangup(
  sb: SupabaseClient,
  args: {
    recipientUserId: string;
    sessionId: string;
    roomId?: string | null;
    initiatorUserId?: string | null;
    callKind?: string | null;
    terminalStatus?: string | null;
    tmpSessionId?: string | null;
  }
): Promise<void> {
  const roomId = typeof args.roomId === "string" ? args.roomId.trim() : "";
  const ini = typeof args.initiatorUserId === "string" ? args.initiatorUserId.trim() : "";
  const ck = args.callKind === "video" || args.callKind === "voice" ? args.callKind : "";
  const st = typeof args.terminalStatus === "string" ? args.terminalStatus.trim() : "";
  const tmp = typeof args.tmpSessionId === "string" ? args.tmpSessionId.trim() : "";
  await sendCallInviteBroadcast(sb, args.recipientUserId, CM_CALL_INVITE_BROADCAST_HANGUP, {
    sessionId: args.sessionId,
    ...(roomId ? { roomId } : {}),
    ...(ini ? { initiatorUserId: ini } : {}),
    ...(ck ? { callKind: ck } : {}),
    ...(st ? { status: st, terminalStatus: st } : {}),
    ...(tmp ? { tmpSessionId: tmp } : {}),
  });
}

export async function publishCommunityMessengerCallInviteTerminal(
  sb: SupabaseClient,
  args: {
    recipientUserId: string;
    sessionId: string;
    roomId?: string | null;
    initiatorUserId?: string | null;
    callKind?: string | null;
    tmpSessionId?: string | null;
    status?: string | null;
  }
): Promise<void> {
  const roomId = typeof args.roomId === "string" ? args.roomId.trim() : "";
  const ini = typeof args.initiatorUserId === "string" ? args.initiatorUserId.trim() : "";
  const ck = args.callKind === "video" || args.callKind === "voice" ? args.callKind : "";
  const tmp = typeof args.tmpSessionId === "string" ? args.tmpSessionId.trim() : "";
  const st = typeof args.status === "string" ? args.status.trim() : "cancelled";
  await sendCallInviteBroadcast(sb, args.recipientUserId, CM_CALL_INVITE_BROADCAST_TERMINAL, {
    sessionId: args.sessionId,
    status: st,
    ...(roomId ? { roomId } : {}),
    ...(ini ? { initiatorUserId: ini } : {}),
    ...(ck ? { callKind: ck } : {}),
    ...(tmp ? { tmpSessionId: tmp } : {}),
  });
}

/** 발신 직후 — 수신 탭이 DB 반영 전에도 깨울 수 있게 */
export async function notifyCommunityMessengerCallInviteRingBestEffort(
  session: CommunityMessengerCallSession,
  options?: { dialTmpSessionId?: string | null }
): Promise<void> {
  if (session.sessionMode !== "direct") return;
  const recipient = session.recipientUserId?.trim();
  if (!recipient) return;
  const sb = getSupabaseClient();
  if (!sb) return;
  try {
    const initiator = session.initiatorUserId?.trim();
    if (!initiator) return;
    const dialTmp = typeof options?.dialTmpSessionId === "string" ? options.dialTmpSessionId.trim() : "";
    await publishCommunityMessengerCallInviteRing(sb, {
      recipientUserId: recipient,
      sessionId: session.id,
      roomId: session.roomId,
      callKind: session.callKind,
      startedAtIso: session.startedAt,
      initiatorUserId: initiator,
      tmpSessionId: dialTmp || undefined,
    });
    cmCallIncomingTracePatch(session.id, { signal_emit_ms: Date.now() });
    cmCallIncomingTracePublishToStorage(session.id);
  } catch {
    /* best-effort */
  }
}

export async function notifyCommunityMessengerCallInviteHangupBestEffort(
  recipientUserId: string,
  sessionId: string,
  options?: {
    roomId?: string | null;
    initiatorUserId?: string | null;
    callKind?: CommunityMessengerCallSession["callKind"] | null;
    tmpSessionId?: string | null;
    terminalStatus?: string | null;
  }
): Promise<void> {
  const to = recipientUserId?.trim();
  const sid = sessionId?.trim();
  if (!to || !sid) return;
  const sb = getSupabaseClient();
  if (!sb) return;
  try {
    /** `cm_invite_terminal` 단일 전송 — 구독자는 hangup·terminal 동일 핸들러. 직렬 이중 subscribe 대기 제거. */
    await publishCommunityMessengerCallInviteTerminal(sb, {
      recipientUserId: to,
      sessionId: sid,
      roomId: options?.roomId,
      initiatorUserId: options?.initiatorUserId ?? undefined,
      callKind: options?.callKind ?? undefined,
      tmpSessionId: options?.tmpSessionId ?? undefined,
      status: options?.terminalStatus ?? "cancelled",
    });
  } catch {
    /* best-effort */
  }
}

export function subscribeCommunityMessengerCallInviteBroadcast(
  sb: SupabaseClient,
  userId: string,
  handlers: {
    onRing: (payload: Record<string, unknown>) => void;
    onHangup: (payload: Record<string, unknown>) => void;
  }
): ReturnType<SupabaseClient["channel"]> {
  const name = communityMessengerCallInviteChannelName(userId);
  const onTerminatePayload = (msg: { payload?: unknown }) => {
    const raw = (msg as { payload?: unknown }).payload;
    handlers.onHangup(typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {});
  };
  primeMessengerPrivateRealtimeAuth(sb);
  return sb
    .channel(name, messengerPrivateBroadcastChannelOptions())
    .on("broadcast", { event: CM_CALL_INVITE_BROADCAST_RING }, (msg) => {
      const raw = (msg as { payload?: unknown }).payload;
      handlers.onRing(typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {});
    })
    .on("broadcast", { event: CM_CALL_INVITE_BROADCAST_HANGUP }, onTerminatePayload)
    .on("broadcast", { event: CM_CALL_INVITE_BROADCAST_TERMINAL }, onTerminatePayload)
    .subscribe(createMessengerPrivateChannelStatusHandler({ sb, scope: "call_invite" }));
}
