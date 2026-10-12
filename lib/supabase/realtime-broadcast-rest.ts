/**
 * Supabase Realtime **REST broadcast** (`POST /realtime/v1/api/broadcast`) — 서버·브라우저 공용(런타임 import 없음).
 *
 * - `private: true` 메시지는 Realtime Authorization(`realtime.messages` RLS INSERT 정책)으로 검사된다.
 *   서비스 롤 키로 호출하면 RLS 를 우회한다(서버 발행 전용). 사용자 JWT 로 호출하면 INSERT 정책이 적용된다.
 * - WebSocket join(최대 수 초 대기)이 필요 없고, 실패 시 HTTP status 로 원인을 알 수 있다(조용한 drop 금지).
 * - 정책: `supabase/migrations/20270422120000_cm_realtime_private_broadcast_authorization.sql`,
 *   문서: `docs/messenger-realtime-policy.md`「Realtime 비공개 토픽(Authorization)」.
 */

export type RealtimeRestBroadcastMessage = {
  /** `realtime:` 접두 없는 토픽 (예: `community-messenger-room-bump:<roomId>`) */
  topic: string;
  event: string;
  payload: Record<string, unknown>;
  /** 기본 true — 메신저 토픽은 모두 비공개 채널 */
  private?: boolean;
};

export type RealtimeRestBroadcastResult =
  | { ok: true; status: number }
  | { ok: false; status: number; error: string };

const DEFAULT_TIMEOUT_MS = 5_000;

export function realtimeBroadcastRestEndpoint(supabaseUrl: string): string {
  return `${supabaseUrl.trim().replace(/\/+$/, "")}/realtime/v1/api/broadcast`;
}

export async function postRealtimeBroadcastRest(args: {
  supabaseUrl: string;
  apiKey: string;
  /** 서버: 서비스 롤 키 · 브라우저: 사용자 access_token */
  bearerToken: string;
  messages: RealtimeRestBroadcastMessage[];
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<RealtimeRestBroadcastResult> {
  const messages = args.messages
    .filter((m) => m && typeof m.topic === "string" && m.topic.trim() && typeof m.event === "string" && m.event)
    .map((m) => ({
      topic: m.topic.trim(),
      event: m.event,
      payload: m.payload ?? {},
      private: m.private !== false,
    }));
  if (messages.length === 0) return { ok: false, status: 0, error: "no_messages" };
  const url = args.supabaseUrl?.trim();
  const apiKey = args.apiKey?.trim();
  const bearer = args.bearerToken?.trim();
  if (!url || !apiKey || !bearer) return { ok: false, status: 0, error: "missing_credentials" };

  const doFetch = args.fetchImpl ?? (typeof fetch === "function" ? fetch : null);
  if (!doFetch) return { ok: false, status: 0, error: "fetch_unavailable" };

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => {
        try {
          controller.abort();
        } catch {
          /* ignore */
        }
      }, Math.max(500, args.timeoutMs ?? DEFAULT_TIMEOUT_MS))
    : null;
  try {
    const res = await doFetch(realtimeBroadcastRestEndpoint(url), {
      method: "POST",
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages }),
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (res.status === 202 || res.ok) {
      try {
        await res.body?.cancel();
      } catch {
        /* ignore */
      }
      return { ok: true, status: res.status };
    }
    let error = res.statusText || `http_${res.status}`;
    try {
      const body = (await res.json()) as { error?: unknown; message?: unknown } | null;
      const msg = body && (typeof body.error === "string" ? body.error : typeof body.message === "string" ? body.message : "");
      if (msg) error = msg;
    } catch {
      /* non-JSON body */
    }
    return { ok: false, status: res.status, error };
  } catch (e) {
    const name = e && typeof e === "object" && "name" in e ? String((e as { name?: unknown }).name) : "";
    return { ok: false, status: 0, error: name === "AbortError" ? "timeout" : e instanceof Error ? e.message : "fetch_failed" };
  } finally {
    if (timer != null) clearTimeout(timer);
  }
}
