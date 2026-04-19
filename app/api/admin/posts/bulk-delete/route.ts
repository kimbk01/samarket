import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/posts/bulk-delete
 * body: { ids: string[] } — 거래 posts 테이블 영구 삭제
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

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

  const { error, data } = await sb.from(POSTS_TABLE_WRITE).delete().in("id", ids).select("id");
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const deleted = (data ?? []).map((r: { id: string }) => r.id);
  const deletedSet = new Set(deleted);
  const missing = ids.filter((id) => !deletedSet.has(id));

  return NextResponse.json({
    ok: true,
    deleted,
    deletedCount: deleted.length,
    notFoundOrSkipped: missing,
  });
}
