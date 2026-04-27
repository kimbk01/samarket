import { clearBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";
import { resetMessengerNotificationSurfacesAfterSignOut } from "@/lib/community-messenger/notifications/messenger-notification-surfaces-reset";
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";
import { invalidateMeProfileDedupedCache } from "@/lib/profile/fetch-me-profile-deduped";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * 로그아웃은 서버 응답을 기다리느라 UI가 멈추면 안 된다.
 * - 클라이언트 캐시·Supabase 로컬 세션을 먼저 비워 **즉시 로그아웃 상태**로 만든다.
 * - 서버 측 active_session_id·user_sessions 레지스트리 정리는
 *   `keepalive: true` 로 백그라운드에 던져 페이지 전환 후에도 끝나게 한다.
 */

type LogoutResult =
  | { ok: true; serverWarning?: string | null }
  | { ok: false; message: string };

const SUPABASE_LOCAL_SIGNOUT_TIMEOUT_MS = 1_500;
const SERVER_LOGOUT_TIMEOUT_MS = 5_000;

function normalizeLogoutErrorMessage(raw: unknown): string {
  const message = String(raw ?? "").trim();
  return message || "로그아웃 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.";
}

async function raceWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const fallback = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([promise, fallback]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function reportServerLogoutInBackground(): Promise<string | null> {
  try {
    const res = await fetchWithTimeout("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      keepalive: true,
      timeoutMs: SERVER_LOGOUT_TIMEOUT_MS,
    });
    const payload = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string }
      | null;
    if (!res.ok || payload?.ok !== true) {
      return normalizeLogoutErrorMessage(payload?.error);
    }
    return null;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return "서버 로그아웃 응답이 지연되어 백그라운드에서 정리합니다.";
    }
    return "서버 로그아웃 응답을 받지 못했습니다. 다음 로그인 시 자동으로 정리됩니다.";
  }
}

export async function performClientLogout(): Promise<LogoutResult> {
  if (typeof window === "undefined") {
    return {
      ok: false,
      message: "브라우저 환경에서만 로그아웃을 실행할 수 있습니다.",
    };
  }

  invalidateMeProfileDedupedCache();
  clearBootstrapCache();
  resetMessengerNotificationSurfacesAfterSignOut();

  const supabase = getSupabaseClient();
  if (supabase) {
    /**
     * `scope: "local"` 은 Supabase 서버 호출 없이 브라우저의
     * sb-*-auth-token 쿠키와 로컬 세션 저장소만 비운다.
     * 글로벌 signOut 은 서버 측 logout API 가 백그라운드에서 처리한다.
     */
    await raceWithTimeout(
      supabase.auth
        .signOut({ scope: "local" })
        .then(() => undefined)
        .catch(() => undefined),
      SUPABASE_LOCAL_SIGNOUT_TIMEOUT_MS
    );
  }

  // Server-side registry/session cookie cleanup는 page 이탈 후에도 끝나도록
  // keepalive 로 백그라운드 송출. 결과는 UI 흐름을 막지 않는다.
  void reportServerLogoutInBackground().catch(() => {
    /* best-effort: 로컬은 이미 로그아웃됨 */
  });

  return { ok: true, serverWarning: null };
}
