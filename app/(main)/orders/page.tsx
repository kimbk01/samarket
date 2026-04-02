import { Suspense } from "react";
import { redirect } from "next/navigation";
import { OrdersHubContent } from "@/components/orders/OrdersHubContent";
import { parseRoomId } from "@/lib/validate-params";

function OrdersHubFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center bg-background text-sm text-gray-500">
      불러오는 중…
    </div>
  );
}

function firstQueryString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

type OrdersSearchParams = {
  tab?: string | string[];
  room?: string | string[];
  review?: string | string[];
};

/**
 * 구매자 배달 주문 채팅 목록은 `/orders?tab=chat` 대신 `/my/store-orders`.
 * `tab=chat&room=` 딥링크만 `/chats/[roomId]` 로 유지.
 */
export default async function OrdersPage({ searchParams }: { searchParams: Promise<OrdersSearchParams> }) {
  const sp = await searchParams;
  const tab = firstQueryString(sp.tab)?.trim().toLowerCase();
  if (tab === "chat") {
    const roomId = parseRoomId(firstQueryString(sp.room) ?? "");
    if (roomId) {
      const qs = firstQueryString(sp.review) === "1" ? "?review=1" : "";
      redirect(`/chats/${encodeURIComponent(roomId)}${qs}`);
    }
    redirect("/my/store-orders");
  }

  return (
    <Suspense fallback={<OrdersHubFallback />}>
      <OrdersHubContent />
    </Suspense>
  );
}
