"use client";

/**
 * Trade Admin Post Detail — Lightweight Control Center.
 * Initial: post row + count signals only. Relations = LINK OUT / deferred (no embed preload).
 */

import { useCallback, useState, useEffect } from "react";
import type { Product } from "@/lib/types/product";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminProductActionPanel } from "./AdminProductActionPanel";
import { formatMoneyPhp } from "@/lib/utils/format";
import {
  buildAdminTradeChatsHref,
  buildAdminTradeFlowHref,
} from "@/lib/admin-products/admin-trade-deep-link";
import {
  ConsoleButton,
  TradePromoBadge,
  TradeStatusBadge,
} from "@/components/admin/trade-console/trade-console-ui";

interface AdminProductDetailPageProps {
  productId: string;
  initialProduct?: Product | null;
}

function adminProductLocale(language: string): string {
  if (language === "en") return "en-US";
  if (language === "zh-CN") return "zh-CN";
  return "ko-KR";
}

function DrillRow({
  href,
  label,
  meta,
}: {
  href: string;
  label: string;
  meta?: string;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="flex items-center justify-between gap-2 border-b border-sam-border-soft px-1 py-3 sam-text-body text-sam-fg last:border-b-0 hover:bg-sam-surface-muted/50"
    >
      <span className="min-w-0 truncate">
        {label}
        {meta ? <span className="ml-2 text-sam-muted">{meta}</span> : null}
      </span>
      <span className="shrink-0 text-sam-muted" aria-hidden>
        ›
      </span>
    </Link>
  );
}

