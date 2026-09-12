import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  createAuthorPool,
  listAuthorPools,
} from "@/lib/community-crawler/author-pool-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Minimal Alias pool surface for board-import Admin (reuses community_author_pools). */
export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  try {
    const sb = getSupabaseServer();
    const pools = await listAuthorPools(sb);
    return NextResponse.json({ ok: true, pools });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "load_failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  try {
    const body = (await req.json()) as { name?: string; description?: string | null };
    if (!body.name?.trim()) {
      return NextResponse.json({ ok: false, error: "pool_name_required" }, { status: 400 });
    }
    const sb = getSupabaseServer();
    const pool = await createAuthorPool(sb, {
      name: body.name.trim(),
      description: body.description ?? null,
    });
    return NextResponse.json({ ok: true, pool });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "create_failed" },
      { status: 500 }
    );
  }
}
