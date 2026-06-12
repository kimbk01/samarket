import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * post_ads FK(`community_posts`) 정합 — posts.id 미러 또는 기존 community_posts 조회.
 * DB 함수 `ensure_community_post_for_post_ads` 우선, 실패 시 TS 폴백 조회만.
 */
export async function ensureCommunityPostIdForAds(
  sb: SupabaseClient,
  rawPostId: string,
  userId: string
): Promise<string | null> {
  const postId = rawPostId.trim();
  const uid = userId.trim();
  if (!postId || !uid) return null;

  const { data: direct } = await sb.from("community_posts").select("id").eq("id", postId).maybeSingle();
  if (direct?.id) return String(direct.id);

  const { data: legacy } = await sb
    .from("community_posts")
    .select("id")
    .eq("source_legacy_post_id", postId)
    .maybeSingle();
  if (legacy?.id) return String(legacy.id);

  const { data: rpcId, error: rpcErr } = await sb.rpc("ensure_community_post_for_post_ads", {
    p_post_id: postId,
    p_user_id: uid,
  });
  if (!rpcErr && rpcId) return String(rpcId);

  if (rpcErr) {
    const m = String(rpcErr.message ?? "").toLowerCase();
    if (!m.includes("does not exist") && !m.includes("function")) {
      console.warn("[ensureCommunityPostIdForAds] rpc:", rpcErr.message);
    }
  }

  const { data: afterRpc } = await sb.from("community_posts").select("id").eq("id", postId).maybeSingle();
  if (afterRpc?.id) return String(afterRpc.id);

  const { data: afterLegacy } = await sb
    .from("community_posts")
    .select("id")
    .eq("source_legacy_post_id", postId)
    .maybeSingle();
  return afterLegacy?.id ? String(afterLegacy.id) : null;
}
