import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/posts/bulk-delete
 * body: { ids: string[] } — 거래 posts 테이블 영구 삭제
 *
 * CONTRACT (Trade Admin L10):
 * - Trade Post CC / posts-management permanent CTA = DISABLED · NOT_READY
 *   (dependency preview 미완 — do not wire those CTAs here)
 * - Legacy community admin bulk tool may still call this API
 * - Reject explicit trade_admin surface until permanent-delete cut ships
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  collectPostRowImageUrls,
  removeCanonicalImagesFromPublicUrls,
} from "@/lib/media/canonical-image-lifecycle.server";

const MAX_BATCH = 50;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  if (surface === "trade_admin" || surface === "posts_management" || surface === "product_cc") {
    return NextResponse.json(
      {
        ok: false,
        error: "permanent_delete_not_ready",
        message: "Trade Admin permanent delete is NOT_READY (dependency preview incomplete).",
      },
      { status: 501 }
    );
  }

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

  const { data: rowsBefore } = await sb
    .from(POSTS_TABLE_READ)
    .select("id, images, thumbnail_url")
    .in("id", ids);

  const imageUrlsToRemove: string[] = [];
  for (const row of rowsBefore ?? []) {
    imageUrlsToRemove.push(...collectPostRowImageUrls(row as { images?: unknown; thumbnail_url?: unknown }));
  }

  const { error, data } = await sb.from(POSTS_TABLE_WRITE).delete().in("id", ids).select("id");
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const deleted = (data ?? []).map((r: { id: string }) => r.id);
  const deletedSet = new Set(deleted);
  const missing = ids.filter((id) => !deletedSet.has(id));

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
  });
}
