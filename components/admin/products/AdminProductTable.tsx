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
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[720px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">ID</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">상품명</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">판매자</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">상태</th>
            <th className="px-3 py-2.5 text-right font-medium text-sam-fg">가격</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">지역</th>
            <th className="px-3 py-2.5 text-right font-medium text-sam-fg">찜/채팅</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">등록일</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} className="border-b border-sam-border-soft hover:bg-sam-app">
              <td className="px-3 py-2.5">
                <Link
                  href={`/admin/products/${p.id}`}
                  className="font-medium text-signature hover:underline"
                >
                  {p.id}
                </Link>
              </td>
              <td className="max-w-[200px] truncate px-3 py-2.5 text-sam-fg">
                {p.title}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {p.seller?.nickname ?? p.sellerId ?? "-"}
              </td>
              <td className="px-3 py-2.5">
                <AdminStatusBadge status={p.status} />
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right text-sam-fg">
                {formatMoneyPhp(p.price)}
              </td>
              <td className="max-w-[120px] truncate px-3 py-2.5 text-sam-muted">
                {p.location}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right text-sam-muted">
                {p.likesCount ?? 0} / {p.chatCount ?? 0}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-sam-muted">
                {new Date(p.createdAt).toLocaleDateString("ko-KR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
