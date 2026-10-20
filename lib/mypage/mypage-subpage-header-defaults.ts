/**
 * 내정보 하위 화면 헤더 기본값 (설계서 v3 §12 · 부록 C §3.2 H3).
 * `MySubpageHeader` 를 직접 쓰는 화면도 `MyScreen` 과 같이 우측 기본 종(알림함) 1개를 갖는다.
 * 화면 고유 동작(검색·전체 삭제 등)이 있으면 그 아이콘이 종을 대체한다 (우측 최대 1개).
 */
export function isMypageSubpageHeaderPath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").split("?")[0]?.replace(/\/+$/, "") ?? "";
  return p.startsWith("/mypage/");
}
