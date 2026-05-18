"use client";

import { useCallback, useState, useEffect } from "react";
import type { Product, ProductStatusLog } from "@/lib/types/product";
import { getAdminProductByIdFromDb } from "@/lib/admin-products/getAdminProductsFromDb";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminProductActionPanel } from "./AdminProductActionPanel";
import { AdminProductStatusLogList } from "./AdminProductStatusLogList";
import { formatMoneyPhp } from "@/lib/utils/format";

interface AdminProductDetailPageProps {
  productId: string;
}

function adminProductLocale(language: string): string {
  if (language === "en") return "en-US";
  if (language === "zh-CN") return "zh-CN";
  return "ko-KR";
}

export function AdminProductDetailPage({ productId }: AdminProductDetailPageProps) {
  const { t, language } = useI18n();
  const locale = adminProductLocale(language);
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

  const images = product.images?.length ? product.images : (product.thumbnail ? [product.thumbnail] : []);

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_products_detail_title" backHref="/admin/products" />

      <AdminCard titleKey="admin_products_card_basic">
        <div className="flex gap-4">
          {images.length > 0 ? (
            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-ui-rect bg-sam-surface-muted">
              <img
                src={images[0]}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div className="h-24 w-24 shrink-0 rounded-ui-rect bg-sam-surface-muted" />
          )}
          <div className="min-w-0 flex-1">
            <p className="sam-text-body font-semibold text-sam-fg">{product.title}</p>
            <p className="mt-1 sam-text-body font-medium text-sam-fg">
              {formatMoneyPhp(product.price)}
            </p>
            <AdminStatusBadge status={product.status} className="mt-2" />
            <p className="mt-2 sam-text-body-secondary text-sam-muted">
              {t("admin_products_registered_at", {
                date: new Date(product.createdAt).toLocaleString(locale),
              })}
              {product.updatedAt && (
                <>
                  {t("admin_products_updated_at", {
                    date: new Date(product.updatedAt).toLocaleString(locale),
                  })}
                </>
              )}
            </p>
            <Link
              href={`/post/${product.id}`}
              className="mt-2 inline-block sam-text-body-secondary font-medium text-signature hover:underline"
            >
              {t("admin_products_view_on_web")}
            </Link>
          </div>
        </div>
      </AdminCard>

      <AdminCard titleKey="admin_products_card_seller">
        <dl className="grid gap-1 sam-text-body">
          <div>
            <dt className="text-sam-muted">{t("admin_products_dt_nickname")}</dt>
            <dd>
              <p className="text-sam-fg">{product.seller?.nickname ?? product.sellerId ?? "-"}</p>
              {product.seller?.username ? (
                <p className="mt-0.5 font-mono sam-text-xxs text-sam-muted tabular-nums">
                  @{product.seller.username}
                </p>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">ID</dt>
            <dd>{product.seller?.id ?? product.sellerId ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_products_dt_region")}</dt>
            <dd>{product.seller?.location ?? product.location ?? "-"}</dd>
          </div>
        </dl>
      </AdminCard>

      <AdminCard titleKey="admin_products_card_info">
        <dl className="grid gap-2 sam-text-body">
          <div>
            <dt className="text-sam-muted">{t("admin_products_dt_category")}</dt>
            <dd>{product.category ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_products_dt_region")}</dt>
            <dd>{product.location}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_products_dt_likes_chats_views")}</dt>
            <dd>
              {product.likesCount ?? 0} / {product.chatCount ?? 0} /{" "}
              {product.viewCount ?? 0}
            </dd>
          </div>
          {product.reportCount != null && product.reportCount > 0 && (
            <div>
              <dt className="text-sam-muted">{t("admin_products_dt_report_count")}</dt>
              <dd>{product.reportCount}</dd>
            </div>
          )}
          {product.description && (
            <div>
              <dt className="text-sam-muted">{t("admin_products_dt_description")}</dt>
              <dd className="whitespace-pre-wrap text-sam-fg">
                {product.description}
              </dd>
            </div>
          )}
        </dl>
      </AdminCard>

      <AdminCard titleKey="admin_products_card_actions">
        <AdminProductActionPanel product={product} onActionSuccess={refreshDetail} />
      </AdminCard>

      <AdminCard titleKey="admin_products_card_status_log">
        <AdminProductStatusLogList logs={logs} />
        {logs.length === 0 && (
          <p className="sam-text-body-secondary text-sam-muted">{t("admin_products_status_log_db_pending")}</p>
        )}
      </AdminCard>
    </div>
  );
}
