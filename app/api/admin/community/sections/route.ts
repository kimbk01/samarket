import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { listAllCommunitySectionsForAdmin } from "@/lib/community-feed/queries";
import { normalizeFeedSlug } from "@/lib/community-feed/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireCommunityAdmin("content");
  if (!gate.ok) return gate.response;
  const rows = await listAllCommunitySectionsForAdmin();
  return NextResponse.json({ ok: true, sections: rows });
}

export async function POST(req: NextRequest) {
  const gate = await requireCommunityAdmin("content");
  if (!gate.ok) return gate.response;

  let body: { name?: string; slug?: string; sort_order?: number; is_active?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const slug = normalizeFeedSlug(body.slug || body.name || "");
  const sort_order = typeof body.sort_order === "number" ? body.sort_order : 0;
  const is_active = body.is_active !== false;

  if (!name) {
    return NextResponse.json({ ok: false, error: "name_required" }, { status: 400 });
  }
  if (!slug || slug.length < 2) {
    return NextResponse.json({ ok: false, error: "invalid_slug" }, { status: 400 });
  }

  try {
    const sb = getSupabaseServer();
    const { data, error } = await sb
      .from("community_sections")
      .insert({ name, slug, sort_order, is_active })
      .select("id, name, slug, sort_order, is_active")
      .single();
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ ok: false, error: "slug_duplicate" }, { status: 409 });
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    const audit = await appendCommunityAdminAudit(sb, req, {
      actorId: gate.userId,
      targetType: "community_section",
      targetId: String((data as { id?: string } | null)?.id ?? slug),
      action: "community_section.create",
      before: null,
      after: (data ?? null) as Record<string, unknown> | null,
    });
    return NextResponse.json({ ok: true, section: data, ...(audit.ok ? {} : { audit_warning: "audit_failed" }) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
}
