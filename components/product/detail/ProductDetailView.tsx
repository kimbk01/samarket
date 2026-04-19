"use client";

import { useEffect, useMemo, useState, useCallback, useLayoutEffect, useRef } from "react";
import type { Product } from "@/lib/types/product";
import type { ChatRoomSource } from "@/lib/types/chat";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getCurrentUserId } from "@/lib/regions/mock-user-regions";
import { recordRecentView } from "@/lib/recommendation/mock-recent-viewed-products";
import { logEvent } from "@/lib/recommendation/mock-user-behavior-events";
import { getAppSettings } from "@/lib/app-settings";
import { formatPrice, formatTimeAgo } from "@/lib/utils/format";
import { getTrustSummary } from "@/lib/reviews/trust-utils";
import { ProductImageGallery } from "./ProductImageGallery";
import { ProductSellerCard } from "./ProductSellerCard";
import { ProductDetailMainTier1Sync } from "./ProductDetailMainTier1Sync";
import { ProductActionBar } from "./ProductActionBar";
import { ReportActionSheet } from "@/components/reports/ReportActionSheet";
import { PostSellerTradeStrip } from "@/components/trade/PostSellerTradeStrip";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { APP_MAIN_COLUMN_MAX_WIDTH_CLASS } from "@/lib/ui/app-content-layout";
import {
  recordRouteEntryFetchNetworkFromResources,
  recordRouteEntryFirstContentRender,
  recordRouteEntryFirstInteractive,
  recordRouteEntryFullRender,
  recordRouteEntryJsonParseComplete,
  recordRouteEntryRouteTotalMs,
  scheduleRouteEntryToPaint,
} from "@/lib/runtime/samarket-runtime-debug";

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
  /** RSC에서 조회 — 로그인 구매자만; 있으면 마운트 시 `/api/chat/item/room-id` 생략 */
  initialViewerTradeRoom?: {
    roomId: string | null;
    source: ChatRoomSource | null;
    messengerRoomId?: string | null;
  };
  initialRouteTotalMs?: number;
}

