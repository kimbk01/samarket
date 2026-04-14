import Link from "next/link";
import { RedirectStoreOrderToUnifiedChat } from "@/components/chats/RedirectStoreOrderToUnifiedChat";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { loadOwnerStoreOrderContext } from "@/lib/business/load-owner-store-order-context";
import { loadOrderChatSnapshotForPage } from "@/lib/order-chat/load-order-chat-snapshot-for-page";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const dynamic = "force-dynamic";

/** 매장 오너 주문 채팅 — 컨텍스트·스냅샷을 RSC에서 한 번에 */
export default async function OwnerStoreOrderChatPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId: raw } = await params;
  const orderId = typeof raw === "string" ? raw.trim() : "";
  if (!orderId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center text-sm text-sam-fg">
        <p>주문 ID가 없습니다.</p>
        <Link href="/my/business" className="font-medium text-signature underline">
          매장 어드민
        </Link>
      </div>
    );
  }

  const userId = await getOptionalAuthenticatedUserId();
  if (!userId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <Link href="/login" className="font-medium text-signature underline">
          로그인
        </Link>
      </div>
    );
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-sm text-sam-muted">
        서버 설정이 필요합니다.
      </div>
    );
  }

  const ctx = await loadOwnerStoreOrderContext(sb, userId, orderId);
  if (!ctx.ok) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center text-sm text-sam-fg">
        <p>채팅을 열 수 없습니다. ({ctx.error})</p>
        <Link href="/my/business" className="font-medium text-signature underline">
          매장 어드민
        </Link>
      </div>
    );
  }

  const snap = await loadOrderChatSnapshotForPage(userId, orderId);
  if (snap == null || !snap.ok) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
        <p className="text-sm text-sam-fg">
          채팅을 불러오지 못했습니다.{snap && !snap.ok ? ` (${snap.error})` : ""}
        </p>
        <Link
          href={buildStoreOrdersHref({ storeId: ctx.context.store_id, orderId })}
          className="text-sm font-medium text-signature underline"
        >
          주문 관리
        </Link>
      </div>
    );
  }

  return (
    <RedirectStoreOrderToUnifiedChat
      key={`${ctx.context.store_id}:${orderId}`}
      variant="owner"
      storeId={ctx.context.store_id}
      slug={ctx.context.slug}
      orderId={orderId}
      initialSnapshot={snap.snapshot}
    />
  );
}
