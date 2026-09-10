import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  getCommunityCrawlItem,
  updateCommunityCrawlItemDraft,
} from "@/lib/community-crawler/crawl-item-store";
import { COMMUNITY_CRAWL_ITEM_STATUSES, type CommunityCrawlItemStatus } from "@/lib/community-crawler/crawl-ssot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { id } = await ctx.params;
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }
  try {
    const item = await getCommunityCrawlItem(sb, id);
    if (!item) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  try {
    const status =
      typeof body.status === "string" &&
      COMMUNITY_CRAWL_ITEM_STATUSES.includes(body.status as CommunityCrawlItemStatus)
        ? (body.status as CommunityCrawlItemStatus)
        : undefined;
    const item = await updateCommunityCrawlItemDraft(sb, id, {
      dibay_title: typeof body.dibay_title === "string" ? body.dibay_title : undefined,
      dibay_body: typeof body.dibay_body === "string" ? body.dibay_body : undefined,
      display_author_name:
        typeof body.display_author_name === "string" ? body.display_author_name : undefined,
      display_date: body.display_date === null || typeof body.display_date === "string" ? (body.display_date as string | null) : undefined,
      display_view_seed:
        typeof body.display_view_seed === "number" ? body.display_view_seed : undefined,
      status,
    });
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
