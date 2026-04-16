import { notFound } from "next/navigation";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { resolvePostsReadClientsForServerComponent } from "@/lib/supabase/resolve-posts-read-clients";
import { getItemDetailPageData } from "@/services/trade/trade-detail.service";
import { PostDetailConfigError, PostDetailPageClient } from "./PostDetailPageClient";

/** 예약 구매자 마스킹 등 세션별 페이로드 */
export const dynamic = "force-dynamic";

export default async function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trimmed = typeof id === "string" ? id.trim() : "";
  if (!trimmed) {
    notFound();
  }

  const [clients, viewerId] = await Promise.all([
    resolvePostsReadClientsForServerComponent(),
    getOptionalAuthenticatedUserId(),
  ]);
  if (!clients) {
    return <PostDetailConfigError />;
  }

  const bundle = await getItemDetailPageData(clients, { itemId: trimmed, viewerUserId: viewerId });
  if (!bundle) {
    notFound();
  }

  return <PostDetailPageClient key={bundle.item.id} initialBundle={bundle} />;
}
