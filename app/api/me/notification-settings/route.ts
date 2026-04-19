import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULTS = {
  trade_chat_enabled: true,
  community_chat_enabled: true,
  order_enabled: true,
  store_enabled: true,
  sound_enabled: true,
  vibration_enabled: true,
};

function sbOr503() {
  try {
    return getSupabaseServer();
  } catch {
    return null;
  }
}

/** GET /api/me/notification-settings */
export async function GET() {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const sb = sbOr503();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data, error } = await sb
    .from("user_notification_settings")
    .select(
      "trade_chat_enabled, community_chat_enabled, order_enabled, store_enabled, sound_enabled, vibration_enabled"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (error.message?.includes("does not exist")) {
      return NextResponse.json({ ok: true, settings: DEFAULTS, table_missing: true });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ ok: true, settings: DEFAULTS });
  }

  const row = data as Record<string, unknown>;
  return NextResponse.json({
    ok: true,
    settings: {
      trade_chat_enabled: row.trade_chat_enabled !== false,
      community_chat_enabled: row.community_chat_enabled !== false,
      order_enabled: row.order_enabled !== false,
      store_enabled: row.store_enabled !== false,
      sound_enabled: row.sound_enabled !== false,
      vibration_enabled: row.vibration_enabled !== false,
    },
  });
}

type PatchBody = Partial<{
  trade_chat_enabled: boolean;
  community_chat_enabled: boolean;
  order_enabled: boolean;
  store_enabled: boolean;
  sound_enabled: boolean;
  vibration_enabled: boolean;
}>;

/** PATCH /api/me/notification-settings */
export async function PATCH(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const sb = sbOr503();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { data: cur } = await sb
    .from("user_notification_settings")
    .select(
      "trade_chat_enabled, community_chat_enabled, order_enabled, store_enabled, sound_enabled, vibration_enabled"
    )
    .eq("user_id", userId)
    .maybeSingle();

  const curRow = (cur ?? {}) as Partial<typeof DEFAULTS>;
  const merged = {
    user_id: userId,
    trade_chat_enabled: curRow.trade_chat_enabled !== false,
    community_chat_enabled: curRow.community_chat_enabled !== false,
    order_enabled: curRow.order_enabled !== false,
    store_enabled: curRow.store_enabled !== false,
    sound_enabled: curRow.sound_enabled !== false,
    vibration_enabled: curRow.vibration_enabled !== false,
    updated_at: new Date().toISOString(),
  };
  for (const k of Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]) {
    if (typeof body[k] === "boolean") {
      (merged as Record<string, unknown>)[k] = body[k];
    }
  }

  const hasAnyPatch = (Object.keys(DEFAULTS) as (keyof PatchBody)[]).some((k) => typeof body[k] === "boolean");
  if (!hasAnyPatch) {
    return NextResponse.json({ ok: false, error: "no_boolean_fields" }, { status: 400 });
  }

  const { error } = await sb.from("user_notification_settings").upsert(merged, { onConflict: "user_id" });

  if (error) {
    if (error.message?.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "table_missing", table_missing: true }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
