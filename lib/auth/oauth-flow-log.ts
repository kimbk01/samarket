import {
  getCapacitorNativeDiagnostics,
  isCapacitorNativePlatform,
  readDibayAppPlatformMarker,
} from "@/lib/platform/capacitor-native";
import type { OAuthRedirectMismatchReason } from "@/lib/auth/oauth-redirect-contract";

function safeConsoleInfo(label: string, payload?: Record<string, unknown>): void {
  if (typeof console === "undefined") return;
  if (payload) {
    console.info(label, payload);
    return;
  }
  console.info(label);
}

/** OAuth 시작 직전 — provider / redirectTo / native 감지 스냅샷 */
export function logOAuthSignInStart(provider: string, redirectTo: string): void {
  safeConsoleInfo("[oauth] provider", { value: provider });
  const diagnostics = getCapacitorNativeDiagnostics();
  safeConsoleInfo("[oauth] isNative", {
    value: isCapacitorNativePlatform(),
    ...diagnostics,
  });
  safeConsoleInfo("[oauth] redirectTo", { value: redirectTo });
  safeConsoleInfo("[oauth] platformMarker", {
    value: readDibayAppPlatformMarker(),
  });
}

/** Supabase authorize URL 에서 redirect_to 추출 (디코드) */
export function extractRedirectToFromAuthorizeUrl(authorizeUrl: string): string | null {
  const trimmed = authorizeUrl.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const raw = url.searchParams.get("redirect_to");
    if (!raw) return null;
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  } catch {
    return null;
  }
}

export function extractAuthorizeHost(authorizeUrl: string): string | null {
  const trimmed = authorizeUrl.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).host;
  } catch {
    return null;
  }
}

export function logOAuthAuthorizeUrl(authorizeUrl: string, provider?: string): void {
  const trimmed = authorizeUrl.trim();
  if (!trimmed) return;
  const redirectTo = extractRedirectToFromAuthorizeUrl(trimmed);
  const authorizeHost = extractAuthorizeHost(trimmed);
  if (provider) {
    safeConsoleInfo("[oauth] provider", { value: provider });
  }
  safeConsoleInfo("[oauth] redirect_to", { value: redirectTo });
  safeConsoleInfo("[oauth] authorizeHost", { value: authorizeHost });
}

export function logOAuthRedirectToMissing(provider: string, authorizeUrl: string): void {
  safeConsoleInfo("[oauth] redirect_to_missing", {
    provider,
    authorizeHost: extractAuthorizeHost(authorizeUrl),
  });
}

export function logOAuthRedirectMismatch(
  requestedRedirectTo: string,
  authorizeRedirectTo: string | null,
  reason: OAuthRedirectMismatchReason,
): void {
  safeConsoleInfo("[oauth] redirect_mismatch", {
    requested: requestedRedirectTo,
    authorizeRedirectTo,
    reason,
  });
}

export function logAppUrlOpenMounted(payload: Record<string, unknown>): void {
  safeConsoleInfo("[appUrlOpen] mounted", payload);
}

export function logAppUrlOpenEvent(url: string, bridgedUrl: string | null): void {
  safeConsoleInfo("[appUrlOpen] url", { value: url });
  safeConsoleInfo("[appUrlOpen] bridgedUrl", { value: bridgedUrl });
}

export function logAppUrlOpenBridgeFailed(url: string): void {
  safeConsoleInfo("[appUrlOpen] bridge_failed", { value: url });
}

export function logAppUrlOpenBrowserClose(ok: boolean): void {
  safeConsoleInfo(ok ? "[appUrlOpen] browser_close_ok" : "[appUrlOpen] browser_close_failed");
}

export function logOAuthBrowserOpenStart(url: string): void {
  safeConsoleInfo("[oauth] browser_open_start", { url: url.trim() });
}

export function logOAuthBrowserOpenSuccess(): void {
  safeConsoleInfo("[oauth] browser_open_ok");
}

export function logOAuthBrowserOpenFailed(reason: string, err?: unknown): void {
  safeConsoleInfo("[oauth] browser_open_failed", {
    reason,
    message: err instanceof Error ? err.message : String(err ?? ""),
  });
}

export function logOAuthLaunchNavigation(url: string): void {
  safeConsoleInfo("[oauth] launch_navigation", { url: url.trim() });
}

export function logOAuthLaunchSurfaceConfirmed(source: string): void {
  safeConsoleInfo("[oauth] launch_surface_confirmed", { source });
}

export function logOAuthLaunchSurfaceMissing(timeoutMs: number): void {
  safeConsoleInfo("[oauth] launch_surface_missing", { timeoutMs });
}
