/**
 * 브라우저·Node fetch → Supabase 실패 시 사용자/운영자가 조치할 수 있는 한국어 안내.
 * (특히 ENOTFOUND = 호스트 자체가 DNS에 없음 → URL/ref 오타 또는 프로젝트 삭제·이전)
 */

function collectErrorText(err: unknown, depth = 0): string {
  if (depth > 6) return "";
  if (err == null) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) {
    const cause = err.cause != null ? collectErrorText(err.cause, depth + 1) : "";
    const code =
      typeof (err as { code?: string }).code === "string"
        ? (err as { code: string }).code
        : "";
    return [err.name, err.message, code, cause].filter(Boolean).join(" ");
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export type SupabaseFetchFailureDescription = {
  /** UI에 그대로 노출 가능한 한 줄 요약 */
  userMessage: string;
  /** 개발자 콘솔·진단 JSON용 */
  code: "dns_enotfound" | "fetch_failed" | "timeout" | "unknown";
};

/**
 * 로그인·세션 등 Supabase Auth/REST 호출 실패 시 공통 문구 생성.
 */
export function describeSupabaseFetchFailure(err: unknown): SupabaseFetchFailureDescription {
  const text = collectErrorText(err);

  if (/ENOTFOUND|getaddrinfo/i.test(text)) {
    return {
      code: "dns_enotfound",
      userMessage:
        "Supabase 주소를 DNS에서 찾을 수 없습니다. .env.local의 NEXT_PUBLIC_SUPABASE_URL이 Supabase 대시보드(Settings → API → Project URL)와 한 글자까지 같은지 확인하세요. 프로젝트를 새로 만들었거나 삭제했다면 URL 전체를 다시 붙여 넣어야 합니다. (잘못된 참조(ref)이면 *.supabase.co 호스트가 존재하지 않습니다.)",
    };
  }

  if (/aborted|AbortError|timeout/i.test(text)) {
    return {
      code: "timeout",
      userMessage:
        "Supabase 연결 시간이 초과되었습니다. 네트워크·VPN·방화벽을 확인하고 다시 시도해 주세요.",
    };
  }

  if (/fetch failed|Failed to fetch|NetworkError|ECONNREFUSED|ETIMEDOUT|ECONNRESET/i.test(text)) {
    return {
      code: "fetch_failed",
      userMessage:
        "Supabase 서버에 연결하지 못했습니다. 인터넷·VPN·방화벽을 확인하고, Project URL·anon 키가 대시보드와 일치하는지 확인해 주세요.",
    };
  }

  return {
    code: "unknown",
    userMessage:
      "인증 서버와 통신하지 못했습니다. .env.local의 NEXT_PUBLIC_SUPABASE_URL·NEXT_PUBLIC_SUPABASE_ANON_KEY를 확인한 뒤 개발 서버를 재시작해 주세요.",
  };
}
