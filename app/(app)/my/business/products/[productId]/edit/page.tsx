import Link from "next/link";
import { OwnerProductForm } from "@/components/business/owner/OwnerProductForm";

export default async function OwnerEditProductPage({
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
      <div className="min-h-screen bg-gray-50 px-4 py-8">
        <p className="text-[14px] text-gray-700">
          주소에 <code className="rounded bg-gray-100 px-1">storeId</code> 쿼리가 필요합니다.{" "}
          <Link href="/my/business" className="font-medium text-signature underline">
            내 상점
          </Link>
          에서 「메뉴 관리」로 들어가 상품을 선택해 주세요.
        </p>
      </div>
    );
  }

  return <OwnerProductForm mode="edit" storeId={storeId} productId={pid} />;
}
