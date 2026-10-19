import { NextRequest, NextResponse } from "next/server";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";
import {

  TRADE_SETTINGS_KEY,
  mergeTradeDetailOpsSettings,
  type TradeDetailOpsSettings,
} from "@/services/trade/trade-settings.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;
  try {
    const sb = admin.sb;
    const { data, error } = await sb
      .from("admin_settings")
      .select("value_json")
      .eq("key", TRADE_SETTINGS_KEY)
      .maybeSingle();
    if (error && !error.message?.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    const raw = (data as { value_json?: Record<string, unknown> } | null)?.value_json;
    const settings = mergeTradeDetailOpsSettings(raw ?? {});
    return NextResponse.json({ ok: true, settings });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
}

export async function PUT(req: NextRequest) {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;

  let body: Partial<TradeDetailOpsSettings>;
  try {
    body = (await req.json()) as Partial<TradeDetailOpsSettings>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const merged = mergeTradeDetailOpsSettings(body ?? {});
  try {
    const sb = admin.sb;
    const { data: beforeRow } = await sb.from("admin_settings").select("value_json").eq("key", TRADE_SETTINGS_KEY).maybeSingle();
    const { error } = await sb.from("admin_settings").upsert(
      {
        key: TRADE_SETTINGS_KEY,
        value_json: merged as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
    if (error) {
      if (error.message?.includes("admin_settings") && error.message.includes("does not exist")) {
        return NextResponse.json({ ok: false, error: "admin_settings_table_missing" }, { status: 503 });
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    const audit = await appendCommunityAdminAudit(sb, req, {
      actorId: admin.userId,
      targetType: "trade_settings",
      targetId: TRADE_SETTINGS_KEY,
      action: "trade_settings.update",
      before: ((beforeRow as { value_json?: Record<string, unknown> } | null)?.value_json ?? null) as Record<string, unknown> | null,
      after: merged as unknown as Record<string, unknown>,
    });
    return NextResponse.json({ ok: true, settings: merged, ...(audit.ok ? {} : { auditWarning: true }) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
}
