import { NextRequest, NextResponse } from "next/server";
import { cookieSecureFromNextRequest } from "@/lib/auth/cookie-secure-flag";
import {
  PC_QR_LOGIN_COOKIE_PATH,
  PC_QR_LOGIN_SECRET_COOKIE,
  PC_QR_LOGIN_TTL_MS,
  buildPcQrLoginPayload,
} from "@/lib/auth/pc-qr-login/pc-qr-login-contract";
import { PcQrLoginUnavailableError, createPcQrLoginRequest } from "@/lib/auth/pc-qr-login/pc-qr-login.server";
import { enforceRateLimit, getClientIp } from "@/lib/http/api-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

function headerValue(req: NextRequest, name: string): string | null {
  const raw = req.headers.get(name)?.trim();
  if (!raw) return null;
  try {
    return decodeURIComponent(raw).slice(0, 80);
  } catch {
    return raw.slice(0, 80);
  }
}

/**
 * PC QR 로그인 — PC(비로그인)가 QR 요청을 만든다.
 * 응답: QR 내용(요청 id + 1회용 nonce). PC 비밀값은 httpOnly 쿠키(QR API 경로 한정)로만 — QR 을 이 PC 에 묶는다.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const limited = await enforceRateLimit({ key: `pc-qr-login:start:ip:${ip}`, limit: 30, windowMs: 10 * 60_000 });
  if (!limited.ok) return limited.response;

  const adminSb = tryCreateSupabaseServiceClient();
  if (!adminSb) return noStore(NextResponse.json({ ok: false, errorCode: "pc_qr_login_unavailable" }, { status: 503 }));

  let body: { client?: unknown } = {};
  try {
    body = (await req.json()) as { client?: unknown };
  } catch {
    body = {};
  }
  const client = body.client === "windows_shell" ? "windows_shell" : "web";

  try {
    const created = await createPcQrLoginRequest(adminSb, {
      ip: ip === "unknown" ? null : ip,
      userAgent: req.headers.get("user-agent"),
      client,
      geoCountry: headerValue(req, "x-vercel-ip-country"),
      geoCity: headerValue(req, "x-vercel-ip-city"),
    });
    const res = NextResponse.json({
      ok: true,
      requestId: created.requestId,
      qrPayload: buildPcQrLoginPayload(created.requestId, created.nonce),
      expiresAt: created.expiresAt,
    });
    res.cookies.set(PC_QR_LOGIN_SECRET_COOKIE, created.pcSecret, {
      httpOnly: true,
      secure: cookieSecureFromNextRequest(req),
      sameSite: "lax",
      path: PC_QR_LOGIN_COOKIE_PATH,
      maxAge: Math.ceil(PC_QR_LOGIN_TTL_MS / 1000) + 60,
    });
    return noStore(res);
  } catch (err) {
    if (err instanceof PcQrLoginUnavailableError) {
      return noStore(NextResponse.json({ ok: false, errorCode: "pc_qr_login_unavailable" }, { status: 503 }));
    }
    return noStore(NextResponse.json({ ok: false, errorCode: "pc_qr_login_start_failed" }, { status: 500 }));
  }
}
