import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { cookieSecureFromNextRequest } from "@/lib/auth/cookie-secure-flag";
import {
  PC_QR_LOGIN_COOKIE_PATH,
  PC_QR_LOGIN_SECRET_COOKIE,
  isPcQrLoginRequestId,
} from "@/lib/auth/pc-qr-login/pc-qr-login-contract";
import {
  PcQrLoginUnavailableError,
  consumeApprovedPcQrLoginRequest,
  isPcQrLoginRowExpired,
  readPcQrLoginRequestForPc,
} from "@/lib/auth/pc-qr-login/pc-qr-login.server";
import { establishPcQrLoginSession } from "@/lib/auth/pc-qr-login/pc-qr-login-session.server";
import { enforceRateLimit, getClientIp } from "@/lib/http/api-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> };

function noStoreJson(body: Record<string, unknown>, status = 200): NextResponse {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

function clearSecretCookie(res: NextResponse, req: NextRequest): void {
  res.cookies.set(PC_QR_LOGIN_SECRET_COOKIE, "", {
    httpOnly: true,
    secure: cookieSecureFromNextRequest(req),
    sameSite: "lax",
    path: PC_QR_LOGIN_COOKIE_PATH,
    maxAge: 0,
  });
}

/**
 * PC QR 로그인 — PC 가 2초마다 자기 요청 상태를 묻는다 (PC 비밀값 쿠키로 자기 요청만).
 * 승인됐으면 **이 응답에서 한 번만** 승인 회원의 세션 쿠키를 만들고 요청을 consumed 로 바꾼다.
 */
export async function GET(req: NextRequest) {
  const requestId = req.nextUrl.searchParams.get("id")?.trim() ?? "";
  const pcSecret = req.cookies.get(PC_QR_LOGIN_SECRET_COOKIE)?.value?.trim() ?? "";
  if (!isPcQrLoginRequestId(requestId) || !pcSecret) {
    return noStoreJson({ ok: false, status: "invalid" }, 400);
  }

  const ip = getClientIp(req);
  const limited = await enforceRateLimit({ key: `pc-qr-login:status:ip:${ip}`, limit: 200, windowMs: 10 * 60_000 });
  if (!limited.ok) return limited.response;

  const adminSb = tryCreateSupabaseServiceClient();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!adminSb || !url || !anon) return noStoreJson({ ok: false, status: "unavailable" }, 503);

  let row;
  try {
    row = await readPcQrLoginRequestForPc(adminSb, requestId, pcSecret);
  } catch (err) {
    if (err instanceof PcQrLoginUnavailableError) return noStoreJson({ ok: false, status: "unavailable" }, 503);
    return noStoreJson({ ok: false, status: "error" }, 500);
  }
  if (!row) return noStoreJson({ ok: false, status: "invalid" }, 404);
  if (row.status === "pending") {
    return noStoreJson({ ok: true, status: isPcQrLoginRowExpired(row) ? "expired" : "pending" });
  }
  if (row.status !== "approved" || isPcQrLoginRowExpired(row)) {
    return noStoreJson({ ok: true, status: row.status === "approved" ? "expired" : row.status });
  }

  const userId = await consumeApprovedPcQrLoginRequest(adminSb, { requestId, pcSecret }).catch(() => null);
  if (!userId) {
    // 동시 요청이 먼저 소비했거나 막 만료됨 — 같은 승인으로 세션을 두 번 만들지 않는다
    return noStoreJson({ ok: true, status: "consumed" });
  }

  const sessionCookies: CookieToSet[] = [];
  const routeSb = createServerClient(url, anon, {
    cookieOptions: { path: "/", sameSite: "lax", secure: cookieSecureFromNextRequest(req) },
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        sessionCookies.push(...cookiesToSet);
      },
    },
  });
  const cookieCarrier = NextResponse.json({});
  const result = await establishPcQrLoginSession({
    adminSb,
    routeSb,
    userId,
    request: req,
    cookieCarrier,
    next: req.nextUrl.searchParams.get("next"),
  });

  const response = result.ok
    ? noStoreJson({
        ok: true,
        status: "approved",
        redirectTo: result.redirectTo,
        signupComplete: result.signupComplete,
        needsTermsAgreement: result.needsTermsAgreement,
        needsProfileCompletion: result.needsProfileCompletion,
      })
    : noStoreJson({ ok: false, status: "failed", errorCode: result.errorCode }, 403);

  // 세션 쿠키(Supabase) + 로그인 뒤 처리 쿠키(활성 세션 번호 등)를 최종 응답에 모두 옮긴다
  for (const { name, value, options } of sessionCookies) {
    try {
      response.cookies.set(name, value, options);
    } catch {
      /* ignore malformed cookie options */
    }
  }
  for (const cookie of cookieCarrier.cookies.getAll()) {
    response.cookies.set(cookie);
  }
  clearSecretCookie(response, req);

  if (result.ok) {
    const svc = tryCreateSupabaseServiceClient();
    if (svc) {
      await appendAuditLog(svc, {
        actor_type: "user",
        actor_id: userId,
        target_type: "auth_session",
        target_id: userId,
        action: "auth.pc_qr_login",
        after_json: { request_id: requestId, pc_client: row.pc_client },
        ip: ip === "unknown" ? null : ip,
        user_agent: req.headers.get("user-agent"),
      });
    }
  }
  return response;
}
