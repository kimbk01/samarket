const NATIVE_OAUTH_CALLBACK_PENDING_KEY = "dibay_native_oauth_callback_pending";
const NATIVE_OAUTH_CALLBACK_PROVIDER_KEY = "dibay_native_oauth_callback_provider";

function safeConsoleInfo(label: string, payload?: Record<string, unknown>): void {
  if (typeof console === "undefined") return;
  if (payload) {
    console.info(label, payload);
    return;
  }
  console.info(label);
}

function readPendingProvider(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const provider = window.sessionStorage?.getItem(NATIVE_OAUTH_CALLBACK_PROVIDER_KEY)?.trim();
    return provider || null;
  } catch {
    return null;
  }
}

function consumePendingExchange(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const pending = window.sessionStorage?.getItem(NATIVE_OAUTH_CALLBACK_PENDING_KEY);
    if (pending !== "1") return false;
    window.sessionStorage.removeItem(NATIVE_OAUTH_CALLBACK_PENDING_KEY);
    return true;
  } catch {
    return false;
  }
}

function clearPendingExchange(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage?.removeItem(NATIVE_OAUTH_CALLBACK_PENDING_KEY);
    window.sessionStorage?.removeItem(NATIVE_OAUTH_CALLBACK_PROVIDER_KEY);
  } catch {
    // ignore
  }
}

/** appUrlOpen → WebView callback 브릿지 직전 — exchange 결과 추적용 */
export function markNativeOAuthCallbackExchangePending(provider?: string | null): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage?.setItem(NATIVE_OAUTH_CALLBACK_PENDING_KEY, "1");
    const normalized = String(provider ?? "").trim();
    if (normalized) {
      window.sessionStorage?.setItem(NATIVE_OAUTH_CALLBACK_PROVIDER_KEY, normalized);
    }
  } catch {
    // ignore
  }
}

export function logNativeOAuthCallbackExchangeSuccess(): void {
  if (!consumePendingExchange()) return;
  const provider = readPendingProvider();
  clearPendingExchange();
  safeConsoleInfo("[authCallback] exchange_success", { provider });
}

/** /login auth_error 등 — exchange 실패 */
export function logNativeOAuthCallbackExchangeFailed(reason?: string): void {
  if (!consumePendingExchange()) return;
  const provider = readPendingProvider();
  clearPendingExchange();
  safeConsoleInfo("[authCallback] exchange_failed", {
    provider,
    reason: reason?.trim() || "unknown",
  });
}
