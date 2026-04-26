import { Suspense } from "react";
import { notFound } from "next/navigation";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { resolveViewerItemTradeRoom } from "@/lib/chats/resolve-viewer-item-trade-room";
import { getProductFromPostId } from "@/lib/products/getProductFromPostId";
import { resolveServiceSupabaseForApi } from "@/lib/supabase/resolve-service-supabase-for-api";
import { parseId } from "@/lib/validate-params";
import { ProductDetailView } from "@/components/product/detail/ProductDetailView";
import type { ChatRoomSource } from "@/lib/types/chat";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function ProductDetailPageBody({ paramsPromise }: { paramsPromise: PageProps["params"] }) {
  const t0 = performance.now();
  const resolved = await paramsPromise;
  const id = parseId(resolved.id);
  if (!id) notFound();
  const [viewerUserId, product] = await Promise.all([
    getOptionalAuthenticatedUserId(),
    getProductFromPostId(id),
  ]);
  if (!product) notFound();

  let initialViewerTradeRoom:
    | { roomId: string | null; source: ChatRoomSource | null; messengerRoomId?: string | null }
    | undefined;
  if (viewerUserId && product.sellerId && viewerUserId !== product.sellerId) {
    const sb = resolveServiceSupabaseForApi();
    if (sb) {
      const r = await resolveViewerItemTradeRoom(sb, {
        itemId: product.id,
        viewerUserId,
        sellerId: product.sellerId,
      });
      initialViewerTradeRoom = {
        roomId: r.roomId,
        source: r.source,
        ...(r.messengerRoomId ? { messengerRoomId: r.messengerRoomId } : {}),
      };
    }
  }

  return (
    <ProductDetailView
      product={product}
      initialViewerTradeRoom={initialViewerTradeRoom}
      initialRouteTotalMs={Math.round(performance.now() - t0)}
    />
  );
}

export default function ProductDetailPage({ params }: PageProps) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={5} />}>
      <ProductDetailPageBody paramsPromise={params} />
    </Suspense>
  );
}
