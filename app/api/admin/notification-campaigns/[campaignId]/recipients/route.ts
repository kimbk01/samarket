import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  CAMPAIGN_RECIPIENT_FILTERS,
  loadCampaignRecipients,
  type CampaignRecipientFilter,
} from "@/lib/admin/notification-campaigns/campaign-recipients-service";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — 보낸 알림 「받은 사람」 (Owner 구현 승인 2026-11-02 · 시안 v3).
 * `?occurrence_id=`(없으면 최신 실제 회차) `&filter=all|ok|fail|none|opened|unread&page=&page_size=`
 * 한 줄 = 회원 1명 · 숫자 요약은 목록과 같은 계산.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ campaignId: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { campaignId } = await ctx.params;
  const id = typeof campaignId === "string" ? campaignId.trim() : "";
  if (!id) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  const svc = tryCreateSupabaseServiceClient();
  if (!svc) return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });

  const sp = req.nextUrl.searchParams;
  const filterRaw = sp.get("filter")?.trim() ?? "all";
  const filter = (CAMPAIGN_RECIPIENT_FILTERS as readonly string[]).includes(filterRaw)
    ? (filterRaw as CampaignRecipientFilter)
    : "all";
  const page = Math.max(1, Math.floor(Number(sp.get("page") ?? "1")) || 1);
  const pageSize = Math.min(100, Math.max(10, Math.floor(Number(sp.get("page_size") ?? "20")) || 20));
  try {
    const result = await loadCampaignRecipients(svc, id, {
      occurrenceId: sp.get("occurrence_id")?.trim() || null,
      filter,
      page,
      pageSize,
    });
    if (!result.ok) return NextResponse.json(result, { status: result.status });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[admin/notification-campaigns/recipients] failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
}
