/**
 * 홈·거래 등 다른 탭에 있을 때 동네 피드 API를 낮은 우선순위로 선요청해,
 * 커뮤니티 탭 진입 시 DNS·TLS·응답이 이미 워밍된 상태에 가깝게 만듦.
 * (브라우저 캐시 정책 + 서버 Cache-Control과 함께 동작)
 */

let lastWarmedUrl: string | null = null;
let lastWarmedAt = 0;
/** 동일 URL 과도 워밍 방지 */
const MIN_INTERVAL_MS = 90_000;

export function warmPhilifeNeighborhoodFeedByUrl(
  feedUrl: string,
  opts?: { noStore?: boolean }
): void {
  if (typeof window === "undefined" || !feedUrl) return;
  const now = Date.now();
  if (feedUrl === lastWarmedUrl && now - lastWarmedAt < MIN_INTERVAL_MS) return;
  lastWarmedUrl = feedUrl;
  lastWarmedAt = now;

  const run = () => {
    void fetch(feedUrl, {
      credentials: "include",
      priority: "low",
      ...(opts?.noStore ? { cache: "no-store" as RequestCache } : {}),
    }).catch(() => {});
  };

  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(run, { timeout: 2500 });
  } else {
    setTimeout(run, 400);
  }
}
