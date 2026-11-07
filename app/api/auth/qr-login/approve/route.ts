import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isLoginDeniedMemberAccount } from "@/lib/auth/member-account-state";
import { isPcQrLoginNonce, isPcQrLoginRequestId } from "@/lib/auth/pc-qr-login/pc-qr-login-contract";
import { approvePcQrLoginRequest } from "@/lib/auth/pc-qr-login/pc-qr-login.server";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { enforceRateLimit, getClientIp } from "@/lib/http/api-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreJson(body: Record<string, unknown>, status = 200): NextResponse {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

/**
 * PC QR 로그인 — 휴대폰(로그인 회원)이 확인 화면에서 「로그인 허용」.
 * 대기 중·미만료·nonce 일치 요청을 **한 번만** 승인한다. PC 는 다음 상태 확인에서 이 회원 세션을 받는다.
 */
export async function POST(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) return noStoreJson({ ok: false, errorCode: "unauthorized" }, 401);
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;
  if (isLoginDeniedMemberAccount(session.profile)) {
    return noStoreJson({ ok: false, errorCode: "account_denied" }, 403);
  }

  const limited = await enforceRateLimit({ key: `pc-qr-login:approve:user:${userId}`, limit: 10, windowMs: 10 * 60_000 });
  if (!limited.ok) return limited.response;

  let body: { id?: unknown; n?: unknown };
  try {
    body = (await req.json()) as { id?: unknown; n?: unknown };
  } catch {
    return noStoreJson({ ok: false, errorCode: "pc_qr_login_invalid" }, 400);
  }
  const requestId = typeof body.id === "string" ? body.id.trim() : "";
  const nonce = typeof body.n === "string" ? body.n.trim() : "";
  if (!isPcQrLoginRequestId(requestId) || !isPcQrLoginNonce(nonce)) {
    return noStoreJson({ ok: false, errorCode: "pc_qr_login_invalid" }, 400);
  }

  const adminSb = tryCreateSupabaseServiceClient();
  if (!adminSb) return noStoreJson({ ok: false, errorCode: "pc_qr_login_unavailable" }, 503);
  const ip = getClientIp(req);
  let approved = false;
  try {
    approved = await approvePcQrLoginRequest(adminSb, {
      requestId,
      nonce,
      approverUserId: userId,
      approverIp: ip === "unknown" ? null : ip,
    });
  } catch {
    return noStoreJson({ ok: false, errorCode: "pc_qr_login_failed" }, 500);
  }
  if (!approved) return noStoreJson({ ok: false, errorCode: "pc_qr_login_expired" }, 410);

  await appendAuditLog(adminSb, {
    actor_type: "user",
    actor_id: userId,
    target_type: "pc_login_request",
    target_id: requestId,
    action: "auth.pc_qr_login_approve",
    ip: ip === "unknown" ? null : ip,
    user_agent: req.headers.get("user-agent"),
  });
  return noStoreJson({ ok: true });
}
