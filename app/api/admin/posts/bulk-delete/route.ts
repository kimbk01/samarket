import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/posts/bulk-delete
 * body: { ids: string[], surface?: string }
 *
 * ARO-OPS-UX-002-B1R:
 * Trade Admin surfaces allowed with row-level eligibility
 * (sold / sold_buyer blocked). Existing delete + image cleanup owner preserved.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  collectPostRowImageUrls,
  removeCanonicalImagesFromPublicUrls,
} from "@/lib/media/canonical-image-lifecycle.server";
import {
  evaluateTradePostHardDeleteEligibility,
  type TradePostHardDeleteBlocker,
} from "@/lib/admin-posts/trade-post-hard-delete-eligibility";

const MAX_BATCH = 50;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TRADE_SURFACES = new Set(["trade_admin", "posts_management", "product_cc"]);

function parseIds(body: unknown): string[] | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { ids?: unknown }).ids;
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const id = x.trim();
    if (!id || !UUID_RE.test(id)) continue;
    out.push(id);
  }
  const uniq = [...new Set(out)];
  return uniq.length ? uniq : null;
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const surface =
    json && typeof json === "object" && "surface" in json
      ? String((json as { surface?: unknown }).surface ?? "").trim().toLowerCase()
      : "";

  const ids = parseIds(json);
  if (!ids) {
    return NextResponse.json({ ok: false, error: "ids: uuid[] 필요" }, { status: 400 });
  }
  if (ids.length > MAX_BATCH) {
    return NextResponse.json(
      { ok: false, error: `한 번에 최대 ${MAX_BATCH}개까지 삭제할 수 있습니다.` },
      { status: 400 }
    );
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const { data: rowsBefore, error: loadErr } = await sb
    .from(POSTS_TABLE_READ)
    .select("id, images, thumbnail_url, status, sold_buyer_id")
    .in("id", ids);

  if (loadErr) {
    return NextResponse.json({ ok: false, error: loadErr.message }, { status: 500 });
  }

  type Row = {
    id: string;
    images?: unknown;
    thumbnail_url?: unknown;
    status?: string | null;
    sold_buyer_id?: string | null;
  };

  const byId = new Map((rowsBefore ?? []).map((r) => [String((r as Row).id), r as Row]));
  const blocked: { id: string; blockers: TradePostHardDeleteBlocker[] }[] = [];
  const eligibleIds: string[] = [];

  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      blocked.push({ id, blockers: ["invalid_id"] });
      continue;
    }
    const ev = evaluateTradePostHardDeleteEligibility({
      id,
      status: row.status,
      soldBuyerId: row.sold_buyer_id,
    });
    if (!ev.eligible) blocked.push({ id, blockers: ev.blockers });
    else eligibleIds.push(id);
  }

  // Non-trade legacy callers: still delete only eligible rows (same safety).
  void TRADE_SURFACES;
  void surface;

  if (eligibleIds.length === 0) {
    return NextResponse.json({
      ok: true,
      deleted: [],
      deletedCount: 0,
      notFoundOrSkipped: ids,
      blocked,
      message: "no_eligible_rows",
    });
  }

  const imageUrlsToRemove: string[] = [];
  for (const id of eligibleIds) {
    const row = byId.get(id);
    if (!row) continue;
    imageUrlsToRemove.push(
      ...collectPostRowImageUrls(row as { images?: unknown; thumbnail_url?: unknown })
    );
  }

  const { error, data } = await sb
    .from(POSTS_TABLE_WRITE)
    .delete()
    .in("id", eligibleIds)
    .select("id");
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const deleted = (data ?? []).map((r: { id: string }) => r.id);
  const deletedSet = new Set(deleted);
  const missing = eligibleIds.filter((id) => !deletedSet.has(id));

  if (deleted.length > 0 && imageUrlsToRemove.length > 0) {
    const removal = await removeCanonicalImagesFromPublicUrls({
      sb,
      urls: imageUrlsToRemove,
      context: "admin/posts/bulk-delete",
    });
    if (removal.failed.length > 0) {
      console.error("[admin/posts/bulk-delete] storage cleanup partial failure", removal.failed);
    }
  }

  return NextResponse.json({
    ok: true,
    deleted,
    deletedCount: deleted.length,
    notFoundOrSkipped: missing,
    blocked,
  });
}
