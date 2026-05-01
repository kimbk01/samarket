/**
 * 같은 탭에서만 유효한 `blob:` URL 을 허용한다.
 * LAN IP(`192.168.*`)로 접속했는데 예전에 `localhost` 에서 만든 blob 이 목록에 남으면
 * 브라우저가 로드를 거부하고 콘솔·디코드 재시도로 체감이 느려질 수 있다.
 */
export function sanitizeViewerMediaUrl(url: string | null | undefined): string | null {
  const u = typeof url === "string" ? url.trim() : "";
  if (!u) return null;
  if (!u.startsWith("blob:")) return u;
  if (typeof window === "undefined") return null;
  try {
    const parsed = new URL(u);
    if (parsed.origin !== window.location.origin) return null;
    return u;
  } catch {
    return null;
  }
}
