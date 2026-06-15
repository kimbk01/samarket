/**
 * Capacitor Android/iOS WebView `server.url` — Vercel 프로덕션 origin 단일 정의.
 * APK는 Next 번들을 내장하지 않고 이 HTTPS origin 을 로드한다.
 */
export const DIBAY_PRODUCTION_SITE_ORIGIN = "https://samarket.vercel.app";

/** Capacitor server.url — query·hash 제거 (Web Message Listener origin 규칙) */
export function normalizeCapacitorServerUrl(url: string): string {
  const trimmed = url.trim().replace(/\/$/, "");
  try {
    const parsed = new URL(trimmed);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return trimmed.split("?")[0].split("#")[0];
  }
}

/** capacitor.config.ts · cap sync — CAPACITOR_SERVER_URL → NEXT_PUBLIC_SITE_URL → 프로덕션 기본 */
export function resolveCapacitorServerUrlFromEnv(
  env: Record<string, string | undefined> = process.env,
): string {
  const raw =
    env.CAPACITOR_SERVER_URL?.trim() ||
    env.NEXT_PUBLIC_SITE_URL?.trim() ||
    DIBAY_PRODUCTION_SITE_ORIGIN;
  return normalizeCapacitorServerUrl(raw);
}
