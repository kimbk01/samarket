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

/** Logcat / Chrome Inspect — oauth 필터용 구조화 로그 */
export function logOAuthNativeEvent(event: string, detail: Record<string, unknown> = {}): void {
  console.error(`[oauth] ${event}`, detail);
}
