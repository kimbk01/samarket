import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { DEFAULT_USER_SETTINGS, type UserSettingsRow } from "@/lib/types/settings-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SELECT_FIELDS =
  "service_enabled, trade_chat_enabled, community_chat_enabled, order_enabled, store_enabled, trade_events_enabled, community_social_enabled, notice_enabled, marketing_enabled, sound_enabled, vibration_enabled, quiet_hours_enabled, quiet_hours_start, quiet_hours_end";

const DEFAULTS = {
  service_enabled: true,
  trade_chat_enabled: true,
  community_chat_enabled: true,
  order_enabled: true,
  store_enabled: true,
  trade_events_enabled: true,
  community_social_enabled: true,
  notice_enabled: true,
  marketing_enabled: false,
  sound_enabled: true,
  vibration_enabled: true,
  quiet_hours_enabled: false,
  quiet_hours_start: null as string | null,
  quiet_hours_end: null as string | null,
};

type SettingsKey = keyof typeof DEFAULTS;

function sbOr503() {
  try {
    return getSupabaseServer();
  } catch {
    return null;
  }
}

function coerceBool(cur: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const v = cur[key];
  if (v === undefined || v === null) return fallback;
  return v !== false;
}

function normalizeSettingsRow(row: Record<string, unknown>) {
  return {
    service_enabled: row.service_enabled !== false,
    trade_chat_enabled: row.trade_chat_enabled !== false,
    community_chat_enabled: row.community_chat_enabled !== false,
    order_enabled: row.order_enabled !== false,
    store_enabled: row.store_enabled !== false,
    trade_events_enabled: row.trade_events_enabled !== false,
    community_social_enabled: row.community_social_enabled !== false,
    notice_enabled: row.notice_enabled !== false,
    marketing_enabled:
      row.marketing_enabled === undefined ? DEFAULTS.marketing_enabled : row.marketing_enabled === true,
    sound_enabled: row.sound_enabled !== false,
    vibration_enabled: row.vibration_enabled !== false,
    quiet_hours_enabled: row.quiet_hours_enabled === true,
    quiet_hours_start:
      typeof row.quiet_hours_start === "string" && row.quiet_hours_start.trim()
        ? row.quiet_hours_start
        : null,
    quiet_hours_end:
      typeof row.quiet_hours_end === "string" && row.quiet_hours_end.trim() ? row.quiet_hours_end : null,
  };
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

  const { data, error } = await sb.from("user_notification_settings").select(SELECT_FIELDS).eq("user_id", userId).maybeSingle();

  if (error) {
    if (error.message?.includes("does not exist")) {
      return NextResponse.json({ ok: true, settings: DEFAULTS, table_missing: true });
    }
    const lowered = error.message?.toLowerCase() ?? "";
    if (lowered.includes("column") && lowered.includes("does not exist")) {
      return NextResponse.json({ ok: true, settings: DEFAULTS, table_missing: true });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ ok: true, settings: DEFAULTS });
  }

  return NextResponse.json({
    ok: true,
    settings: normalizeSettingsRow(data as Record<string, unknown>),
  });
}

type PatchBody = Partial<Record<SettingsKey, boolean | string | null>>;

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

  const { data: cur } = await sb.from("user_notification_settings").select(SELECT_FIELDS).eq("user_id", userId).maybeSingle();

  const curRow = (cur ?? {}) as Record<string, unknown>;
  const merged: Record<string, unknown> = {
    user_id: userId,
    service_enabled: coerceBool(curRow, "service_enabled", DEFAULTS.service_enabled),
    trade_chat_enabled: coerceBool(curRow, "trade_chat_enabled", DEFAULTS.trade_chat_enabled),
    community_chat_enabled: coerceBool(curRow, "community_chat_enabled", DEFAULTS.community_chat_enabled),
    order_enabled: coerceBool(curRow, "order_enabled", DEFAULTS.order_enabled),
    store_enabled: coerceBool(curRow, "store_enabled", DEFAULTS.store_enabled),
    trade_events_enabled: coerceBool(curRow, "trade_events_enabled", DEFAULTS.trade_events_enabled),
    community_social_enabled: coerceBool(curRow, "community_social_enabled", DEFAULTS.community_social_enabled),
    notice_enabled: coerceBool(curRow, "notice_enabled", DEFAULTS.notice_enabled),
    marketing_enabled: curRow.marketing_enabled === undefined ? DEFAULTS.marketing_enabled : curRow.marketing_enabled === true,
    sound_enabled: coerceBool(curRow, "sound_enabled", DEFAULTS.sound_enabled),
    vibration_enabled: coerceBool(curRow, "vibration_enabled", DEFAULTS.vibration_enabled),
    quiet_hours_enabled: curRow.quiet_hours_enabled === true,
    quiet_hours_start:
      typeof curRow.quiet_hours_start === "string" && curRow.quiet_hours_start.trim()
        ? curRow.quiet_hours_start
        : null,
    quiet_hours_end:
      typeof curRow.quiet_hours_end === "string" && curRow.quiet_hours_end.trim()
        ? curRow.quiet_hours_end
        : null,
    updated_at: new Date().toISOString(),
  };

  const boolKeys: SettingsKey[] = [
    "service_enabled",
    "trade_chat_enabled",
    "community_chat_enabled",
    "order_enabled",
    "store_enabled",
    "trade_events_enabled",
    "community_social_enabled",
    "notice_enabled",
    "marketing_enabled",
    "sound_enabled",
    "vibration_enabled",
    "quiet_hours_enabled",
  ];
  for (const k of boolKeys) {
    if (typeof body[k] === "boolean") {
      merged[k] = body[k];
    }
  }
  if (typeof body.quiet_hours_start === "string" || body.quiet_hours_start === null) {
    merged.quiet_hours_start = body.quiet_hours_start;
  }
  if (typeof body.quiet_hours_end === "string" || body.quiet_hours_end === null) {
    merged.quiet_hours_end = body.quiet_hours_end;
  }

  const hasAnyPatch =
    boolKeys.some((k) => typeof body[k] === "boolean") ||
    typeof body.quiet_hours_start === "string" ||
    body.quiet_hours_start === null ||
    typeof body.quiet_hours_end === "string" ||
    body.quiet_hours_end === null;

  if (!hasAnyPatch) {
    return NextResponse.json({ ok: false, error: "no_patch_fields" }, { status: 400 });
  }

  const { error } = await sb.from("user_notification_settings").upsert(merged, { onConflict: "user_id" });

  if (error) {
    if (error.message?.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "table_missing", table_missing: true }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (typeof body.marketing_enabled === "boolean") {
    const ts = new Date().toISOString();
    const { data: existing } = await sb.from("user_settings").select("user_id").eq("user_id", userId).maybeSingle();
    if (existing?.user_id) {
      await sb.from("user_settings").update({ marketing_push_enabled: body.marketing_enabled, updated_at: ts }).eq("user_id", userId);
    } else {
      await sb.from("user_settings").insert({
        user_id: userId,
        ...DEFAULT_USER_SETTINGS,
        marketing_push_enabled: body.marketing_enabled,
        updated_at: ts,
      } as UserSettingsRow);
    }
  }

  return NextResponse.json({ ok: true });
}
