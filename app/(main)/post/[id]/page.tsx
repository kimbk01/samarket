import { notFound } from "next/navigation";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { withTimeout } from "@/lib/async/with-timeout";
import { resolvePostsReadClientsForServerComponent } from "@/lib/supabase/resolve-posts-read-clients";
import { getItemDetailPageData } from "@/services/trade/trade-detail.service";
import { PostDetailConfigError, PostDetailPageClient } from "./PostDetailPageClient";

export const dynamic = "force-dynamic";

/** 무한 스켈레톤 방지 — 상세 부트스트랩 상한 (운영 DB 지연 시에도 UI가 멈추지 않게) */
const TRADE_DETAIL_LOAD_BUDGET_MS = 28_000;

export default async function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const t0 = performance.now();
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

  let bundle: Awaited<ReturnType<typeof getItemDetailPageData>>;
  try {
    bundle = await withTimeout(
      getItemDetailPageData(clients, { itemId: trimmed, viewerUserId: viewerId }),
      TRADE_DETAIL_LOAD_BUDGET_MS,
      "trade_detail_load_timeout"
    );
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error("[post/[id]] getItemDetailPageData", e);
    throw e;
  }

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
