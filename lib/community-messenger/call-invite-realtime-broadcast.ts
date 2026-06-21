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
import { logCallLatencyCmInviteRingEmit } from "@/lib/community-messenger/call-latency-trace";

export const CM_CALL_INVITE_BROADCAST_RING = "cm_invite_ring";
export const CM_CALL_INVITE_BROADCAST_HANGUP = "cm_invite_hangup";
/** 발신 취소·종료 — `cm_invite_hangup` 과 동일 채널, 터미널 메타 우선 */
export const CM_CALL_INVITE_BROADCAST_TERMINAL = "cm_invite_terminal";

export function communityMessengerCallInviteChannelName(userId: string): string {
  return `cm-call-invite:${userId.trim().toLowerCase()}`;
}

function waitForChannelSubscribed(ch: ReturnType<SupabaseClient["channel"]>, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const t = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("cm_invite_channel_timeout"));
    }, timeoutMs);
    ch.subscribe((status) => {
      if (settled) return;
      if (status === "SUBSCRIBED") {
        settled = true;
        window.clearTimeout(t);
        resolve();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        settled = true;
        window.clearTimeout(t);
        reject(new Error(`cm_invite_channel_${status}`));
      }
    });
  });
}

type WarmOutboundInviteChannel = {
  channel: ReturnType<SupabaseClient["channel"]>;
  ready: Promise<void>;
};

/** 발신 ring·terminal — 매 publish 새 subscribe(최대 800ms) 대기 제거 */
const warmOutboundInviteByRecipient = new Map<string, WarmOutboundInviteChannel>();

function warmInviteRecipientKey(userId: string): string {
  return userId.trim().toLowerCase();
}

function acquireWarmOutboundInviteChannel(sb: SupabaseClient, recipientUserId: string): WarmOutboundInviteChannel {
  const key = warmInviteRecipientKey(recipientUserId);
  const existing = warmOutboundInviteByRecipient.get(key);
  if (existing) return existing;
  const name = communityMessengerCallInviteChannelName(recipientUserId);
  const channel = sb.channel(name, { config: { broadcast: { ack: false } } });
  const ready = waitForChannelSubscribed(channel, 1_800).catch(() => {
    warmOutboundInviteByRecipient.delete(key);
  });
  const entry = { channel, ready };
  warmOutboundInviteByRecipient.set(key, entry);
  return entry;
}

/** 발신 직전/직후 recipient 채널 warm — terminal hangup 지연 제거 */
export function primeWarmCallInviteOutboundChannel(recipientUserId: string): void {
  const sb = getSupabaseClient();
  const to = recipientUserId?.trim();
  if (!sb || !to) return;
  void acquireWarmOutboundInviteChannel(sb, to).ready.catch(() => {});
}

async function sendWarmInviteBroadcast(
  sb: SupabaseClient,
  recipientUserId: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  const { channel, ready } = acquireWarmOutboundInviteChannel(sb, recipientUserId);
  await ready;
  await channel.send({ type: "broadcast", event, payload });
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
  await sendWarmInviteBroadcast(sb, args.recipientUserId, CM_CALL_INVITE_BROADCAST_RING, {
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
  await sendWarmInviteBroadcast(sb, args.recipientUserId, CM_CALL_INVITE_BROADCAST_HANGUP, {
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
  await sendWarmInviteBroadcast(sb, args.recipientUserId, CM_CALL_INVITE_BROADCAST_TERMINAL, {
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
    primeWarmCallInviteOutboundChannel(recipient);
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
    logCallLatencyCmInviteRingEmit({
      sessionId: session.id,
      roomId: session.roomId,
      callKind: session.callKind,
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
  return sb
    .channel(name, { config: { broadcast: { ack: false } } })
    .on("broadcast", { event: CM_CALL_INVITE_BROADCAST_RING }, (msg) => {
      const raw = (msg as { payload?: unknown }).payload;
      handlers.onRing(typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {});
    })
    .on("broadcast", { event: CM_CALL_INVITE_BROADCAST_HANGUP }, onTerminatePayload)
    .on("broadcast", { event: CM_CALL_INVITE_BROADCAST_TERMINAL }, onTerminatePayload)
    .subscribe();
}
