import type { OAuthRedirectMismatchReason } from "@/lib/auth/oauth/redirect-contract";

function safeConsoleInfo(label: string, payload?: Record<string, unknown>): void {
  if (typeof console === "undefined") return;
  if (payload) {
    console.info(label, payload);
    return;
  }
  console.info(label);
}

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

export function logOAuthStartRequest(provider: string, redirectTo: string, isNative: boolean): void {
  safeConsoleInfo("[oauth] start_request", { provider, redirectTo, isNative });
}

export function logOAuthAuthorizeUrl(authorizeUrl: string, provider?: string): void {
  const trimmed = authorizeUrl.trim();
  if (!trimmed) return;
  if (provider) {
    safeConsoleInfo("[oauth] provider", { value: provider });
  }
  safeConsoleInfo("[oauth] redirect_to", {
    value: extractRedirectToFromAuthorizeUrl(trimmed),
  });
  safeConsoleInfo("[oauth] authorizeHost", { value: extractAuthorizeHost(trimmed) });
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

export function logOAuthRedirectToMissing(provider: string, authorizeUrl: string): void {
  safeConsoleInfo("[oauth] redirect_to_missing", {
    provider,
    authorizeHost: extractAuthorizeHost(authorizeUrl),
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

export function logAuthCallbackExchangeSuccess(provider?: string | null): void {
  safeConsoleInfo("[authCallback] exchange_success", { provider: provider ?? null });
}

export function logAuthCallbackExchangeFailed(reason?: string, provider?: string | null): void {
  safeConsoleInfo("[authCallback] exchange_failed", {
    provider: provider ?? null,
    reason: reason?.trim() || "unknown",
  });
}
