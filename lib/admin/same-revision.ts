/**
 * 진입 감사 재감사 — 낙관적 동시성 판(`updated_at`) 비교. 시각 값으로 비교한다:
 * 저장 때 돌려준 `…Z` 와 DB(PostgREST)가 돌려주는 `…+00:00` 은 같은 시각인데 글자로는 달라 거짓 409 가 났다.
 */
export function sameRevision(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return (a ?? null) === (b ?? null);
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  return Number.isFinite(ta) && Number.isFinite(tb) ? ta === tb : a === b;
}
