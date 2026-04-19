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

  await appendAuditLog(sb, {
    actor_type: "user",
    actor_id: auth.userId,
    target_type: "account_withdrawal_request",
    target_id: auth.userId,
    action: "my.account.leave_request",
    after_json: {
      requested_at: requestedAt,
      source: "mypage_settings",
    },
    ip,
    user_agent: userAgent,
  });

  return NextResponse.json({
    ok: true,
    requestedAt,
  });
}
