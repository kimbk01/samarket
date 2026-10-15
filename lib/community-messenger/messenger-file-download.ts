/**
 * 메신저 파일 메시지 다운로드 — Storage 공개 URL 은 cross-origin 이라 `<a download>` 가 무시된다.
 * Supabase Storage 는 `?download=<파일명>` 쿼리로 `Content-Disposition: attachment; filename=…` 을 내려주므로
 * 원본 파일명(한글 포함)으로 저장되게 URL 을 만든다.
 * Capacitor 네이티브 셸(iOS WKWebView / Android WebView)은 WebView 안에서 다운로드를 처리하지 못하므로
 * `@capacitor/browser`(SFSafariViewController / Custom Tabs)로 연다 — 신규 네이티브 코드 없음.
 */
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";

const SUPABASE_STORAGE_OBJECT_PATH = /\/storage\/v1\/object\/(public|sign|authenticated)\//;

/** Supabase Storage URL 이면 `download=<encodeURIComponent(name)>` 를 붙인다. 그 외 URL 은 그대로. */
export function buildMessengerFileDownloadUrl(publicUrl: string, fileName: string | null | undefined): string {
  const raw = String(publicUrl ?? "").trim();
  if (!raw) return raw;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return raw;
  if (!SUPABASE_STORAGE_OBJECT_PATH.test(u.pathname)) return raw;
  const name = String(fileName ?? "").trim();
  const param = `download=${encodeURIComponent(name)}`;
  // 기존 download 파라미터 제거 후 추가(이름 공백·한글은 encodeURIComponent 로 고정 인코딩)
  const kept = u.search
    .replace(/^\?/, "")
    .split("&")
    .filter((kv) => kv && !/^download(=|$)/i.test(kv));
  kept.push(param);
  return `${u.origin}${u.pathname}?${kept.join("&")}${u.hash}`;
}

/**
 * Capacitor 네이티브 셸이면 인앱 브라우저로 연다. 처리했으면 true(호출부는 기본 링크 동작을 막는다).
 * 웹이면 false — 일반 `<a href download>` 동작을 그대로 쓴다.
 */
export function openMessengerFileInNativeShellIfNeeded(url: string): boolean {
  if (!url || !isCapacitorNativePlatform()) return false;
  void (async () => {
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url });
    } catch {
      try {
        window.open(url, "_blank", "noopener,noreferrer");
      } catch {
        /* ignore */
      }
    }
  })();
  return true;
}
