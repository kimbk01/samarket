/**
 * P-3 — 친구 탭 진입 시 `GET /api/community-messenger/friends` 조건부 호출.
 *
 * 탭 진입 1회당 최대 1회. 다음 중 하나일 때만 호출한다:
 * - friends 가 비어 있음
 * - 데이터 단계가 full 이 아님(lite/critical projection)
 * - 마지막 성공이 오래됨(`MESSENGER_FRIENDS_TAB_HYDRATE_FRESH_MS`)
 *
 * 명시적 무효화(`cm.home.social_sync` 버스·social Realtime `onSocialGraphChanged`)는 이 게이트를 거치지 않고 즉시 재조회한다.
 */
export const MESSENGER_FRIENDS_TAB_HYDRATE_FRESH_MS = 60_000;

export function shouldHydrateMessengerFriendsOnTabEntry(input: {
  /** 이번 탭 진입에서 이미 호출했는가 */
  alreadyRequestedThisEntry: boolean;
  hasData: boolean;
  friendsCount: number;
  clientHydrationTier: "critical" | "full" | undefined | null;
  /** 마지막 성공 시각(ms). 성공 이력 없음 = 0 */
  lastSuccessAt: number;
  now: number;
  freshMs?: number;
}): boolean {
  if (input.alreadyRequestedThisEntry) return false;
  if (!input.hasData) return false;
  if (input.friendsCount <= 0) return true;
  if (input.clientHydrationTier !== "full") return true;
  const freshMs = input.freshMs ?? MESSENGER_FRIENDS_TAB_HYDRATE_FRESH_MS;
  if (input.lastSuccessAt <= 0) return true;
  return input.now - input.lastSuccessAt >= freshMs;
}
