import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ error: "server_config" }, { status: 500 });
  }

  const { data, error } = await (sb as any)
    .from("delivery_auto_actions_runtime_settings")
    .select("singleton, delivery_auto_actions_enabled, updated_at")
    .eq("singleton", 1)
    .maybeSingle();

  if (error) {
    const msg = String(error.message ?? "");
    if (/does not exist|schema cache/i.test(msg)) {
      return NextResponse.json({ error: "schema_missing", hint: "Apply migration delivery_auto_actions_safety" }, { status: 503 });
    }
    return NextResponse.json({ error: msg.slice(0, 200) }, { status: 500 });
  }

  return NextResponse.json({
    settings: data ?? { singleton: 1, delivery_auto_actions_enabled: false },
  });
}

export async function PATCH(req: Request) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let body: { delivery_auto_actions_enabled?: boolean };
  try {
    body = (await req.json()) as { delivery_auto_actions_enabled?: boolean };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.delivery_auto_actions_enabled !== "boolean") {
    return NextResponse.json({ error: "delivery_auto_actions_enabled_required" }, { status: 400 });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ error: "server_config" }, { status: 500 });
  }

  const { data, error } = await (sb as any)
    .from("delivery_auto_actions_runtime_settings")
    .update({ delivery_auto_actions_enabled: body.delivery_auto_actions_enabled })
    .eq("singleton", 1)
    .select("singleton, delivery_auto_actions_enabled, updated_at")
    .maybeSingle();

  if (error) {
    const msg = String(error.message ?? "");
    if (/does not exist|schema cache/i.test(msg)) {
      return NextResponse.json({ error: "schema_missing" }, { status: 503 });
    }
    return NextResponse.json({ error: msg.slice(0, 200) }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "settings_row_missing" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, settings: data });
}
