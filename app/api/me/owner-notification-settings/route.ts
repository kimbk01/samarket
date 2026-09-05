import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isMissingPreferenceRelationError } from "@/lib/notifications/policy/notification-preference-relation-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SELECT_FIELDS =
  "optional_push_enabled, optional_sound_enabled, quiet_hours_enabled, quiet_hours_start, quiet_hours_end";

const DEFAULTS = {
  optional_push_enabled: true,
  optional_sound_enabled: true,
  quiet_hours_enabled: false,
  quiet_hours_start: null as string | null,
  quiet_hours_end: null as string | null,
};

type OwnerSettingsKey = keyof typeof DEFAULTS;
type PatchBody = Partial<Record<OwnerSettingsKey, boolean | string | null>>;

function sbOr503() {
  try {
    return getSupabaseServer();
  } catch {
    return null;
  }
}

function trimTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOwnerSettingsRow(row: Record<string, unknown> | null | undefined) {
  return {
    optional_push_enabled:
      row?.optional_push_enabled === undefined || row.optional_push_enabled === null
        ? DEFAULTS.optional_push_enabled
        : row.optional_push_enabled === true,
    optional_sound_enabled:
      row?.optional_sound_enabled === undefined || row.optional_sound_enabled === null
        ? DEFAULTS.optional_sound_enabled
        : row.optional_sound_enabled === true,
    quiet_hours_enabled: row?.quiet_hours_enabled === true,
    quiet_hours_start: trimTime(row?.quiet_hours_start),
    quiet_hours_end: trimTime(row?.quiet_hours_end),
  };
}

/** GET /api/me/owner-notification-settings */
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
    .from("owner_notification_settings")
    .select(SELECT_FIELDS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingPreferenceRelationError(error)) {
      return NextResponse.json({ ok: true, settings: DEFAULTS, table_missing: true });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    settings: normalizeOwnerSettingsRow(data as Record<string, unknown> | null),
  });
}

/** PATCH /api/me/owner-notification-settings */
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

  const { data: cur, error: curError } = await sb
    .from("owner_notification_settings")
    .select(SELECT_FIELDS)
    .eq("user_id", userId)
    .maybeSingle();

  if (curError && isMissingPreferenceRelationError(curError)) {
    return NextResponse.json({ ok: false, error: "table_missing", table_missing: true }, { status: 503 });
  }
  if (curError) {
    return NextResponse.json({ ok: false, error: curError.message }, { status: 500 });
  }

  const curRow = (cur ?? {}) as Record<string, unknown>;
  const payload: Record<string, unknown> = {
    user_id: userId,
    optional_push_enabled:
      curRow.optional_push_enabled === undefined ? null : curRow.optional_push_enabled === true,
    optional_sound_enabled:
      curRow.optional_sound_enabled === undefined ? null : curRow.optional_sound_enabled === true,
    quiet_hours_enabled: curRow.quiet_hours_enabled === true,
    quiet_hours_start: trimTime(curRow.quiet_hours_start),
    quiet_hours_end: trimTime(curRow.quiet_hours_end),
    updated_at: new Date().toISOString(),
  };

  if (typeof body.optional_push_enabled === "boolean") {
    payload.optional_push_enabled = body.optional_push_enabled;
  }
  if (typeof body.optional_sound_enabled === "boolean") {
    payload.optional_sound_enabled = body.optional_sound_enabled;
  }
  if (typeof body.quiet_hours_enabled === "boolean") {
    payload.quiet_hours_enabled = body.quiet_hours_enabled;
  }
  if (typeof body.quiet_hours_start === "string" || body.quiet_hours_start === null) {
    payload.quiet_hours_start = trimTime(body.quiet_hours_start);
  }
  if (typeof body.quiet_hours_end === "string" || body.quiet_hours_end === null) {
    payload.quiet_hours_end = trimTime(body.quiet_hours_end);
  }

  const hasAnyPatch =
    typeof body.optional_push_enabled === "boolean" ||
    typeof body.optional_sound_enabled === "boolean" ||
    typeof body.quiet_hours_enabled === "boolean" ||
    typeof body.quiet_hours_start === "string" ||
    body.quiet_hours_start === null ||
    typeof body.quiet_hours_end === "string" ||
    body.quiet_hours_end === null;

  if (!hasAnyPatch) {
    return NextResponse.json({ ok: false, error: "no_patch_fields" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("owner_notification_settings")
    .upsert(payload, { onConflict: "user_id" })
    .select(SELECT_FIELDS)
    .single();

  if (error) {
    if (isMissingPreferenceRelationError(error)) {
      return NextResponse.json({ ok: false, error: "table_missing", table_missing: true }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    settings: normalizeOwnerSettingsRow(data as Record<string, unknown> | null),
  });
}
