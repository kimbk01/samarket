import { NextRequest } from "next/server";
import { describeSupabaseFetchFailure } from "@/lib/supabase/describe-supabase-fetch-failure";
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";
import { jsonErrorWithRequest, jsonOkWithRequest } from "@/lib/http/api-route";

export const dynamic = "force-dynamic";
/**
 * 로컬 개발용: Node(Next 서버)에서 Supabase Auth 헬스에 연결 가능한지 확인.
 * 프로덕션 빌드에서는 비활성화(프로젝트 존재·지연 정보 노출 방지).
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return jsonErrorWithRequest(req, "not_found", 404);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const hasAnon = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim());

  if (!url) {
    return jsonErrorWithRequest(
      req,
      "missing_NEXT_PUBLIC_SUPABASE_URL",
      { status: 503 },
      { hasAnonKey: hasAnon }
    );
  }

  const base = url.replace(/\/$/, "");
  const healthUrl = `${base}/auth/v1/health`;
  const started = Date.now();
  const timeoutMs = 10_000;

  try {
    const res = await fetchWithTimeout(healthUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      timeoutMs,
    });
    const latencyMs = Date.now() - started;

    if (!res.ok) {
      return jsonErrorWithRequest(req, "auth_health_non_ok", 503, {
        status: res.status,
        healthUrl,
        latencyMs,
        hasAnonKey: hasAnon,
        hint: "URL이 대시보드 프로젝트와 다르거나 프로젝트가 일시 중지(paused)된 경우가 많습니다.",
      });
    }

    return jsonOkWithRequest(req, {
      healthUrl,
      latencyMs,
      hasAnonKey: hasAnon,
      hint:
        "서버→Supabase는 정상입니다. 브라우저에서만 실패하면 VPN·방화벽·확장 프로그램을 의심하세요. anon 키 불일치는 보통 즉시 401 등으로 떨어지고 장시간 대기는 드뭅니다.",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const described = describeSupabaseFetchFailure(e);
    return jsonErrorWithRequest(req, "fetch_failed", { status: 503 }, {
      error:
        described.code === "dns_enotfound"
          ? "dns_enotfound"
          : described.code === "timeout"
            ? "timeout"
            : "fetch_failed",
      errorCode: described.code,
      message,
      userMessage: described.userMessage,
      healthUrl,
      latencyMs: Date.now() - started,
      hasAnonKey: hasAnon,
      hint: described.userMessage,
    });
  }
}