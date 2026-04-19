import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { parseTradePresenceAudience } from "@/lib/chats/trade-presence-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  trade_presence_last_seen_at: string | null;
  trade_presence_show_online: boolean | null;
  trade_presence_hide_last_seen: boolean | null;
  trade_presence_audience: string | null;
};

/** GET /api/me/trade-presence — 본인 설정·last_seen */
export async function GET() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const sb = await createSupabaseRouteHandlerClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data, error } = await sb
    .from("profiles")
    .select(
      "trade_presence_last_seen_at, trade_presence_show_online, trade_presence_hide_last_seen, trade_presence_audience"
    )
    .eq("id", auth.userId)
    .maybeSingle();

  if (error) {
    if (error.message?.includes("column") || error.message?.includes("does not exist")) {
      return NextResponse.json({
        ok: true,
        settings: {
          lastSeenAt: null,
          showOnline: true,
          hideLastSeen: false,
          audience: "friends",
        },
        schema_missing: true,
      });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const row = (data ?? {}) as Row;
  return NextResponse.json({
    ok: true,
    settings: {
      lastSeenAt: row.trade_presence_last_seen_at ?? null,
      showOnline: row.trade_presence_show_online !== false,
      hideLastSeen: row.trade_presence_hide_last_seen === true,
      audience: (row.trade_presence_audience as "everyone" | "friends" | "nobody") || "friends",
    },
  });
}

type PatchBody = Partial<{
  showOnline: boolean;
  hideLastSeen: boolean;
  audience: string;
}>;

/** PATCH /api/me/trade-presence */
export async function PATCH(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  let body: PatchBody = {};
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.showOnline === "boolean") {
    patch.trade_presence_show_online = body.showOnline;
  }
  if (typeof body.hideLastSeen === "boolean") {
    patch.trade_presence_hide_last_seen = body.hideLastSeen;
  }
  if (body.audience !== undefined) {
    const a = parseTradePresenceAudience(body.audience);
    if (!a) {
      return NextResponse.json({ ok: false, error: "invalid_audience" }, { status: 400 });
    }
    patch.trade_presence_audience = a;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "empty_patch" }, { status: 400 });
  }

  const sb = await createSupabaseRouteHandlerClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { error } = await sb.from("profiles").update(patch).eq("id", auth.userId);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
