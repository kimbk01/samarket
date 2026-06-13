import type { OAuthProvider } from "@/lib/auth/auth-providers";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";

type SupabaseOAuthProvider = Exclude<OAuthProvider, "naver">;

/**
 * Google OAuth `disallowed_useragent` 는 WebView·SNS 인앱 브라우저 등
 * 임베디드 UA 에서 authorize URL 을 열 때 발생한다.
 */
export function isEmbeddedOAuthUserAgent(
  userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "",
): boolean {
  if (!userAgent) return false;

  if (isCapacitorNativePlatform()) return true;

  if (typeof window !== "undefined" && (window as Window & { ReactNativeWebView?: unknown }).ReactNativeWebView) {
    return true;
  }

  if (/FBAN|FBAV|Instagram|Line\/|KAKAOTALK|Twitter|Snapchat|LinkedInApp|GSA\/|DuckDuckGo/i.test(userAgent)) {
    return true;
  }

  if (/; wv\)|\bWebView\b/i.test(userAgent)) return true;

  const iPadOs13Plus =
    typeof navigator !== "undefined" &&
    navigator.platform === "MacIntel" &&
    navigator.maxTouchPoints > 1;
  const iosDevice = /iPad|iPhone|iPod/i.test(userAgent) || iPadOs13Plus;
  if (iosDevice && !/Safari|CriOS|FxiOS|EdgiOS/i.test(userAgent)) return true;

  return false;
}

/**
 * Web embedded UA 에서 Google authorize URL 을 외부 브라우저로 탈출.
 */
export function launchGoogleOAuthAuthorizeUrl(url: string): void {
  const authorizeUrl = url.trim();
  if (!authorizeUrl || typeof window === "undefined") return;

  if (isEmbeddedOAuthUserAgent()) {
    const anchor = document.createElement("a");
    anchor.href = authorizeUrl;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    const opened = window.open(authorizeUrl, "_blank", "noopener,noreferrer");
    if (opened) return;
  }

  window.location.replace(authorizeUrl);
}

async function launchNativeOAuthAuthorizeUrl(authorizeUrl: string): Promise<boolean> {
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url: authorizeUrl });
    return true;
  } catch {
    return false;
  }
}

function launchExternalBrowserFallback(authorizeUrl: string): void {
  const anchor = document.createElement("a");
  anchor.href = authorizeUrl;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  const opened = window.open(authorizeUrl, "_blank", "noopener,noreferrer");
  if (!opened) {
    window.location.assign(authorizeUrl);
  }
}

/**
 * Supabase OAuth authorize URL launch — provider·환경별 정책.
 * - native: Custom Tab (@capacitor/browser) — Google/Kakao/Apple 공통
 * - web embedded Google: 외부 브라우저 탈출
 * - web 일반: top-level navigation
 */
export async function launchOAuthAuthorizeUrl(
  provider: SupabaseOAuthProvider,
  url: string,
): Promise<void> {
  const authorizeUrl = url.trim();
  if (!authorizeUrl || typeof window === "undefined") return;

  if (isCapacitorNativePlatform()) {
    const opened = await launchNativeOAuthAuthorizeUrl(authorizeUrl);
    if (opened) return;
    launchExternalBrowserFallback(authorizeUrl);
    return;
  }

  if (provider === "google") {
    launchGoogleOAuthAuthorizeUrl(authorizeUrl);
    return;
  }

  window.location.assign(authorizeUrl);
}
