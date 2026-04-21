import Link from "next/link";
import { Suspense } from "react";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { OwnerMenuCategoriesClient } from "@/components/business/owner/OwnerMenuCategoriesClient";

export default function MenuCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string }>;
}) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={5} />}>
      <MenuCategoriesPageBody searchParams={searchParams} />
    </Suspense>
  );
}

async function MenuCategoriesPageBody({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string }>;
}) {
  const sp = await searchParams;
  const storeId = typeof sp.storeId === "string" ? sp.storeId.trim() : "";
  if (!storeId) {
    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <p className="sam-text-body text-sam-fg">
          매장을 지정할 수 없습니다.{" "}
          <Link href="/my/business" className="font-medium text-signature underline">
            내 상점
          </Link>
          에서 「카테고리」를 눌러 주세요.
        </p>
      </div>
    );
  }
  return <OwnerMenuCategoriesClient storeId={storeId} />;
}
