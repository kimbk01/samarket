export type OAuthNativeCallbackLogPayload = {
  scheme: string | null;
  host: string | null;
  path: string | null;
  hasCode: boolean;
  hasError: boolean;
  provider: string | null;
  hasState: boolean;
  hasNext: boolean;
};

export function parseOAuthNativeCallbackLogPayload(nativeUrl: string): OAuthNativeCallbackLogPayload | null {
  try {
    const url = new URL(nativeUrl);
    const params = url.searchParams;
    return {
      scheme: url.protocol.replace(":", "") || null,
      host: url.host || null,
      path: url.pathname || null,
      hasCode: params.has("code"),
      hasError: params.has("error"),
      provider: params.get("provider"),
      hasState: params.has("state"),
      hasNext: params.has("next"),
    };
  } catch {
    return null;
  }
}

function formatOAuthNativeLogDetail(detail: Record<string, unknown>): string {
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

/** Logcat / Chrome Inspect — oauth 필터용 구조화 로그 */
export function logOAuthNativeEvent(event: string, detail: Record<string, unknown> = {}): void {
  const payload = formatOAuthNativeLogDetail(detail);
  if (event === "callback_listener_attach_exhausted") {
    console.warn(`[oauth] ${event} ${payload}`);
    return;
  }
  console.error(`[oauth] ${event} ${payload}`);
}
