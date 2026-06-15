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

function resolveOAuthNativeLogLevel(event: string): "info" | "warn" | "error" {
  if (/(^|_)(failed|failure|throw|error|blocked|missing|conflict|aborted)(_|$)/i.test(event)) {
    return "error";
  }
  if (/(exhausted|timeout|ignored|skipped|fallback)/i.test(event)) {
    return "warn";
  }
  return "info";
}

/** Logcat / Chrome Inspect — `[oauth]` 필터용 구조화 로그 (dev overlay 오탐 방지: 성공은 info) */
export function logOAuthNativeEvent(event: string, detail: Record<string, unknown> = {}): void {
  const payload = formatOAuthNativeLogDetail(detail);
  const line = `[oauth] ${event} ${payload}`;
  const level = resolveOAuthNativeLogLevel(event);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.info(line);
}
