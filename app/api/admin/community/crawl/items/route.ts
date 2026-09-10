import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { enrichCommunityCrawlItemsForAdmin } from "@/lib/community-crawler/admin-item-ops-dto";
import { listCommunityCrawlItems } from "@/lib/community-crawler/crawl-item-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const url = new URL(req.url);
  const boardId = url.searchParams.get("boardId")?.trim() || undefined;
  const sourceId = url.searchParams.get("sourceId")?.trim() || undefined;
  const limit = Number(url.searchParams.get("limit") ?? 50);

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  try {
    const items = await listCommunityCrawlItems(sb, { boardId, sourceId, limit });
    const enriched = await enrichCommunityCrawlItemsForAdmin(sb, items);
    return NextResponse.json({ ok: true, items: enriched });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
