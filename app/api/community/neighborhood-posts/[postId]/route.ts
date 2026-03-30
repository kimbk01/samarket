import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { resolveCanonicalCommunityPostId } from "@/lib/community-feed/queries";
import { getNeighborhoodDevSamplePost } from "@/lib/neighborhood/dev-sample-data";

interface Ctx {
  params: Promise<{ postId: string }>;
}

/** 본인 글만 소프트 삭제 (is_deleted) */
export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { postId } = await ctx.params;
  const raw = postId?.trim();
  if (!raw) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const id = (await resolveCanonicalCommunityPostId(raw)) ?? raw;
  if (process.env.NODE_ENV !== "production") {
    const samplePost = getNeighborhoodDevSamplePost(id);
    if (samplePost) {
      if (samplePost.author_id !== auth.userId) {
        return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
      }
      const scope = globalThis as {
        __samarketNeighborhoodDevSampleState?: {
          postStatus?: Map<string, { status: "active" | "hidden" | "deleted"; is_reported: boolean; is_sample_data: boolean }>;
        };
      };
      const current = scope.__samarketNeighborhoodDevSampleState?.postStatus?.get(id);
      if (current && scope.__samarketNeighborhoodDevSampleState?.postStatus) {
        scope.__samarketNeighborhoodDevSampleState.postStatus.set(id, { ...current, status: "deleted" });
        return NextResponse.json({ ok: true, fallback: "dev_samples" });
      }
    }
  }
  const { data: row } = await sb.from("community_posts").select("id, user_id").eq("id", id).maybeSingle();
  const r = row as { id?: string; user_id?: string } | null;
  if (!r?.id) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (r.user_id !== auth.userId) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { error } = await sb
    .from("community_posts")
    .update({ status: "deleted" })
    .eq("id", id)
    .eq("user_id", auth.userId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
