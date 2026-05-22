import { describeSupabaseFetchFailure } from "@/lib/supabase/describe-supabase-fetch-failure";

export type MeStoresQueryFailure = {
  /** API·캐시에 넣을 짧은 코드 */
  errorCode: string;
  /** 서버 로그 한 줄 */
  logLine: string;
  isNetworkFailure: boolean;
};

/** PostgREST·fetch 실패를 로그·클라이언트 코드로 정규화 (`console.error`에 `{}`만 찍히는 것 방지) */
export function resolveSupabaseQueryFailure(error: unknown): MeStoresQueryFailure {
  if (error == null) {
    return { errorCode: "db_error", logLine: "db_error", isNetworkFailure: false };
  }

  const o =
    typeof error === "object" && error !== null ? (error as Record<string, unknown>) : { message: String(error) };
  const message = String(o.message ?? "").trim();
  const details = String(o.details ?? "").trim();
  const hint = String(o.hint ?? "").trim();
  const code = String(o.code ?? "").trim();
  const combined = [message, details, hint, code].filter(Boolean).join(" ");

  const isNetworkFailure = /fetch failed|ENOTFOUND|getaddrinfo|ECONNREFUSED|ETIMEDOUT|ECONNRESET|Failed to fetch/i.test(
    combined
  );

  if (isNetworkFailure) {
    const d = describeSupabaseFetchFailure(error);
    const errorCode = d.code === "dns_enotfound" ? "supabase_dns_enotfound" : "supabase_unreachable";
    const core = message || details || "fetch failed";
    return {
      errorCode,
      logLine: `${core} — ${d.userMessage}`,
      isNetworkFailure: true,
    };
  }

  const logLine =
    [code && `code=${code}`, message && `message=${message}`, details && `details=${details}`, hint && `hint=${hint}`]
      .filter(Boolean)
      .join(" | ") || "db_error";

  return {
    errorCode: message || code || "db_error",
    logLine,
    isNetworkFailure: false,
  };
}

export function logSupabaseQueryFailure(scope: string, error: unknown): MeStoresQueryFailure {
  const failure = resolveSupabaseQueryFailure(error);
  const line = `[${scope}] ${failure.logLine}`;
  if (failure.isNetworkFailure && process.env.NODE_ENV === "development") {
    console.warn(line);
  } else {
    console.error(line);
  }
  return failure;
}
