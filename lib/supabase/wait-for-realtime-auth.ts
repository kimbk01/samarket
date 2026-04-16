import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 쿠키 세션 반영이 느린 환경에서도 `postgres_changes` 구독 전에 토큰을 잡기 위한 상한.
 * `getSession` 폴링으로 대부분 수백 ms 안에 끝나므로 8s 는 최후의 안전망이다.
 */
const DEFAULT_MAX_WAIT_MS = 8_000;
/** `onAuthStateChange` 전에 쿠키에서 세션이 올라오는 경우가 많아 짧은 간격으로만 폴링 */
const SESSION_POLL_INTERVAL_MS = 120;
const SESSION_POLL_WINDOW_MS = 3_200;

async function applyRealtimeAuthToken(sb: SupabaseClient, accessToken: string | null | undefined): Promise<boolean> {
  const token = typeof accessToken === "string" ? accessToken.trim() : "";
  if (!token) return false;
  try {
    await sb.realtime.setAuth(token);
    return true;
  } catch {
    return false;
  }
}

/**
 * 현재 브라우저 세션의 access_token 으로 Realtime JWT 를 다시 맞춘다.
 * - `channel.subscribe()` 직전에 한 번 맞춰도, WS 핸드셰이크 타이밍에 소켓이 예전(anon) 클레임을
 *   쓰는 레이스가 있어 **SUBSCRIBED 직후**에 한 번 더 호출하는 용도.
 * - `waitForSupabaseRealtimeAuth` 가 false 로 끝난 뒤 `onAuthStateChange` 만 기다리면,
 *   이미 세션이 있는 탭에서 이벤트가 재생되지 않아 **구독이 영구 지연**될 수 있어 즉시 `getSession` 경로와 병행한다.
 */
export async function syncSupabaseRealtimeAuthFromSession(sb: SupabaseClient): Promise<boolean> {
  try {
    const {
      data: { session },
    } = await sb.auth.getSession();
    return await applyRealtimeAuthToken(sb, session?.access_token);
  } catch {
    return false;
  }
}

/**
 * Realtime `postgres_changes` 는 연결에 붙은 JWT 로 RLS 를 평가한다.
 * `@supabase/ssr` 브라우저 클라이언트는 쿠키에서 세션을 비동기로 채우므로,
 * `channel.subscribe()` 직전에 `access_token` 이 없으면 `onAuthStateChange` 와
 * **짧은 `getSession` 폴링**으로 첫 유효 세션이 올 때까지 대기한다.
 *
 * 그렇지 않으면 **채널은 SUBSCRIBED 인데 `auth.uid()` 가 비어** RLS SELECT 가
 * 모든 행을 막아 이벤트가 오지 않는다(UI 는 「실시간 연결됨」처럼 보일 수 있음).
 *
 * @returns 구독 직전에 `access_token` 이 있으면 true. 타임아웃까지 없으면 false — 이 경우
 *          곧바로 `postgres_changes` 를 붙이지 말고 재시도·`onAuthStateChange` 지연 구독을 권장.
 */
export async function waitForSupabaseRealtimeAuth(
  sb: SupabaseClient,
  maxWaitMs: number = DEFAULT_MAX_WAIT_MS
): Promise<boolean> {
  try {
    const {
      data: { session },
    } = await sb.auth.getSession();
    if (session?.access_token) {
      return await applyRealtimeAuthToken(sb, session.access_token);
    }
  } catch {
    /* ignore */
  }

  return await new Promise<boolean>((resolve) => {
    let finished = false;
    let subscription: { unsubscribe: () => void } | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let pollCapTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = (ok: boolean) => {
      if (finished) return;
      finished = true;
      try {
        clearTimeout(timer);
      } catch {
        /* ignore */
      }
      try {
        if (pollTimer != null) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      } catch {
        /* ignore */
      }
      try {
        if (pollCapTimer != null) {
          clearTimeout(pollCapTimer);
          pollCapTimer = null;
        }
      } catch {
        /* ignore */
      }
      try {
        subscription?.unsubscribe();
      } catch {
        /* ignore */
      }
      resolve(ok);
    };

    const timer = setTimeout(() => {
      void sb.auth
        .getSession()
        .then(async ({ data: { session } }) => {
          finish(await applyRealtimeAuthToken(sb, session?.access_token));
        })
        .catch(() => finish(false));
    }, Math.max(200, maxWaitMs));

    pollTimer = setInterval(() => {
      void sb.auth
        .getSession()
        .then(async ({ data: { session } }) => {
          if (session?.access_token && (await applyRealtimeAuthToken(sb, session.access_token))) finish(true);
        })
        .catch(() => {
          /* ignore */
        });
    }, SESSION_POLL_INTERVAL_MS);

    pollCapTimer = setTimeout(() => {
      if (pollTimer != null) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }, SESSION_POLL_WINDOW_MS);

    const { data } = sb.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        void applyRealtimeAuthToken(sb, session.access_token).then((ok) => {
          if (ok) finish(true);
        });
      }
    });
    subscription = data.subscription;
  });
}
