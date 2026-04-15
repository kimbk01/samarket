import { notFound } from "next/navigation";
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

export default async function ProductDetailPage({ params }: PageProps) {
  const resolved = await params;
  const id = parseId(resolved.id);
  if (!id) notFound();
  const [viewerUserId, product] = await Promise.all([
    getOptionalAuthenticatedUserId(),
    getProductFromPostId(id),
  ]);
  if (!product) notFound();

  let initialViewerTradeRoom: { roomId: string | null; source: ChatRoomSource | null } | undefined;
  if (viewerUserId && product.sellerId) {
    const sb = resolveServiceSupabaseForApi();
    if (sb) {
      const r = await resolveViewerItemTradeRoom(sb, {
        itemId: product.id,
        viewerUserId,
        sellerId: product.sellerId,
      });
      initialViewerTradeRoom = { roomId: r.roomId, source: r.source };
    }
  }

  return <ProductDetailView product={product} initialViewerTradeRoom={initialViewerTradeRoom} />;
}
