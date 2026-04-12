import Link from "next/link";
import { OwnerMenuCategoriesClient } from "@/components/business/owner/OwnerMenuCategoriesClient";

export default async function MenuCategoriesPage({
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
          에서 「카테고리」를 눌러 주세요.
        </p>
      </div>
    );
  }
  return <OwnerMenuCategoriesClient storeId={storeId} />;
}
