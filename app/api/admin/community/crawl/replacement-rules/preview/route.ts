import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { previewCommunityCrawlReplacement } from "@/lib/community-crawler/replacement/apply-replacement-rules";
import {
  listCommunityCrawlReplacementRules,
  type CommunityCrawlReplacementRuleRow,
} from "@/lib/community-crawler/replacement/replacement-rule-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Preview uses the SAME replacement engine as durable materialization.
 * Optionally merges a draft rule (not yet saved) into the active set.
 */
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

  const sourceId = String(body.source_id ?? "").trim();
  const boardId = body.board_id == null || body.board_id === "" ? undefined : String(body.board_id);
  const sampleTitle = String(body.sample_title ?? "");
  const sampleBody = String(body.sample_body ?? "");
  if (!sourceId) {
    return NextResponse.json({ ok: false, error: "source_id_required" }, { status: 400 });
  }

  try {
    const existing = await listCommunityCrawlReplacementRules(sb, { sourceId, boardId });
    const rules: CommunityCrawlReplacementRuleRow[] = [...existing];
    if (body.draft && typeof body.draft === "object") {
      const d = body.draft as Record<string, unknown>;
      rules.push({
        id: "draft-preview",
        source_id: sourceId,
        board_id: boardId ?? null,
        from_text: String(d.from_text ?? ""),
        to_text: String(d.to_text ?? ""),
        apply_title: d.apply_title !== false,
        apply_body: d.apply_body !== false,
        priority: typeof d.priority === "number" ? d.priority : 100,
        enabled: d.enabled !== false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    const preview = previewCommunityCrawlReplacement({
      sampleTitle,
      sampleBody,
      rules,
    });
    return NextResponse.json({ ok: true, preview });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
