/**
 * browse 강제 재검증 쿼리 — `fresh=1` 을 파라미터로 정확히 추가.
 * 입력은 `URLSearchParams.toString()` 결과(선행 `?` 없음)·선행 `?` 있는 문자열 모두 허용, 출력은 선행 `?` 없음.
 * 클라이언트 TTL 우회(`browseQueryBypassesCache`)·서버 route cache 우회가 같은 키를 읽는다.
 */
export function withStoresBrowseFreshParam(qs: string): string {
  const sp = new URLSearchParams(qs.startsWith("?") ? qs.slice(1) : qs);
  sp.set("fresh", "1");
  return sp.toString();
}
