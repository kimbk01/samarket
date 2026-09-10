import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  createCommunityCrawlBoard,
  listCommunityCrawlBoards,
} from "@/lib/community-crawler/admin-crawl-store";
import type {
  CommunityCrawlAuthorPolicy,
  CommunityCrawlDatePolicy,
  CommunityCrawlType,
  CommunityCrawlUpdatePolicy,
  CommunityCrawlViewPolicy,
} from "@/lib/community-crawler/crawl-ssot";

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
  const sourceId = req.nextUrl.searchParams.get("sourceId")?.trim() || undefined;
  try {
    const boards = await listCommunityCrawlBoards(sb, sourceId);
    return NextResponse.json({ ok: true, boards });
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
    const board = await createCommunityCrawlBoard(sb, {
      source_id: String(body.source_id ?? ""),
      name: String(body.name ?? ""),
      list_url: String(body.list_url ?? ""),
      dibay_topic_id: String(body.dibay_topic_id ?? ""),
      enabled: body.enabled === true,
      crawl_mode: body.crawl_mode as CommunityCrawlType | undefined,
      adapter_config:
        body.adapter_config && typeof body.adapter_config === "object"
          ? (body.adapter_config as Record<string, unknown>)
          : undefined,
      update_policy: body.update_policy as CommunityCrawlUpdatePolicy | undefined,
      author_policy: body.author_policy as CommunityCrawlAuthorPolicy | undefined,
      author_config:
        body.author_config && typeof body.author_config === "object"
          ? (body.author_config as Record<string, unknown>)
          : undefined,
      date_policy: body.date_policy as CommunityCrawlDatePolicy | undefined,
      date_config:
        body.date_config && typeof body.date_config === "object"
          ? (body.date_config as Record<string, unknown>)
          : undefined,
      view_policy: body.view_policy as CommunityCrawlViewPolicy | undefined,
      view_config:
        body.view_config && typeof body.view_config === "object"
          ? (body.view_config as Record<string, unknown>)
          : undefined,
      schedule_enabled: body.schedule_enabled === true,
      crawl_interval_minutes:
        body.crawl_interval_minutes == null ? null : Number(body.crawl_interval_minutes),
      max_pages: body.max_pages == null ? undefined : Number(body.max_pages),
      max_posts: body.max_posts == null ? undefined : Number(body.max_posts),
    });
    return NextResponse.json({ ok: true, board });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = /required|invalid_|not_found/.test(message) ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
