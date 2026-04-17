import Link from "next/link";
import { Suspense } from "react";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { OwnerProductForm } from "@/components/business/owner/OwnerProductForm";

export default function OwnerEditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ storeId?: string }>;
}) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={5} />}>
      <OwnerEditProductPageBody params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function OwnerEditProductPageBody({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ storeId?: string }>;
}) {
  const { productId } = await params;
  const sp = await searchParams;
  const storeId = typeof sp.storeId === "string" ? sp.storeId.trim() : "";
  const pid = typeof productId === "string" ? productId.trim() : "";

  if (!storeId || !pid) {
    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <p className="text-[14px] text-sam-fg">
          주소에 <code className="rounded bg-sam-surface-muted px-1">storeId</code> 쿼리가 필요합니다.{" "}
          <Link href="/my/business" className="font-medium text-signature underline">
            내 상점
          </Link>
          에서 「상품 등록」으로 들어가 상품을 선택해 주세요.
        </p>
      </div>
    );
  }

  return <OwnerProductForm mode="edit" storeId={storeId} productId={pid} />;
}
