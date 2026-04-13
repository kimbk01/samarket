import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostWithMeta } from "@/lib/posts/schema";
import { tryGetSupabaseServiceClient } from "@/lib/supabase/resolve-posts-read-clients";
import type { PostsReadClients } from "@/lib/supabase/resolve-posts-read-clients";
import { loadCategoryLite } from "./load-category-lite";
import { getDetailSections } from "./get-detail-sections";
import { enrichPostsAuthorNicknamesFromProfiles } from "@/lib/posts/enrich-posts-author-nicknames";
import type { DetailSectionDTO } from "./types";

/**
 * 상세 API·detail-sections 라우트 공통 — 동일 로직으로 추천 섹션 계산.
 */
export async function computeDetailSectionsForLoadedPost(
  clients: PostsReadClients,
  post: PostWithMeta
): Promise<DetailSectionDTO[]> {
  const category = await loadCategoryLite(clients.readSb, post.category_id);
  await enrichPostsAuthorNicknamesFromProfiles(clients.readSb, [post]);
  const sbForSections = tryGetSupabaseServiceClient() ?? clients.readSb;
  const { sections } = await getDetailSections(sbForSections, post, category);
  return sections;
}