export function ProductDetailView({
  product,
  initialViewerTradeRoom,
  initialRouteTotalMs,
}: ProductDetailViewProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
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
    [product.seller]
  );
  const [reportSheet, setReportSheet] = useState<{
    targetType: "product" | "chat" | "user";
    targetId: string;
    targetUserId: string;
    targetLabel?: string;
  } | null>(null);
  const [existingRoomId, setExistingRoomId] = useState<string | null>(() =>
    initialViewerTradeRoom ? initialViewerTradeRoom.roomId : null
  );
  const [existingRoomSource, setExistingRoomSource] = useState<ChatRoomSource | null>(() =>
    initialViewerTradeRoom ? initialViewerTradeRoom.source : null
  );
  const [existingMessengerRoomId, setExistingMessengerRoomId] = useState<string | null>(() => {
    const m = initialViewerTradeRoom?.messengerRoomId;
    return typeof m === "string" && m.trim() ? m.trim() : null;
  });
  const userId = getCurrentUserId();
  const currency = getAppSettings().defaultCurrency ?? "KRW";
  const amISeller = useMemo(() => {
    const currentId = getCurrentUser()?.id ?? userId;
    if (!currentId) return false;
    return product.sellerId === currentId || product.seller?.id === currentId;
  }, [product.sellerId, product.seller?.id, userId]);

  const refetchExistingRoomId = useCallback(() => {
    if (!product.id || !userId) {
      setExistingRoomId(null);
      setExistingRoomSource(null);
      setExistingMessengerRoomId(null);
      return;
    }
    fetch(`/api/chat/item/room-id?itemId=${encodeURIComponent(product.id)}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { roomId: null }))
      .then((data) => {
        setExistingRoomId(typeof data?.roomId === "string" ? data.roomId : null);
        setExistingRoomSource(
          data?.source === "chat_room" || data?.source === "product_chat" ? data.source : null
        );
        const mid = typeof data?.messengerRoomId === "string" ? data.messengerRoomId.trim() : "";
        setExistingMessengerRoomId(mid || null);
      })
      .catch(() => {
        setExistingRoomId(null);
        setExistingRoomSource(null);
        setExistingMessengerRoomId(null);
      });
  }, [product.id, userId]);

  useEffect(() => {
    if (initialViewerTradeRoom !== undefined) return;
    refetchExistingRoomId();
  }, [initialViewerTradeRoom, refetchExistingRoomId]);

  useRefetchOnPageShowRestore(refetchExistingRoomId, { enableVisibilityRefetch: false });

  const onReportProduct = useCallback(() => {
    setReportSheet({
      targetType: "product",
      targetId: product.id,
      targetUserId: product.seller?.id ?? "",
      targetLabel: product.title,
    });
  }, [product.id, product.seller?.id, product.title]);

  useLayoutEffect(() => {
    recordRouteEntryRouteTotalMs("product_detail", initialRouteTotalMs);
    if (typeof window !== "undefined") {
      recordRouteEntryFetchNetworkFromResources("product_detail", [
        window.location.pathname,
        encodeURIComponent(window.location.pathname),
        "_rsc=",
      ]);
    }
    recordRouteEntryJsonParseComplete("product_detail");
    const root = rootRef.current;
    if (!root) return;
    const title = root.querySelector("h1");
    const price = Array.from(root.querySelectorAll("p")).find((node) => node.textContent?.includes("원"));
    const sellerSection = root.querySelector("section");
    if (title && price && sellerSection) {
      recordRouteEntryFirstContentRender("product_detail");
      scheduleRouteEntryToPaint("product_detail");
    }
    const interactiveTarget = root.querySelector('[data-product-detail-action-bar="true"] button, [data-product-detail-action-bar="true"] a[href]');
    if (interactiveTarget instanceof HTMLElement && !interactiveTarget.hasAttribute("disabled")) {
      recordRouteEntryFirstInteractive("product_detail");
    }
  }, [initialRouteTotalMs]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const title = root.querySelector("h1");
    const hasDescription = product.description ? Boolean(root.textContent?.includes(product.description)) : true;
    const chatButton = root.querySelector('[data-product-detail-action-bar="true"] button, [data-product-detail-action-bar="true"] a[href]');
    const firstImage = root.querySelector("img");
    const imageReady =
      !firstImage || (firstImage instanceof HTMLImageElement && firstImage.complete && firstImage.naturalWidth > 0);
    if (title && hasDescription && chatButton && imageReady) {
      recordRouteEntryFullRender("product_detail");
    }
    if (firstImage instanceof HTMLImageElement && !imageReady) {
      const onLoad = () => recordRouteEntryFullRender("product_detail");
      firstImage.addEventListener("load", onLoad, { once: true });
      return () => firstImage.removeEventListener("load", onLoad);
    }
    return;
  }, [product.description, product.id]);

  return (
    <div ref={rootRef} className="relative w-full min-w-0 bg-sam-surface pb-20">
      <ProductDetailMainTier1Sync
        product={product}
        onReport={onReportProduct}
        hideFavorite={amISeller}
      />
      <div className="grid grid-cols-1 md:grid-cols-12 md:items-start md:gap-6 lg:gap-8">
        <div className="min-w-0 bg-sam-surface md:col-span-5 lg:sticky lg:top-14 lg:z-0 lg:self-start">
          <ProductImageGallery images={images} title={product.title} />
        </div>

        <div className="min-w-0 md:col-span-7">
          {/* 상품 정보 */}
          <section className="border-t border-sam-border-soft px-4 py-4 md:border-t-0">
            {product.isBoosted && (
              <span className="mb-2 inline-block rounded bg-signature px-1.5 py-0.5 text-[11px] font-medium text-white">
                끌올
              </span>
            )}
            <span
              className={`inline-block rounded border-2 border-current px-1.5 py-0.5 text-[11px] font-medium ${
                isSold
                  ? "bg-sam-surface-muted text-sam-muted"
                  : product.status === "reserved"
                    ? "bg-amber-50 text-amber-900"
                    : product.status === "hidden"
                      ? "bg-sam-surface-muted text-sam-muted"
                      : "bg-sam-surface-muted text-sam-fg"
              }`}
            >
              {STATUS_LABEL[product.status]}
            </span>
            <h1 className={`mt-2 text-[20px] font-bold leading-7 text-sam-fg ${isSold ? "opacity-80" : ""}`}>
              {product.title}
            </h1>
            <p className="mt-1 text-[22px] font-bold text-sam-fg">
              {formatPrice(product.price, currency)}
            </p>
            <ul className="mt-3 space-y-1 text-[13px] text-sam-muted">
              {product.category && <li>카테고리 · {product.category}</li>}
              <li>지역 · {product.location}</li>
              <li>등록 · {formatTimeAgo(product.createdAt)}</li>
              <li>{product.viewCount != null ? `조회 ${product.viewCount} · ` : ""}관심 {product.likesCount} · 채팅 {product.chatCount}</li>
            </ul>
          </section>

          {/* 판매자 */}
          {product.seller && (
            <section className="border-t border-sam-border-soft px-4 py-4">
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
        </div>
      </div>

      {/* 상품 설명 — 전체 폭 */}
      {product.description && (
        <section className="border-t border-sam-border-soft px-4 py-4">
          <p className="text-[15px] leading-6 text-sam-fg whitespace-pre-wrap">
            {product.description}
          </p>
        </section>
      )}

      <ProductActionBar
        product={product}
        existingRoomId={existingRoomId}
        existingRoomSource={existingRoomSource}
        existingMessengerRoomId={existingMessengerRoomId}
        amISeller={amISeller}
      />
      {reportSheet && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/50">
          <div
            className={`mx-auto w-full ${APP_MAIN_COLUMN_MAX_WIDTH_CLASS} rounded-t-[length:var(--ui-radius-rect)] bg-sam-surface`}
          >
            <div className="flex items-center justify-between border-b border-sam-border-soft px-4 py-3">
              <h2 className="text-[16px] font-semibold text-sam-fg">신고</h2>
              <button
                type="button"
                onClick={() => setReportSheet(null)}
                className="text-[14px] text-sam-muted"
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
