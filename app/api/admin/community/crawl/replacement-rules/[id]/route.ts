import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  deleteCommunityCrawlReplacementRule,
  updateCommunityCrawlReplacementRule,
} from "@/lib/community-crawler/replacement/replacement-rule-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { id } = await ctx.params;
  if (!id?.trim()) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  try {
    const rule = await updateCommunityCrawlReplacementRule(sb, id.trim(), {
      from_text: typeof body.from_text === "string" ? body.from_text : undefined,
      to_text: typeof body.to_text === "string" ? body.to_text : undefined,
      apply_title: typeof body.apply_title === "boolean" ? body.apply_title : undefined,
      apply_body: typeof body.apply_body === "boolean" ? body.apply_body : undefined,
      priority: typeof body.priority === "number" ? body.priority : undefined,
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    });
    return NextResponse.json({ ok: true, rule });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = message === "not_found" ? 404 : /required|equals|too_long|apply_target/.test(message) ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { id } = await ctx.params;
  if (!id?.trim()) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  try {
    await deleteCommunityCrawlReplacementRule(sb, id.trim());
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
