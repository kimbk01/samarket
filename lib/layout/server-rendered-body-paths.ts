import { isHomeSurfacePath } from "@/lib/layout/resolve-main-surface";

/**
 * P1 (Owner 「P1 진행」 2026-11-12 · docs/audit/ssr-page-body-first-paint-design-2026-11-12.md §3):
 * 페이지 본문을 서버·hydration 첫 렌더부터 그리는 화면 허용 목록. 목록 밖은 C 단계 C2 그대로
 * (서버·첫 렌더는 회색 줄 `MainShellDocumentLoading`, 본문은 hydration 이후).
 *
 * 홈(`/`·`/home`)만 — 본문 첫 렌더가 서버와 같다(회원 확인 중·배너 미선택·저장값 읽기는 효과 안)는 것을
 * 로컬 운영 빌드에서 hydration 불일치 0으로 확인했다(설계 §6). 다른 화면은 화면별 확인·승인 뒤에만 추가한다.
 */
export function isServerRenderedBodyPath(pathname: string | null | undefined): boolean {
  /** 주소를 모르면(null) 허용하지 않는다 — `isHomeSurfacePath` 는 빈 값을 `/` 로 본다 */
  if (!pathname) return false;
  return isHomeSurfacePath(pathname);
}
