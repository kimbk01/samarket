/**
 * 서버 전용 — 메신저 **비공개(private) Realtime 토픽** 발행.
 *
 * 서비스 롤 키로 Realtime REST broadcast 를 호출한다(WebSocket join 불필요 → 첫 join 대기·join 실패 시 조용한 drop 제거).
 * 비공개 토픽 수신은 `realtime.messages` SELECT 정책(참가자/본인)으로만 허용된다 —
 * `supabase/migrations/20270422120000_cm_realtime_private_broadcast_authorization.sql`.
 *
 * 클라이언트 번들에서 import 금지(서비스 롤 키).
 */
import { requireSupabaseEnv } from "@/lib/env/runtime";
import {
  postRealtimeBroadcastRest,
  type RealtimeRestBroadcastMessage,
  type RealtimeRestBroadcastResult,
} from "@/lib/supabase/realtime-broadcast-rest";

const FAILURE_LOG_WINDOW_MS = 60_000;
const failureLogAt = new Map<string, number>();

function logPrivateBroadcastFailure(scope: string, topics: string[], result: RealtimeRestBroadcastResult): void {
  if (result.ok) return;
  const key = `${scope}:${result.status}:${result.error}`;
  const now = Date.now();
  const last = failureLogAt.get(key) ?? 0;
  if (now - last < FAILURE_LOG_WINDOW_MS) return;
  failureLogAt.set(key, now);
  if (failureLogAt.size > 200) failureLogAt.clear();
  console.warn("[cm-rt-private-broadcast] server publish failed", {
    scope,
    status: result.status,
    error: result.error,
    topicCount: topics.length,
    /** 토픽 접두만 — room/user id 는 로그에 남기지 않는다 */
    topicPrefixes: [...new Set(topics.map((t) => t.split(":")[0] ?? ""))],
  });
}

/**
 * 비공개 토픽 broadcast (서비스 롤). 여러 토픽을 한 요청으로 묶을 수 있다.
 * 실패는 throw 하지 않고 결과로 반환 + 경고 로그(분당 1회/원인).
 */
export async function publishMessengerPrivateBroadcastFromServer(args: {
  scope: string;
  messages: Array<Omit<RealtimeRestBroadcastMessage, "private">>;
  timeoutMs?: number;
}): Promise<RealtimeRestBroadcastResult> {
  const env = requireSupabaseEnv({ requireServiceKey: true });
  if (!env.ok) {
    const res: RealtimeRestBroadcastResult = { ok: false, status: 0, error: "supabase_env_missing" };
    logPrivateBroadcastFailure(args.scope, args.messages.map((m) => m.topic), res);
    return res;
  }
  const result = await postRealtimeBroadcastRest({
    supabaseUrl: env.url,
    apiKey: env.serviceKey,
    bearerToken: env.serviceKey,
    messages: args.messages.map((m) => ({ ...m, private: true })),
    timeoutMs: args.timeoutMs,
  });
  logPrivateBroadcastFailure(args.scope, args.messages.map((m) => m.topic), result);
  return result;
}
