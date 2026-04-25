import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { ip, userAgent } = getAuditRequestMeta(req);
  const requestedAt = new Date().toISOString();
  let body: {
    confirmationText?: string;
    reason?: string | null;
    source?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  if (String(body.confirmationText ?? "").trim() !== "계정삭제") {
    return NextResponse.json({ ok: false, error: "최종 확인 입력이 올바르지 않습니다." }, { status: 400 });
  }

  const { error: requestError } = await sb.from("account_deletion_requests").insert({
    user_id: auth.userId,
    status: "requested",
    confirmation_text: String(body.confirmationText ?? "").trim(),
    reason: typeof body.reason === "string" ? body.reason.trim().slice(0, 2000) || null : null,
    requested_at: requestedAt,
  });
  if (requestError) {
    return NextResponse.json({ ok: false, error: requestError.message || "delete_request_save_failed" }, { status: 500 });
  }

  await sb
    .from("profiles")
    .update({
      deletion_requested_at: requestedAt,
      updated_at: requestedAt,
    })
    .eq("id", auth.userId);

  await appendAuditLog(sb, {
    actor_type: "user",
    actor_id: auth.userId,
    target_type: "account_withdrawal_request",
    target_id: auth.userId,
    action: "my.account.leave_request",
    after_json: {
      requested_at: requestedAt,
      source: typeof body.source === "string" ? body.source.trim() || "mypage_settings" : "mypage_settings",
      reason: typeof body.reason === "string" ? body.reason.trim().slice(0, 2000) || null : null,
    },
    ip,
    user_agent: userAgent,
  });

  return NextResponse.json({
    ok: true,
    requestedAt,
  });
}
