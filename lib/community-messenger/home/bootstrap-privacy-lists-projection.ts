/**
 * 부트스트랩 `hidden` / `blocked` (숨김·차단 목록) 투영 계약.
 *
 * - `undefined` = **unknown** (이 페이로드는 목록을 모름) → 클라 merge(`bootstrap_apply_full`)가 기존 base 를 유지한다.
 * - 배열(빈 배열 포함) = **authoritative** 전체 목록 → base 를 대체한다.
 *
 * lite 첫 페인트는 방 참가자+viewer 프로필만 hydrate 한다(perf lock: social-graph `profiles.in` 금지).
 * 차단 상대의 1:1 방은 `blocked_hidden` 이라 참가자 목록에 없으므로, 필터된 부분집합을 그대로 내보내면
 * 클라가 "차단 목록 = 일부" 로 덮어써 목록이 비거나 사람이 빠진다. 그래서 하나라도 hydrate 못 하면 unknown.
 * 추가 쿼리 없음 — 기존 `.filter(Boolean)` 과 동일한 O(n) map lookup.
 */
export function projectBootstrapPrivacyListOrUnknown<T>(
  ids: readonly string[],
  profileById: ReadonlyMap<string, T>,
  /** social graph 원천이 확정(캐시 hit·full fetch)인지. empty/miss 면 무조건 unknown. */
  socialSourceKnown: boolean
): T[] | undefined {
  if (!socialSourceKnown) return undefined;
  const out: T[] = [];
  for (const id of ids) {
    const profile = profileById.get(id);
    if (profile === undefined) return undefined;
    out.push(profile);
  }
  return out;
}
