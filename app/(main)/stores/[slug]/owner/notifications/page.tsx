import Link from "next/link";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { OwnerNotificationList } from "@/components/stores/owner/OwnerNotificationList";
import { resolveStoreIdBySlug } from "@/lib/store-owner/queries";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";

type PageProps = { params: Promise<{ slug: string }> };

export default async function StoreOwnerNotificationsPage({ params }: PageProps) {
  const { slug } = await params;
  const safe = typeof slug === "string" ? slug : "";
  const storeId = await resolveStoreIdBySlug(safe);
  const ordersHubHref = storeId ? buildStoreOrdersHref({ storeId }) : "/my/business/store-orders";

  if (!storeId) {
    return (
      <div className="min-h-screen bg-[#f3f4f6] px-4 py-16 text-center text-sm text-sam-fg">
        등록된 매장을 찾을 수 없습니다. 주소(slug)를 확인해 주세요.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f3f4f6] pb-10">
      <header className="sticky top-0 z-10 border-b border-sam-border bg-sam-surface px-2 py-2">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <AppBackButton backHref={ordersHubHref} />
          <h1 className="min-w-0 flex-1 truncate text-center text-[16px] font-bold text-sam-fg">알림</h1>
          <span className="w-11 shrink-0" />
        </div>
      </header>
      <div className="mx-auto max-w-3xl space-y-4 px-3 pt-4">
        <OwnerNotificationList slug={safe} storeId={storeId} />
        <Link href={ordersHubHref} className="text-sm text-signature underline">
          주문 관리로
        </Link>
      </div>
    </div>
  );
}
