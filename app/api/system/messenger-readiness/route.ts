import { NextRequest, NextResponse } from "next/server";
import { runMessengerReadinessProbe } from "@/lib/system/messenger-readiness";
import { timingSafeEqualUtf8 } from "@/lib/security/timing-safe-string";

export const dynamic = "force-dynamic";

/**
 * GET — 메신저 실서비스 의존성(Supabase·Redis·선택 Web Push) 점검
 *
 * 보안: `MESSENGER_READINESS_SECRET` 가 설정되면
 * 헤더 `x-messenger-readiness-secret` 또는 쿼리 `secret` 이 일치해야 200 본문을 반환.
 * 불일치 시 404 (엔드포인트 은닉).
 */
export async function GET(req: NextRequest) {
  const expected = process.env.MESSENGER_READINESS_SECRET?.trim();
  if (expected) {
    const header = req.headers.get("x-messenger-readiness-secret")?.trim();
    const q = req.nextUrl.searchParams.get("secret")?.trim();
    const ok =
      timingSafeEqualUtf8(header, expected) || timingSafeEqualUtf8(q, expected);
    if (!ok) {
      return new NextResponse(null, { status: 404 });
    }
  }

  const result = await runMessengerReadinessProbe();
  const status = result.ok ? 200 : 503;
  return NextResponse.json(
    {
      service: "messenger",
      status: result.ok ? "ready" : "degraded",
      ...result,
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    }
  );
}
