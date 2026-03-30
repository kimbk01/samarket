"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { parseId } from "@/lib/validate-params";
import { AppBackButton } from "@/components/navigation/AppBackButton";

/**
 * 수정 화면 진입 경로 (다음 단계에서 ProductForm + initialValues로 구현)
 */
export default function EditProductPage() {
  const params = useParams();
  const id = parseId(params.id);

  if (!id) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p className="text-[14px] text-gray-600">잘못된 상품 정보예요</p>
        <Link href="/products" className="text-[14px] font-medium text-signature">
          상품 목록으로
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
      <p className="text-[14px] text-gray-600">상품 수정 (다음 단계에서 구현)</p>
      <p className="text-[12px] text-gray-400">상품 ID: {id}</p>
      <AppBackButton className="text-signature hover:bg-signature/10" />
    </div>
  );
}
