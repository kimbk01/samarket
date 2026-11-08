export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * C3 — 현재 운영 웹 배포 버전 (docs/audit/app-entry-resume-stabilization-plan-2026-11-08.md §4 C3).
 *
 * 앱이 복귀할 때 자기 번들 버전(`NEXT_PUBLIC_WEB_DEPLOY_SHA`)과 비교해, 새 배포가 있으면 안전한 순간에만 1회 새로고침한다.
 * DB·인증·쿠키 미사용, 회원 게이트 제외 (`isMemberReadExemptPath`). 캐시 금지 — 항상 지금 배포를 답한다.
 */
export function GET(): Response {
  const sha = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").trim().slice(0, 7) || null;
  return Response.json(
    { sha },
    { headers: { "cache-control": "no-store, max-age=0" } }
  );
}
