"use client";

import { useCallback, useState, useEffect } from "react";
import type { Product, ProductStatusLog } from "@/lib/types/product";
import { getAdminProductByIdFromDb } from "@/lib/admin-products/getAdminProductsFromDb";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminProductActionPanel } from "./AdminProductActionPanel";
import { AdminProductStatusLogList } from "./AdminProductStatusLogList";
import { formatMoneyPhp } from "@/lib/utils/format";

interface AdminProductDetailPageProps {
  productId: string;
}

export function AdminProductDetailPage({ productId }: AdminProductDetailPageProps) {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<ProductStatusLog[]>([]);

  const refreshDetail = useCallback(async () => {
    setLoading(true);
    const data = await getAdminProductByIdFromDb(productId);
    setProduct(data ?? null);
    setLogs([]);
    setLoading(false);
  }, [productId]);

  useEffect(() => {
    refreshDetail();
  }, [refreshDetail]);

  if (loading && !product) {
    return (
      <div className="py-8 text-center text-[14px] text-gray-500">
        불러오는 중…
      </div>
    );
  }

  if (!product) {
    return (
      <div className="py-8 text-center text-[14px] text-gray-500">
        상품을 찾을 수 없습니다.
      </div>
    );
  }

  const images = product.images?.length ? product.images : (product.thumbnail ? [product.thumbnail] : []);

  return (
    <div className="space-y-4">
      <AdminPageHeader title="상품 상세" backHref="/admin/products" />

      <AdminCard title="기본 정보">
        <div className="flex gap-4">
          {images.length > 0 ? (
            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-ui-rect bg-gray-100">
              <img
                src={images[0]}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div className="h-24 w-24 shrink-0 rounded-ui-rect bg-gray-100" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-gray-900">{product.title}</p>
            <p className="mt-1 text-[14px] font-medium text-gray-800">
              {formatMoneyPhp(product.price)}
            </p>
            <AdminStatusBadge status={product.status} className="mt-2" />
            <p className="mt-2 text-[13px] text-gray-500">
              등록 {new Date(product.createdAt).toLocaleString("ko-KR")}
              {product.updatedAt && (
                <> · 수정 {new Date(product.updatedAt).toLocaleString("ko-KR")}</>
              )}
            </p>
            <Link
              href={`/post/${product.id}`}
              className="mt-2 inline-block text-[13px] font-medium text-signature hover:underline"
            >
              웹에서 보기
            </Link>
          </div>
        </div>
      </AdminCard>

      <AdminCard title="판매자">
        <dl className="grid gap-1 text-[14px]">
          <div>
            <dt className="text-gray-500">닉네임</dt>
            <dd>{product.seller?.nickname ?? product.sellerId ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">ID</dt>
            <dd>{product.seller?.id ?? product.sellerId ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">지역</dt>
            <dd>{product.seller?.location ?? product.location ?? "-"}</dd>
          </div>
        </dl>
      </AdminCard>

      <AdminCard title="상품 정보">
        <dl className="grid gap-2 text-[14px]">
          <div>
            <dt className="text-gray-500">카테고리</dt>
            <dd>{product.category ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">지역</dt>
            <dd>{product.location}</dd>
          </div>
          <div>
            <dt className="text-gray-500">찜 / 채팅 / 조회</dt>
            <dd>
              {product.likesCount ?? 0} / {product.chatCount ?? 0} /{" "}
              {product.viewCount ?? 0}
            </dd>
          </div>
          {product.reportCount != null && product.reportCount > 0 && (
            <div>
              <dt className="text-gray-500">신고 수</dt>
              <dd>{product.reportCount}</dd>
            </div>
          )}
          {product.description && (
            <div>
              <dt className="text-gray-500">설명</dt>
              <dd className="whitespace-pre-wrap text-gray-700">
                {product.description}
              </dd>
            </div>
          )}
        </dl>
      </AdminCard>

      <AdminCard title="처리">
        <AdminProductActionPanel product={product} onActionSuccess={refreshDetail} />
      </AdminCard>

      <AdminCard title="상태 변경 이력">
        <AdminProductStatusLogList logs={logs} />
        {logs.length === 0 && (
          <p className="text-[13px] text-gray-500">상태 변경 이력은 DB 연동 후 제공됩니다.</p>
        )}
      </AdminCard>
    </div>
  );
}
