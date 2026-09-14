import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { getSiteAdapter } from "@/lib/external-import/adapters/registry";
import { resolveExternalSiteProductStatus } from "@/lib/external-import/product-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Next creates/reads jobs only.
 * Crawl = independent worker-loop (services/crawl-worker/worker-loop.mjs).
 * MUST NOT spawn worker, fork, wait on Crawlee, or own worker lifecycle.
 */

const RECENT_LIMIT: Record<string, number> = {
  recent_10: 10,
  recent_20: 20,
  recent_50: 50,
};

export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = getSupabaseServer();

  let body: {
    action?: string;
    boardId?: string;
    range?: string;
    pageFrom?: number;
    pageTo?: number;
    dateFrom?: string;
    dateTo?: string;
    articleId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const action = String(body.action || "").trim();
  if (action !== "list" && action !== "detail") {
    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  }

  const boardId = String(body.boardId || "").trim();
  if (!boardId) return NextResponse.json({ ok: false, error: "board_required" }, { status: 400 });

  const { data: board } = await sb
    .from("external_boards")
    .select("id, site_id, board_key, is_active")
    .eq("id", boardId)
    .maybeSingle();
  if (!board || !board.is_active) {
    return NextResponse.json({ ok: false, error: "board_unavailable" }, { status: 404 });
  }

  const { data: site } = await sb
    .from("external_sites")
    .select("id, adapter_key, is_active")
    .eq("id", board.site_id)
    .maybeSingle();
  if (!site || !site.is_active) {
    return NextResponse.json({ ok: false, error: "site_unavailable" }, { status: 409 });
  }

  const productStatus = resolveExternalSiteProductStatus({
    adapterKey: site.adapter_key,
    isActive: site.is_active,
  });
  if (productStatus !== "USABLE") {
    return NextResponse.json(
      { ok: false, error: "site_not_usable", status: productStatus },
      { status: 409 }
    );
  }

  let caps = {
    supportsRecent: true,
    supportsPageRange: false,
    supportsDateRange: false,
    recentCounts: [10, 20, 50] as number[],
  };
  try {
    const adapter = getSiteAdapter(site.adapter_key);
    const boards = await Promise.resolve(adapter.listBoards());
    const hit = boards.find((b) => b.boardKey === board.board_key);
    if (hit?.capabilities) {
      caps = {
        ...caps,
        ...hit.capabilities,
        recentCounts: hit.capabilities.recentCounts ?? caps.recentCounts,
      };
    }
  } catch {
    /* keep defaults */
  }

  let payload: Record<string, unknown> = {};
  if (action === "list") {
    const range = String(body.range || "recent_20").trim();
    if (range.startsWith("recent_")) {
      if (!caps.supportsRecent) {
        return NextResponse.json({ ok: false, error: "range_unsupported" }, { status: 400 });
      }
      const limit = RECENT_LIMIT[range] ?? Number(range.replace("recent_", ""));
      if (!Number.isFinite(limit) || limit < 1 || limit > 50) {
        return NextResponse.json({ ok: false, error: "range_unsupported" }, { status: 400 });
      }
      payload = { range, limit, mode: "recent" };
    } else if (range === "page_range") {
      if (!caps.supportsPageRange) {
        return NextResponse.json({ ok: false, error: "range_unsupported" }, { status: 400 });
      }
      const pageFrom = Math.max(1, Number(body.pageFrom || 1));
      const pageTo = Math.max(pageFrom, Number(body.pageTo || pageFrom));
      if (pageTo - pageFrom > 9) {
        return NextResponse.json({ ok: false, error: "page_range_too_large" }, { status: 400 });
      }
      payload = { range, mode: "page", pageFrom, pageTo };
    } else if (range === "date_range") {
      if (!caps.supportsDateRange) {
        return NextResponse.json({ ok: false, error: "range_unsupported" }, { status: 400 });
      }
      const dateFrom = String(body.dateFrom || "").trim();
      const dateTo = String(body.dateTo || "").trim();
      if (!dateFrom || !dateTo) {
        return NextResponse.json({ ok: false, error: "date_range_required" }, { status: 400 });
      }
      payload = { range, mode: "date", dateFrom, dateTo, limit: 50 };
    } else {
      return NextResponse.json({ ok: false, error: "range_unsupported" }, { status: 400 });
    }
  } else {
    const articleId = String(body.articleId || "").trim();
    if (!articleId) return NextResponse.json({ ok: false, error: "article_required" }, { status: 400 });
    const { data: article } = await sb
      .from("external_articles")
      .select("id, board_id")
      .eq("id", articleId)
      .maybeSingle();
    if (!article || article.board_id !== boardId) {
      return NextResponse.json({ ok: false, error: "article_board_mismatch" }, { status: 400 });
    }
    payload = { articleId };
  }

  if (action === "list") {
    const { data: running } = await sb
      .from("external_import_jobs")
      .select("id, status")
      .eq("board_id", boardId)
      .eq("action", "list")
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (running) {
      return NextResponse.json({ ok: true, jobId: running.id, status: running.status, reused: true });
    }
  }

  const { data: job, error } = await sb
    .from("external_import_jobs")
    .insert({
      site_id: board.site_id,
      board_id: boardId,
      action,
      status: "queued",
      payload,
    })
    .select("id, status")
    .single();
  if (error || !job) {
    return NextResponse.json({ ok: false, error: error?.message || "job_create_failed" }, { status: 500 });
  }

  // Independent worker-loop claims this job. Next returns immediately.
  return NextResponse.json({ ok: true, jobId: job.id, status: "queued", reused: false });
}
