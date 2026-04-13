import { NextResponse } from "next/server";
import { describeSupabaseFetchFailure } from "@/lib/supabase/describe-supabase-fetch-failure";

export const dynamic = "force-dynamic";
/**
 * 로컬 개발용: Node(Next 서버)에서 Supabase Auth 헬스에 연결 가능한지 확인.
 * 프로덕션 빌드에서는 비활성화(프로젝트 존재·지연 정보 노출 방지).
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const hasAnon = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim());

  if (!url) {
    return NextResponse.json(
      { ok: false, error: "missing_NEXT_PUBLIC_SUPABASE_URL", hasAnonKey: hasAnon },
      { status: 503 }
    );
  }

  const base = url.replace(/\/$/, "");
  const healthUrl = `${base}/auth/v1/health`;
  const started = Date.now();
  const ac = new AbortController();
  const timeoutMs = 10_000;
  const tid = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const res = await fetch(healthUrl, {
      method: "GET",
      signal: ac.signal,
      headers: { Accept: "application/json" },
    });
    const latencyMs = Date.now() - started;
    clearTimeout(tid);

    if (!res.ok) {
      return NextResponse.json({
        ok: false,
        error: "auth_health_non_ok",
        status: res.status,
        healthUrl,
        latencyMs,
        hasAnonKey: hasAnon,
        hint:
          "URL이 대시보드 프로젝트와 다르거나 프로젝트가 일시 중지(paused)된 경우가 많습니다.",
      });
    }

    return NextResponse.json({
      ok: true,
      healthUrl,
      latencyMs,
      hasAnonKey: hasAnon,
      hint:
        "서버→Supabase는 정상입니다. 브라우저에서만 실패하면 VPN·방화벽·확장 프로그램을 의심하세요. anon 키 불일치는 보통 즉시 401 등으로 떨어지고 장시간 대기는 드뭅니다.",
    });
  } catch (e) {
    clearTimeout(tid);
    const message = e instanceof Error ? e.message : String(e);
    const described = describeSupabaseFetchFailure(e);
    return NextResponse.json(
      {
        ok: false,
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
      },
      { status: 503 }
    );
  }
}