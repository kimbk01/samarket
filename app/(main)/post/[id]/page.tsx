import { Suspense } from "react";
import { notFound } from "next/navigation";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { resolvePostsReadClientsForServerComponent } from "@/lib/supabase/resolve-posts-read-clients";
import { getItemDetailPageData } from "@/services/trade/trade-detail.service";
import { PostDetailConfigError, PostDetailPageClient } from "./PostDetailPageClient";

export const dynamic = "force-dynamic";

async function PostDetailPageBody({ paramsPromise }: { paramsPromise: Promise<{ id: string }> }) {
  const t0 = performance.now();
  const { id } = await paramsPromise;
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

  return (
    <PostDetailPageClient
      key={bundle.item.id}
      initialBundle={bundle}
      initialRouteTotalMs={Math.round(performance.now() - t0)}
    />
  );
}

export default function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={5} />}>
      <PostDetailPageBody paramsPromise={params} />
    </Suspense>
  );
}
