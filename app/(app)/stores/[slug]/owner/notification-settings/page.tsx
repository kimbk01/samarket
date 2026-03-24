import { AppBackButton } from "@/components/navigation/AppBackButton";
import { OwnerNotificationSettings } from "@/components/stores/owner/OwnerNotificationSettings";
import { resolveOwnerSampleStoreId } from "@/lib/store-owner/queries";

type PageProps = { params: Promise<{ slug: string }> };

export default async function StoreOwnerNotificationSettingsPage({ params }: PageProps) {
  const { slug } = await params;
  const safe = typeof slug === "string" ? slug : "";
  const storeId = resolveOwnerSampleStoreId(safe);

  if (!storeId) {
    return (
      <div className="min-h-screen bg-[#f3f4f6] px-4 py-16 text-center text-sm text-gray-700">
        시뮬 설정은 <span className="font-mono">seoul-korean-house</span> 매장에서 확인할 수 있어요.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f3f4f6] pb-10">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white px-2 py-2">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <AppBackButton backHref={`/stores/${encodeURIComponent(safe)}/owner/notifications`} />
          <h1 className="min-w-0 flex-1 truncate text-center text-[16px] font-bold text-gray-900">
            알림 설정
          </h1>
          <span className="w-11 shrink-0" />
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-3 pt-4">
        <OwnerNotificationSettings storeId={storeId} />
      </div>
    </div>
  );
}
