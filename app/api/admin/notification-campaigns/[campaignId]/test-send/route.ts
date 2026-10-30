import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { readAuditRequestIp } from "@/lib/admin/notification-campaigns/campaign-audit-log";
import { runAdminCampaignTestSend } from "@/lib/admin/notification-campaigns/campaign-test-send-service";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readIdempotencyKey(req: NextRequest, bodyKey: unknown): string | null {
  const header = req.headers.get("idempotency-key")?.trim() || req.headers.get("Idempotency-Key")?.trim();
  if (header) return `test:${header.slice(0, 120)}`;
  if (typeof bodyKey === "string" && bodyKey.trim()) return `test:${bodyKey.trim().slice(0, 120)}`;
  return null;
}

/** POST — test send to selected user IDs (QA occurrence, does not mutate ops lifecycle). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ campaignId: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { campaignId } = await ctx.params;
  const id = typeof campaignId === "string" ? campaignId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let body: { user_ids?: unknown; idempotency_key?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const userIds = Array.isArray(body.user_ids)
    ? body.user_ids.map((x) => String(x).trim()).filter(Boolean).slice(0, 20)
    : [];

  if (userIds.length === 0) {
    return NextResponse.json({ ok: false, error: "user_ids_required" }, { status: 400 });
  }

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  const idempotencyKey =
    readIdempotencyKey(req, body.idempotency_key) ??
    `test:${id}:${admin.userId}:${userIds.slice().sort().join(",")}`;

  const result = await runAdminCampaignTestSend(svc, {
    campaignId: id,
    adminUserId: admin.userId,
    userIds,
    idempotencyKey,
    ip: readAuditRequestIp(req.headers),
  });
  return NextResponse.json(result.body, { status: result.status });
}
