import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { readAuditRequestIp } from "@/lib/admin/notification-campaigns/campaign-audit-log";
import {
  parseCampaignWriteInput,
  type CampaignWriteBody,
} from "@/lib/admin/notification-campaigns/campaign-input";
import {
  runAdminCampaignTestSend,
  upsertAdminTestSandboxCampaign,
} from "@/lib/admin/notification-campaigns/campaign-test-send-service";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — v3 「내 폰으로 테스트」: 작성 중인 내용 그대로 지정 회원에게만 발송.
 * 캠페인 목록을 채우지 않도록 관리자별 QA sandbox 캠페인 1건을 덮어써 재사용한다.
 * 본문 = 캠페인 작성 필드(생성과 같은 검사) + `user_ids`.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let body: CampaignWriteBody & { user_ids?: unknown };
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

  const parsed = parseCampaignWriteInput(body, {
    hasOwnTargetPayload: Object.prototype.hasOwnProperty.call(body, "target_payload"),
  });
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
  }

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  const sandbox = await upsertAdminTestSandboxCampaign(svc, admin.userId, parsed.fields);
  if (!sandbox.ok) {
    return NextResponse.json({ ok: false, error: sandbox.error }, { status: sandbox.status });
  }

  const header = req.headers.get("idempotency-key")?.trim();
  const result = await runAdminCampaignTestSend(svc, {
    campaignId: sandbox.campaignId,
    adminUserId: admin.userId,
    userIds,
    idempotencyKey: header ? `test:${header.slice(0, 120)}` : `test:${sandbox.campaignId}:${Date.now()}`,
    ip: readAuditRequestIp(req.headers),
  });
  return NextResponse.json(result.body, { status: result.status });
}
