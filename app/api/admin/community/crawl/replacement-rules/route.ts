import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  createCommunityCrawlReplacementRule,
  listCommunityCrawlReplacementRules,
} from "@/lib/community-crawler/replacement/replacement-rule-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }
  const sourceId = req.nextUrl.searchParams.get("sourceId")?.trim() || "";
  const boardId = req.nextUrl.searchParams.get("boardId")?.trim() || undefined;
  if (!sourceId) {
    return NextResponse.json({ ok: false, error: "source_id_required" }, { status: 400 });
  }
  try {
    const rules = await listCommunityCrawlReplacementRules(sb, { sourceId, boardId });
    return NextResponse.json({ ok: true, rules });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
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
    const rule = await createCommunityCrawlReplacementRule(sb, {
      source_id: String(body.source_id ?? ""),
      board_id: body.board_id == null || body.board_id === "" ? null : String(body.board_id),
      from_text: String(body.from_text ?? ""),
      to_text: String(body.to_text ?? ""),
      apply_title: body.apply_title !== false,
      apply_body: body.apply_body !== false,
      priority: typeof body.priority === "number" ? body.priority : 100,
      enabled: body.enabled !== false,
    });
    return NextResponse.json({ ok: true, rule });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = /required|equals|too_long|mismatch|not_found|apply_target/.test(message)
      ? 400
      : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
