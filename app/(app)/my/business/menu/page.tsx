import Link from "next/link";
import { OwnerMenuManageClient } from "@/components/business/owner/OwnerMenuManageClient";

export default async function OwnerMenuManagePage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string }>;
}) {
  const sp = await searchParams;
  const storeId = typeof sp.storeId === "string" ? sp.storeId.trim() : "";
  if (!storeId) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-8">
        <p className="text-[14px] text-gray-700">
          매장을 지정할 수 없습니다.{" "}
          <Link href="/my/business" className="font-medium text-signature underline">
            내 상점
          </Link>
          에서 「메뉴 관리」를 눌러 주세요.
        </p>
      </div>
    );
  }
  return <OwnerMenuManageClient storeId={storeId} />;
}
