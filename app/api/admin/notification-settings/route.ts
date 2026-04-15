import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import type { NotificationDomain } from "@/lib/notifications/notification-domains";
import { NOTIFICATION_DOMAINS } from "@/lib/notifications/notification-domains";
import { ADMIN_NOTIFICATION_SETTINGS_SELECT } from "@/lib/admin/admin-public-settings-select";

export const dynamic = "force-dynamic";

function sbOr503() {
  try {
    return getSupabaseServer();
  } catch {
    return null;
  }
}

export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = sbOr503();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const { data, error } = await sb
    .from("admin_notification_settings")
    .select(ADMIN_NOTIFICATION_SETTINGS_SELECT)
    .order("type");
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, items: data ?? [] });
}

type PatchRow = {
  type: NotificationDomain;
  sound_url?: string | null;
  volume?: number;
  repeat_count?: number;
  cooldown_seconds?: number;
  enabled?: boolean;
};

export async function PATCH(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = sbOr503();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  let body: { items?: PatchRow[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return NextResponse.json({ ok: false, error: "items_required" }, { status: 400 });
  }

  for (const row of items) {
    if (!row?.type || !NOTIFICATION_DOMAINS.includes(row.type)) {
      return NextResponse.json({ ok: false, error: "invalid_type" }, { status: 400 });
    }
    const patch: Record<string, unknown> = { type: row.type, updated_at: new Date().toISOString() };
    if ("sound_url" in row) patch.sound_url = row.sound_url;
    if (typeof row.volume === "number") patch.volume = Math.max(0, Math.min(1, row.volume));
    if (typeof row.repeat_count === "number")
      patch.repeat_count = Math.max(1, Math.min(5, Math.round(row.repeat_count)));
    if (typeof row.cooldown_seconds === "number")
      patch.cooldown_seconds = Math.max(0, Math.min(600, Math.round(row.cooldown_seconds)));
    if (typeof row.enabled === "boolean") patch.enabled = row.enabled;

    const { error } = await sb.from("admin_notification_settings").upsert(patch, { onConflict: "type" });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
