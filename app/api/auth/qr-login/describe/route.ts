import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isPcQrLoginNonce, isPcQrLoginRequestId } from "@/lib/auth/pc-qr-login/pc-qr-login-contract";
import {
  PcQrLoginUnavailableError,
  isPcQrLoginRowExpired,
  readPcQrLoginRequestForApprover,
} from "@/lib/auth/pc-qr-login/pc-qr-login.server";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { enforceRateLimit } from "@/lib/http/api-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreJson(body: Record<string, unknown>, status = 200): NextResponse {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

/**
 * PC QR 로그인 — 휴대폰(로그인 회원)이 찍은 QR 의 확인 화면 정보.
 * 기기·요청 시각·접속 위치(IP 기준)만 돌려준다. 대기 중·미만료 요청만.
 */
export async function GET(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) return noStoreJson({ ok: false, errorCode: "unauthorized" }, 401);
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const limited = await enforceRateLimit({ key: `pc-qr-login:describe:user:${userId}`, limit: 30, windowMs: 10 * 60_000 });
  if (!limited.ok) return limited.response;

  const requestId = req.nextUrl.searchParams.get("id")?.trim() ?? "";
  const nonce = req.nextUrl.searchParams.get("n")?.trim() ?? "";
  if (!isPcQrLoginRequestId(requestId) || !isPcQrLoginNonce(nonce)) {
    return noStoreJson({ ok: false, errorCode: "pc_qr_login_invalid" }, 400);
  }

  const adminSb = tryCreateSupabaseServiceClient();
  if (!adminSb) return noStoreJson({ ok: false, errorCode: "pc_qr_login_unavailable" }, 503);
  try {
    const row = await readPcQrLoginRequestForApprover(adminSb, requestId, nonce);
    if (!row) return noStoreJson({ ok: false, errorCode: "pc_qr_login_invalid" }, 404);
    if (row.status !== "pending" || isPcQrLoginRowExpired(row)) {
      return noStoreJson({ ok: false, errorCode: "pc_qr_login_expired" }, 410);
    }
    return noStoreJson({
      ok: true,
      client: row.pc_client,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      geoCountry: row.pc_geo_country,
      geoCity: row.pc_geo_city,
    });
  } catch (err) {
    if (err instanceof PcQrLoginUnavailableError) {
      return noStoreJson({ ok: false, errorCode: "pc_qr_login_unavailable" }, 503);
    }
    return noStoreJson({ ok: false, errorCode: "pc_qr_login_failed" }, 500);
  }
}
