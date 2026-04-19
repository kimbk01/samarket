import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import {

  TRADE_SETTINGS_KEY,
  mergeTradeDetailOpsSettings,
  type TradeDetailOpsSettings,
} from "@/services/trade/trade-settings.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  try {
    const sb = getSupabaseServer();
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
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: Partial<TradeDetailOpsSettings>;
  try {
    body = (await req.json()) as Partial<TradeDetailOpsSettings>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const merged = mergeTradeDetailOpsSettings(body ?? {});
  try {
    const sb = getSupabaseServer();
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
    return NextResponse.json({ ok: true, settings: merged });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
}
