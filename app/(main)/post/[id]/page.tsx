import { notFound } from "next/navigation";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { loadPostDetailShared } from "@/lib/posts/load-post-detail-shared";
import { resolvePostsReadClientsForServerComponent } from "@/lib/supabase/resolve-posts-read-clients";
import { PostDetailConfigError, PostDetailPageClient } from "./PostDetailPageClient";

/** 예약 구매자 마스킹 등 세션별 페이로드 */
export const dynamic = "force-dynamic";

export default async function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trimmed = typeof id === "string" ? id.trim() : "";
  if (!trimmed) {
    notFound();
  }

  const clients = await resolvePostsReadClientsForServerComponent();
  if (!clients) {
    return <PostDetailConfigError />;
  }

  const viewerId = await getOptionalAuthenticatedUserId();
  const post = await loadPostDetailShared(clients, trimmed, viewerId);
  if (!post) {
    notFound();
  }

  return <PostDetailPageClient key={post.id} initialPost={post} />;
}
