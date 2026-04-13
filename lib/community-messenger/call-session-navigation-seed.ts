import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

const KEY = "samarket.cm.call_session_seed.v1";

/**
 * 통화 발신 직후 `router.push` 시 RSC·클라이언트 GET 보다 먼저 세션을 알 수 있게 sessionStorage 에 두어
 * 통화 화면 첫 페인트·로딩 스피너를 줄인다.
 */
export function primeCommunityMessengerCallNavigationSeed(
  sessionId: string,
  session: CommunityMessengerCallSession
): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({ sessionId, session, at: Date.now() })
    );
  } catch {
    /* quota / private mode */
  }
}

export function consumeCommunityMessengerCallNavigationSeed(
  sessionId: string
): CommunityMessengerCallSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as { sessionId?: string; session?: CommunityMessengerCallSession };
    if (!o.session || o.sessionId !== sessionId) return null;
    window.sessionStorage.removeItem(KEY);
    return o.session;
  } catch {
    return null;
  }
}