export function AdminProductDetailPage({
  productId,
  initialProduct = null,
}: AdminProductDetailPageProps) {
  const { t, language, safeT } = useI18n();
  const locale = adminProductLocale(language);
  const [product, setProduct] = useState<Product | null>(initialProduct);
  const [loading, setLoading] = useState(!initialProduct);

  const refreshDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch(
        `/api/admin/posts-management?id=${encodeURIComponent(productId)}`,
        {
          cache: "no-store",
          credentials: "include",
          cacheTtlMs: 0,
          dedupeKey: `admin:posts-management:by-id:${productId}`,
        }
      );
      const raw = (await res.json().catch(() => ({}))) as {
        products?: Product[];
      };
      const row = Array.isArray(raw.products) ? raw.products[0] : null;
      setProduct(row && row.id === productId ? row : null);
    } catch {
      setProduct(null);
    }
    setLoading(false);
  }, [productId]);

  useEffect(() => {
    if (initialProduct?.id === productId) return;
    void refreshDetail();
  }, [initialProduct, productId, refreshDetail]);

  if (loading && !product) {
    return (
      <div className="py-8 text-center sam-text-body text-sam-muted">
        {t("admin_dashboard_loading")}
      </div>
    );
  }

  if (!product) {
    return (
      <div className="py-8 text-center sam-text-body text-sam-muted">
        {t("admin_products_not_found")}
      </div>
    );
  }

  const images = product.images?.length
    ? product.images
    : product.thumbnail
      ? [product.thumbnail]
      : [];
  const promoActive = Boolean(
    product.hasPromotionOverlay || product.isPromoted || product.isBoosted
  );
  const sellerId = product.seller?.id ?? product.sellerId ?? "";
  const sellerLabel = (product.seller?.nickname ?? sellerId) || "—";
  const categoryLabel =
    product.categoryName ?? product.category ?? product.categorySlug ?? "—";
  const reportCount = product.reportCount ?? 0;
  const chatCount = product.chatCount ?? 0;
  const fromPostQ = `fromPost=${encodeURIComponent(product.id)}`;

  return (
    <div className="mx-auto max-w-3xl space-y-3" data-admin>
      <Link
        href="/admin/posts-management"
        prefetch={false}
        className="sam-text-body-secondary text-signature hover:underline"
      >
        ← {t("admin_posts_mgmt_page_title")}
      </Link>

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="sam-text-page-title font-semibold text-sam-fg">{product.title}</h1>
              <TradeStatusBadge status={product.status} />
            </div>
            <p className="mt-1 sam-text-section-title font-semibold tabular-nums text-sam-fg">
              {formatMoneyPhp(product.price)}
              {product.location ? (
                <span className="ml-2 font-normal sam-text-body text-sam-muted">
                  · {product.location}
                </span>
              ) : null}
            </p>
            <p className="mt-1 font-mono sam-text-xxs text-sam-muted">POST {product.id}</p>
          </div>
          <Link
            href={`/post/${product.id}`}
            prefetch={false}
            className="sam-text-body-secondary text-signature hover:underline"
          >
            {t("admin_products_view_on_web")}
          </Link>
        </div>

        {sellerId ? (
          <Link
            href={`/admin/users/${sellerId}?${fromPostQ}`}
            prefetch={false}
            className="mt-3 flex items-center justify-between gap-2 rounded-ui-rect border border-sam-border-soft px-3 py-2 sam-text-body text-sam-fg hover:bg-sam-surface-muted/50"
          >
            <span>
              {safeT("admin_products_dt_nickname", {
                fallbackKo: "판매자",
                fallbackEn: "Seller",
              })}
              : <span className="font-medium">{sellerLabel}</span>
              {product.seller?.username ? (
                <span className="ml-1 font-mono sam-text-xxs text-sam-muted">
                  @{product.seller.username}
                </span>
              ) : null}
            </span>
            <span className="text-sam-muted" aria-hidden>
              ›
            </span>
          </Link>
        ) : null}

        <p className="mt-2 sam-text-xxs text-sam-muted">
          {safeT("admin_products_dt_registered", {
            fallbackKo: "등록",
            fallbackEn: "Registered",
          })}
          : {new Date(product.createdAt).toLocaleString(locale)}
          {product.updatedAt ? (
            <>
              {" · "}
              {safeT("admin_products_dt_updated", {
                fallbackKo: "수정",
                fallbackEn: "Updated",
              })}
              : {new Date(product.updatedAt).toLocaleString(locale)}
            </>
          ) : null}
        </p>
      </div>

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="mb-3 sam-text-body font-semibold text-sam-fg">
          {safeT("admin_products_section_listing", {
            fallbackKo: "게시물 정보",
            fallbackEn: "Listing",
          })}
        </h2>
        {images[0] ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin ops media
          <img
            src={images[0]}
            alt=""
            className="mb-3 aspect-[4/3] w-full max-w-md rounded-ui-rect object-cover"
          />
        ) : (
          <div className="mb-3 aspect-[4/3] max-w-md rounded-ui-rect bg-sam-surface-muted" />
        )}
        <dl className="grid gap-2 sam-text-body-secondary">
          <div>
            <dt className="sam-text-xxs text-sam-muted">
              {safeT("admin_products_dt_category", {
                fallbackKo: "카테고리",
                fallbackEn: "Category",
              })}
            </dt>
            <dd>{categoryLabel}</dd>
          </div>
          <div>
            <dt className="sam-text-xxs text-sam-muted">
              {t("admin_products_dt_region")}
            </dt>
            <dd>{product.location || "—"}</dd>
          </div>
          {product.sellerListingState ? (
            <div>
              <dt className="sam-text-xxs text-sam-muted">
                {safeT("admin_products_dt_listing_state", {
                  fallbackKo: "거래 표시",
                  fallbackEn: "Listing state",
                })}
              </dt>
              <dd>{product.sellerListingState}</dd>
            </div>
          ) : null}
          {product.reservedBuyerId ? (
            <div>
              <dt className="sam-text-xxs text-sam-muted">
                {safeT("admin_products_dt_reserved_buyer", {
                  fallbackKo: "예약 구매자",
                  fallbackEn: "Reserved buyer",
                })}
              </dt>
              <dd>
                <Link
                  href={`/admin/users/${product.reservedBuyerId}?${fromPostQ}`}
                  className="font-mono text-signature hover:underline"
                >
                  {product.reservedBuyerId}
                </Link>
              </dd>
            </div>
          ) : null}
          {product.soldBuyerId ? (
            <div>
              <dt className="sam-text-xxs text-sam-muted">
                {safeT("admin_products_dt_sold_buyer", {
                  fallbackKo: "판매 확정 구매자",
                  fallbackEn: "Confirmed buyer",
                })}
              </dt>
              <dd>
                <Link
                  href={`/admin/users/${product.soldBuyerId}?${fromPostQ}`}
                  className="font-mono text-signature hover:underline"
                >
                  {product.soldBuyerId}
                </Link>
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="sam-text-xxs text-sam-muted">
              {safeT("admin_products_dt_body", {
                fallbackKo: "설명",
                fallbackEn: "Description",
              })}
            </dt>
            <dd className="whitespace-pre-wrap">
              {product.description?.trim() ? product.description : "—"}
            </dd>
          </div>
        </dl>
      </div>

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1">
        <DrillRow
          href={buildAdminTradeFlowHref(product)}
          label={safeT("admin_products_drill_trade", {
            fallbackKo: "거래",
            fallbackEn: "Trade",
          })}
        />
        <DrillRow
          href={buildAdminTradeChatsHref(product)}
          label={safeT("admin_products_drill_chats", {
            fallbackKo: "채팅",
            fallbackEn: "Chats",
          })}
          meta={String(chatCount)}
        />
        <DrillRow
          href={`/admin/reports?domain=trade&target_type=product&target=${encodeURIComponent(product.id)}`}
          label={safeT("admin_products_drill_reports", {
            fallbackKo: "신고",
            fallbackEn: "Reports",
          })}
          meta={String(reportCount)}
        />
        <DrillRow
          href="/admin/ad-applications?domain=trade"
          label={safeT("admin_products_drill_promo", {
            fallbackKo: "홍보",
            fallbackEn: "Promotion",
          })}
          meta={promoActive ? "ON" : undefined}
        />
        <DrillRow
          href={`/admin/audit-logs?target_type=post&target_id=${encodeURIComponent(product.id)}`}
          label={safeT("admin_products_drill_history", {
            fallbackKo: "관리 이력",
            fallbackEn: "Admin history",
          })}
        />
      </div>

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <AdminProductActionPanel product={product} onActionSuccess={refreshDetail} />
        <p className="mt-3 sam-text-xxs text-sam-muted">
          {safeT("admin_products_permanent_delete_not_ready", {
            fallbackKo: "영구 삭제 — NOT_READY (dependency 미완).",
            fallbackEn: "Permanent delete — NOT_READY.",
          })}
        </p>
        <ConsoleButton variant="danger" size="sm" className="mt-2" disabled>
          {safeT("admin_products_permanent_delete_cta", {
            fallbackKo: "영구 삭제 (NOT_READY)",
            fallbackEn: "Permanent delete (NOT_READY)",
          })}
        </ConsoleButton>
      </div>
    </div>
  );
}
