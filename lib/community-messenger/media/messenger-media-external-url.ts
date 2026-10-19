/**
 * C-4 — 조회 라우트 URL → 쿠키 없이 열 수 있는 짧은 서명 URL (client-safe).
 *
 * `<img>`·`<a>`(WebView 같은 오리진)은 라우트 URL 을 그대로 쓰고 302 를 따라간다.
 * 반면 네이티브 사진 저장(MessengerPhotoLibrary)·인앱 브라우저(@capacitor/browser)·Web Share 용 fetch 는
 * WebView 쿠키가 없거나 cross-context 이므로 `format=json` 으로 서명 URL 을 먼저 받아 넘긴다.
 * 라우트 URL 이 아니면 입력을 그대로 돌려준다(레거시 공개 URL·외부 URL).
 */
import {
  isMessengerMediaRouteUrl,
  MESSENGER_MEDIA_ROUTE_QUERY,
} from "@/lib/community-messenger/media/messenger-media-ref";

function absolutize(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (typeof window === "undefined" || !window.location?.origin) return url;
  return `${window.location.origin}${url.startsWith("/") ? "" : "/"}${url}`;
}

export async function resolveMessengerMediaUrlForExternalUse(
  url: string,
  fetchImpl?: typeof fetch
): Promise<string> {
  const raw = String(url ?? "").trim();
  if (!isMessengerMediaRouteUrl(raw)) return raw;
  const jsonUrl = `${raw}&${MESSENGER_MEDIA_ROUTE_QUERY.format}=json`;
  try {
    const res = fetchImpl
      ? await fetchImpl(jsonUrl, { credentials: "include", cache: "no-store" })
      : await fetch(jsonUrl, { credentials: "include", cache: "no-store" });
    if (res.ok) {
      const body = (await res.json().catch(() => null)) as { ok?: boolean; url?: unknown } | null;
      if (body?.ok && typeof body.url === "string" && /^https?:\/\//i.test(body.url)) return body.url;
    }
  } catch {
    /* 아래 폴백 */
  }
  return absolutize(raw);
}

export async function resolveMessengerMediaUrlsForExternalUse(
  urls: string[],
  fetchImpl?: typeof fetch
): Promise<string[]> {
  return Promise.all(urls.map((u) => resolveMessengerMediaUrlForExternalUse(u, fetchImpl)));
}
