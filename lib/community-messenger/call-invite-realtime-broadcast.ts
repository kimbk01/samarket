"use client";

/**
 * DB `postgres_changes`·폴링보다 빠른 1:1 통화 초대/종료 힌트 — Supabase Realtime **Broadcast** (영속 테이블 없음).
 * 페이로드는 신뢰하지 않고 항상 `GET .../incoming` 으로 검증한다 (스푸핑 완화).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { getSupabaseClient } from "@/lib/supabase/client";

export const CM_CALL_INVITE_BROADCAST_RING = "cm_invite_ring";
export const CM_CALL_INVITE_BROADCAST_HANGUP = "cm_invite_hangup";

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

export async function publishCommunityMessengerCallInviteRing(
  sb: SupabaseClient,
  args: {
    recipientUserId: string;
    sessionId: string;
    roomId: string;
    callKind: string;
    startedAtIso: string;
  }
): Promise<void> {
  const name = communityMessengerCallInviteChannelName(args.recipientUserId);
  const ch = sb.channel(name, { config: { broadcast: { ack: false } } });
  try {
    await waitForChannelSubscribed(ch, 4500);
    await ch.send({
      type: "broadcast",
      event: CM_CALL_INVITE_BROADCAST_RING,
      payload: {
        sessionId: args.sessionId,
        roomId: args.roomId,
        callKind: args.callKind,
        startedAt: args.startedAtIso,
      },
    });
  } finally {
    try {
      void sb.removeChannel(ch);
    } catch {
      /* ignore */
    }
  }
}

export async function publishCommunityMessengerCallInviteHangup(
  sb: SupabaseClient,
  args: { recipientUserId: string; sessionId: string }
): Promise<void> {
  const name = communityMessengerCallInviteChannelName(args.recipientUserId);
  const ch = sb.channel(name, { config: { broadcast: { ack: false } } });
  try {
    await waitForChannelSubscribed(ch, 3500);
    await ch.send({
      type: "broadcast",
      event: CM_CALL_INVITE_BROADCAST_HANGUP,
      payload: { sessionId: args.sessionId },
    });
  } finally {
    try {
      void sb.removeChannel(ch);
    } catch {
      /* ignore */
    }
  }
}

/** 발신 직후 — 수신 탭이 DB 반영 전에도 깨울 수 있게 */
export async function notifyCommunityMessengerCallInviteRingBestEffort(
  session: CommunityMessengerCallSession
): Promise<void> {
  if (session.sessionMode !== "direct") return;
  const recipient = session.recipientUserId?.trim();
  if (!recipient) return;
  const sb = getSupabaseClient();
  if (!sb) return;
  try {
    await publishCommunityMessengerCallInviteRing(sb, {
      recipientUserId: recipient,
      sessionId: session.id,
      roomId: session.roomId,
      callKind: session.callKind,
      startedAtIso: session.startedAt,
    });
  } catch {
    /* best-effort */
  }
}

export async function notifyCommunityMessengerCallInviteHangupBestEffort(
  recipientUserId: string,
  sessionId: string
): Promise<void> {
  const to = recipientUserId?.trim();
  const sid = sessionId?.trim();
  if (!to || !sid) return;
  const sb = getSupabaseClient();
  if (!sb) return;
  try {
    await publishCommunityMessengerCallInviteHangup(sb, { recipientUserId: to, sessionId: sid });
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
  return sb
    .channel(name, { config: { broadcast: { ack: false } } })
    .on("broadcast", { event: CM_CALL_INVITE_BROADCAST_RING }, (msg) => {
      const raw = (msg as { payload?: unknown }).payload;
      handlers.onRing(typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {});
    })
    .on("broadcast", { event: CM_CALL_INVITE_BROADCAST_HANGUP }, (msg) => {
      const raw = (msg as { payload?: unknown }).payload;
      handlers.onHangup(typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {});
    })
    .subscribe();
}
