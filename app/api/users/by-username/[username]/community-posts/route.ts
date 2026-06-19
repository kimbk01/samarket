import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { listCommunityPostsForUser } from "@/lib/community-feed/list-community-posts-for-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeUsernameParam(raw: string): string {
  return String(raw ?? "").trim().toLowerCase().replace(/^@+/, "");
}

/** GET — 공개 프로필 작성 커뮤니티 글 (`community_posts` SSOT) */
export async function GET(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const { username: raw } = await params;
  const username = normalizeUsernameParam(raw);
  if (!username) {
    return NextResponse.json({ ok: false, error: "username_required" }, { status: 400 });
  }

  const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? "");
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 30) : 20;

  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;
  const { data: prof } = await sbAny
    .from("profiles")
    .select("id")
    .ilike("username", username)
    .maybeSingle();

  const userId = typeof (prof as { id?: string } | null)?.id === "string" ? (prof as { id: string }).id : "";
  if (!userId) {
    return NextResponse.json({ ok: false, error: "not_found", posts: [] }, { status: 404 });
  }

  const posts = await listCommunityPostsForUser(userId, limit);
  return NextResponse.json(
    { ok: true, posts },
    { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } }
  );
}
