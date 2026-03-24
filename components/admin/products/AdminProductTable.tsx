"use client";

import Link from "next/link";
import type { Product } from "@/lib/types/product";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { formatMoneyPhp } from "@/lib/utils/format";

interface AdminProductTableProps {
  products: Product[];
}

export function AdminProductTable({ products }: AdminProductTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[720px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">ID</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">상품명</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">판매자</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">상태</th>
            <th className="px-3 py-2.5 text-right font-medium text-gray-700">가격</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">지역</th>
            <th className="px-3 py-2.5 text-right font-medium text-gray-700">찜/채팅</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">등록일</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-3 py-2.5">
                <Link
                  href={`/admin/products/${p.id}`}
                  className="font-medium text-signature hover:underline"
                >
                  {p.id}
                </Link>
              </td>
              <td className="max-w-[200px] truncate px-3 py-2.5 text-gray-800">
                {p.title}
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {p.seller?.nickname ?? p.sellerId ?? "-"}
              </td>
              <td className="px-3 py-2.5">
                <AdminStatusBadge status={p.status} />
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right text-gray-700">
                {formatMoneyPhp(p.price)}
              </td>
              <td className="max-w-[120px] truncate px-3 py-2.5 text-gray-600">
                {p.location}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right text-gray-600">
                {p.likesCount ?? 0} / {p.chatCount ?? 0}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-gray-500">
                {new Date(p.createdAt).toLocaleDateString("ko-KR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
