"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import type { Product } from "@/lib/types/product";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getCurrentUserId } from "@/lib/regions/mock-user-regions";
import { recordRecentView } from "@/lib/recommendation/mock-recent-viewed-products";
import { logEvent } from "@/lib/recommendation/mock-user-behavior-events";
import { getAppSettings } from "@/lib/app-settings";
import { formatPrice, formatTimeAgo } from "@/lib/utils/format";
import { getTrustSummary } from "@/lib/reviews/trust-utils";
import { ProductImageGallery } from "./ProductImageGallery";
import { ProductSellerCard } from "./ProductSellerCard";
import { ProductDetailHeader } from "./ProductDetailHeader";
import { ProductActionBar } from "./ProductActionBar";
import { ReportActionSheet } from "@/components/reports/ReportActionSheet";
import { PostSellerTradeStrip } from "@/components/trade/PostSellerTradeStrip";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";

const STATUS_LABEL: Record<Product["status"], string> = {
  active: "판매중",
  reserved: "예약중",
  sold: "판매완료",
  hidden: "숨김",
  blinded: "블라인드",
  deleted: "삭제됨",
};

interface ProductDetailViewProps {
  product: Product;
}

export function ProductDetailView({ product }: ProductDetailViewProps) {
  useEffect(() => {
    const userId = getCurrentUserId();
    recordRecentView(userId, product.id, "home", null);
    logEvent({
      userId,
      eventType: "product_view",
      productId: product.id,
      category: product.category ?? null,
    });
  }, [product.id]);

  const images = product.images?.length ? product.images : [];
  const isSold = product.status === "sold";
  const sellerTrustSummary = useMemo(
    () => (product.seller ? getTrustSummary(product.seller.id) : null),
    [product.seller?.id]
  );
  const [reportSheet, setReportSheet] = useState<{
    targetType: "product" | "chat" | "user";
    targetId: string;
    targetUserId: string;
    targetLabel?: string;
  } | null>(null);
  const [existingRoomId, setExistingRoomId] = useState<string | null>(null);
  const userId = getCurrentUserId();
  const currency = getAppSettings().defaultCurrency ?? "KRW";
  const amISeller = useMemo(() => {
    const currentId = getCurrentUser()?.id ?? userId;
    if (!currentId) return false;
    return product.sellerId === currentId || product.seller?.id === currentId;
  }, [product.sellerId, product.seller?.id, userId]);

  const refetchExistingRoomId = useCallback(() => {
    if (!product.id || !userId) return;
    fetch(`/api/chat/item/room-id?itemId=${encodeURIComponent(product.id)}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { roomId: null }))
      .then((data) => setExistingRoomId(data?.roomId ?? null))
      .catch(() => setExistingRoomId(null));
  }, [product.id, userId]);

  useEffect(() => {
    refetchExistingRoomId();
  }, [refetchExistingRoomId]);

  useRefetchOnPageShowRestore(refetchExistingRoomId, { enableVisibilityRefetch: false });

  const onReportProduct = useCallback(() => {
    setReportSheet({
      targetType: "product",
      targetId: product.id,
      targetUserId: product.seller?.id ?? "",
      targetLabel: product.title,
    });
  }, [product.id, product.seller?.id, product.title]);

  return (
    <div className="relative mx-auto max-w-lg bg-white pb-20">
      <ProductDetailHeader
        productId={product.id}
        onReport={onReportProduct}
        hideFavorite={amISeller}
      />
      <ProductImageGallery images={images} title={product.title} />

      {/* 상품 정보 */}
      <section className="border-t border-gray-100 px-4 py-4">
        {product.isBoosted && (
          <span className="mb-2 inline-block rounded bg-signature px-1.5 py-0.5 text-[11px] font-medium text-white">
            끌올
          </span>
        )}
        <span
          className={`inline-block rounded border-2 border-current px-1.5 py-0.5 text-[11px] font-medium ${
            isSold
              ? "bg-gray-100 text-gray-600"
              : product.status === "reserved"
                ? "bg-amber-50 text-amber-900"
                : product.status === "hidden"
                  ? "bg-gray-100 text-gray-500"
                  : "bg-slate-100 text-gray-700"
          }`}
        >
          {STATUS_LABEL[product.status]}
        </span>
        <h1 className={`mt-2 text-[20px] font-bold leading-7 text-gray-900 ${isSold ? "opacity-80" : ""}`}>
          {product.title}
        </h1>
        <p className="mt-1 text-[22px] font-bold text-gray-900">
          {formatPrice(product.price, currency)}
        </p>
        <ul className="mt-3 space-y-1 text-[13px] text-gray-600">
          {product.category && <li>카테고리 · {product.category}</li>}
          <li>지역 · {product.location}</li>
          <li>등록 · {formatTimeAgo(product.createdAt)}</li>
          <li>{product.viewCount != null ? `조회 ${product.viewCount} · ` : ""}관심 {product.likesCount} · 채팅 {product.chatCount}</li>
        </ul>
      </section>

      {/* 판매자 */}
      {product.seller && (
        <section className="border-t border-gray-100 px-4 py-4">
          <ProductSellerCard
            seller={product.seller}
            trustSummary={sellerTrustSummary ?? undefined}
            onReportUser={() =>
              setReportSheet({
                targetType: "user",
                targetId: product.seller!.id,
                targetUserId: product.seller!.id,
                targetLabel: product.seller!.nickname,
              })
            }
          />
        </section>
      )}

      {amISeller ? (
        <PostSellerTradeStrip postId={product.id} isSeller variant="default" />
      ) : null}

      {/* 상품 설명 */}
      {product.description && (
        <section className="border-t border-gray-100 px-4 py-4">
          <p className="text-[15px] leading-6 text-gray-900 whitespace-pre-wrap">
            {product.description}
          </p>
        </section>
      )}

      <ProductActionBar product={product} existingRoomId={existingRoomId} amISeller={amISeller} />
      {reportSheet && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-t-2xl bg-white">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h2 className="text-[16px] font-semibold text-gray-900">신고</h2>
              <button
                type="button"
                onClick={() => setReportSheet(null)}
                className="text-[14px] text-gray-500"
              >
                닫기
              </button>
            </div>
            <ReportActionSheet
              targetType={reportSheet.targetType}
              targetId={reportSheet.targetId}
              targetUserId={reportSheet.targetUserId}
              targetLabel={reportSheet.targetLabel}
              onClose={() => setReportSheet(null)}
              onSuccess={() => setReportSheet(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
