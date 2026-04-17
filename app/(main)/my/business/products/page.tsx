import Link from "next/link";
import { Suspense } from "react";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { OwnerProductsHubClient } from "@/components/business/owner/OwnerProductsHubClient";

export default function OwnerProductsHubPage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string }>;
}) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={5} />}>
      <OwnerProductsHubPageBody searchParams={searchParams} />
    </Suspense>
  );
}

async function OwnerProductsHubPageBody({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string }>;
}) {
  const sp = await searchParams;
  const storeId = typeof sp.storeId === "string" ? sp.storeId.trim() : "";
  if (!storeId) {
    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <p className="text-[14px] text-sam-fg">
          매장을 지정할 수 없습니다.{" "}
          <Link href="/my/business" className="font-medium text-signature underline">
            내 상점
          </Link>
          에서 「상품 등록」을 눌러 주세요.
        </p>
      </div>
    );
  }
  return <OwnerProductsHubClient storeId={storeId} />;
}
