import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  deleteCommunityCrawlSource,
  updateCommunityCrawlSource,
} from "@/lib/community-crawler/admin-crawl-store";
import type {
  CommunityCrawlPolicyStatus,
  CommunityCrawlSourceStatus,
  CommunityCrawlType,
} from "@/lib/community-crawler/crawl-ssot";

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

  let body: Partial<{
    name: string;
    base_url: string;
    status: CommunityCrawlSourceStatus;
    crawler_type: CommunityCrawlType;
    adapter_key: string | null;
    policy_status: CommunityCrawlPolicyStatus;
  }>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  try {
    const source = await updateCommunityCrawlSource(sb, id.trim(), body);
    return NextResponse.json({ ok: true, source });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = /required|invalid_/.test(message) ? 400 : 500;
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
    // Config + runs cascade; community_posts untouched (post_links SET NULL / CASCADE board only).
    await deleteCommunityCrawlSource(sb, id.trim());
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
