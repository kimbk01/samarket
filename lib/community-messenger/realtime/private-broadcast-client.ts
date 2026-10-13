"use client";

/**
 * 메신저 **비공개(private) Realtime Broadcast** 클라이언트 공통.
 *
 * - 구독: `sb.channel(name, messengerPrivateBroadcastChannelOptions(...))` — `config.private: true`.
 *   Realtime 은 join 시점의 JWT(`realtime.setAuth`)로 `realtime.messages` SELECT 정책을 평가한다.
 *   토큰은 `lib/supabase/client.ts` 가 INITIAL_SESSION/SIGNED_IN/TOKEN_REFRESHED 마다 `realtime.setAuth` 로 넘기며,
 *   realtime-js 가 joined 채널에 `access_token` 을 push·join payload 를 갱신한다.
 * - join 거부(CHANNEL_ERROR: Unauthorized 등)는 realtime-js rejoin 타이머(1s→2s→5s→10s 상한)가 재시도한다 —
 *   여기서는 **로그(스로틀) + 세션 토큰 재동기화**만 해서 다음 rejoin 이 최신 JWT 로 가게 한다(촘촘한 루프 없음).
 * - 발신(상대 토픽): `sendMessengerPrivateBroadcastFromClient` — REST broadcast + 사용자 JWT.
 *   상대 토픽을 join(=SELECT) 하지 않으므로 상대 수신함을 읽을 권한이 필요 없다(INSERT 정책만).
 *
 * 정책: `supabase/migrations/20270422120000_cm_realtime_private_broadcast_authorization.sql`
 */
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { privateRealtimeChannelOptions } from "@/lib/supabase/private-realtime-channel-options";
import { syncSupabaseRealtimeAuthFromSession } from "@/lib/supabase/wait-for-realtime-auth";
import {
  postRealtimeBroadcastRest,
  type RealtimeRestBroadcastResult,
} from "@/lib/supabase/realtime-broadcast-rest";

type RealtimeSubscribeStatus = Parameters<NonNullable<Parameters<RealtimeChannel["subscribe"]>[0]>>[0];

/** 비공개 broadcast 채널 옵션 — 같은 토픽을 여는 모든 호출부가 동일 옵션을 써야 한다(realtime-js 는 토픽으로 채널을 재사용). */
export function messengerPrivateBroadcastChannelOptions(broadcast?: { ack?: boolean; self?: boolean }): {
  config: { private: true; broadcast: { ack: boolean; self: boolean } };
} {
  return privateRealtimeChannelOptions(broadcast);
}

const STATUS_LOG_WINDOW_MS = 30_000;
const AUTH_RESYNC_MIN_GAP_MS = 5_000;
const statusLogAt = new Map<string, number>();
let lastAuthResyncAt = 0;

/**
 * `channel.subscribe(cb)` 콜백 — 비공개 채널 join 실패를 로그하고 토큰을 다시 맞춘다.
 * realtime-js 는 rejoin 때도 같은 콜백을 호출하므로 SUBSCRIBED 로 회복되면 그대로 정상 동작.
 */
export function createMessengerPrivateChannelStatusHandler(args: {
  sb: SupabaseClient;
  scope: string;
  onStatus?: (status: RealtimeSubscribeStatus, err?: Error) => void;
}): (status: RealtimeSubscribeStatus, err?: Error) => void {
  return (status, err) => {
    try {
      args.onStatus?.(status, err);
    } catch {
      /* consumer error must not break realtime */
    }
    if (status !== "CHANNEL_ERROR" && status !== "TIMED_OUT") return;
    const now = Date.now();
    const logKey = `${args.scope}:${status}`;
    if (now - (statusLogAt.get(logKey) ?? 0) >= STATUS_LOG_WINDOW_MS) {
      statusLogAt.set(logKey, now);
      if (statusLogAt.size > 100) statusLogAt.clear();
      console.warn("[cm-rt-private-broadcast] channel join failed — realtime-js will rejoin with backoff", {
        scope: args.scope,
        status,
        reason: err?.message ?? null,
        hasRealtimeToken: Boolean(args.sb.realtime.accessTokenValue),
      });
    }
    if (now - lastAuthResyncAt >= AUTH_RESYNC_MIN_GAP_MS) {
      lastAuthResyncAt = now;
      /** 다음 rejoin 이 anon/만료 JWT 가 아닌 현재 세션 토큰으로 가도록 join payload 갱신 */
      void syncSupabaseRealtimeAuthFromSession(args.sb);
    }
  };
}

/**
 * 비공개 채널 join 전에 Realtime 소켓에 사용자 JWT 가 없으면 세션에서 즉시 맞춘다.
 * (없어도 join 은 실패 후 rejoin 으로 회복되지만, 첫 join 성공률을 높인다.)
 */
export function primeMessengerPrivateRealtimeAuth(sb: SupabaseClient): void {
  const current = sb.realtime.accessTokenValue;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  if (current && current !== anon) return;
  void syncSupabaseRealtimeAuthFromSession(sb);
}

/**
 * 상대(또는 임의) 비공개 토픽으로 REST broadcast — 사용자 JWT 로 INSERT 정책 검사.
 * 실패는 throw 하지 않고 결과 반환 + 경고 로그.
 */
export async function sendMessengerPrivateBroadcastFromClient(args: {
  sb: SupabaseClient;
  topic: string;
  event: string;
  payload: Record<string, unknown>;
  scope: string;
  timeoutMs?: number;
}): Promise<RealtimeRestBroadcastResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  let token = "";
  try {
    const {
      data: { session },
    } = await args.sb.auth.getSession();
    token = session?.access_token?.trim() ?? "";
  } catch {
    token = "";
  }
  let result: RealtimeRestBroadcastResult;
  if (!url || !anon) {
    result = { ok: false, status: 0, error: "supabase_env_missing" };
  } else if (!token) {
    result = { ok: false, status: 0, error: "no_session" };
  } else {
    result = await postRealtimeBroadcastRest({
      supabaseUrl: url,
      apiKey: anon,
      bearerToken: token,
      messages: [{ topic: args.topic, event: args.event, payload: args.payload, private: true }],
      timeoutMs: args.timeoutMs,
    });
  }
  if (!result.ok) {
    const now = Date.now();
    const logKey = `send:${args.scope}:${result.status}`;
    if (now - (statusLogAt.get(logKey) ?? 0) >= STATUS_LOG_WINDOW_MS) {
      statusLogAt.set(logKey, now);
      console.warn("[cm-rt-private-broadcast] client send failed", {
        scope: args.scope,
        event: args.event,
        status: result.status,
        error: result.error,
      });
    }
  }
  return result;
}
