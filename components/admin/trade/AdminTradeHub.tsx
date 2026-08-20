"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { fetchAdminPostsManagementDeduped } from "@/lib/admin/fetch-admin-posts-management-deduped";
import type { Product } from "@/lib/types/product";
import type { AdminTradeOverviewCounts } from "@/lib/admin-products/admin-trade-overview-counts";
import {
  ConsoleButton,
  KpiGrid,
  OpsPanel,
  SectionHeader,
  TradeStatusBadge,
} from "@/components/admin/trade-console/trade-console-ui";

/**
 * Trade Overview — lightweight KPI (COUNT) + recent page-1 listings + LINK shortcuts.
 */
export function AdminTradeHub() {
  const { t, safeT } = useI18n();
  const [products, setProducts] = useState<Product[]>([]);
  const [counts, setCounts] = useState<AdminTradeOverviewCounts | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [overviewRes, listRes] = await Promise.all([
        fetch("/api/admin/trade/overview", { credentials: "include", cache: "no-store" }).then((r) =>
          r.json().catch(() => ({}))
        ),
        fetchAdminPostsManagementDeduped({ page: 1, pageSize: 8 }),
      ]);

      if (overviewRes?.ok && overviewRes.counts) {
        setCounts(overviewRes.counts as AdminTradeOverviewCounts);
      } else {
        setCounts(null);
      }

      if (listRes.status >= 200 && listRes.status < 300 && listRes.json && typeof listRes.json === "object") {
        const data = listRes.json as { products?: Product[] };
        setProducts(Array.isArray(data.products) ? data.products : []);
      } else {
        setProducts([]);
      }
    } catch {
      setCounts(null);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const recent = products.slice(0, 8);
  const kpi = (v: number | null | undefined) =>
    loading ? null : v == null ? null : v;

  return (
    <div className="space-y-4" data-admin>
      <SectionHeader
        title={safeT("admin_trade_dashboard_title", {
          fallbackKo: "거래 운영",
          fallbackEn: "Trade operations",
        })}
        description={safeT("admin_trade_dashboard_desc", {
          fallbackKo: "Marketplace의 게시물, 거래, 신고, 홍보 상태를 관리합니다.",
          fallbackEn: "Manage marketplace listings, trades, reports, and promotions.",
        })}
        actions={
          <>
            <ConsoleButton variant="secondary" onClick={() => void load()} disabled={loading}>
              {safeT("admin_posts_mgmt_refresh", {
                fallbackKo: "새로고침",
                fallbackEn: "Refresh",
              })}
            </ConsoleButton>
            <Link href="/admin/posts-management" prefetch={false}>
              <ConsoleButton variant="primary">
                {t("admin_menu_posts_management")}
              </ConsoleButton>
            </Link>
          </>
        }
      />

      <KpiGrid
        items={[
          {
            label: safeT("admin_trade_kpi_listings", {
              fallbackKo: "전체 게시물",
              fallbackEn: "Listings",
            }),
            value: kpi(counts?.listingsTotal),
            disconnected: !loading && counts?.listingsTotal == null,
          },
          {
            label: safeT("admin_trade_kpi_active", {
              fallbackKo: "판매중",
              fallbackEn: "Active",
            }),
            value: kpi(counts?.listingsActive),
            disconnected: !loading && counts?.listingsActive == null,
          },
          {
            label: safeT("admin_trade_kpi_sold", {
              fallbackKo: "판매완료",
              fallbackEn: "Sold",
            }),
            value: kpi(counts?.listingsSold),
            disconnected: !loading && counts?.listingsSold == null,
          },
          {
            label: safeT("admin_trade_kpi_hidden", {
              fallbackKo: "숨김",
              fallbackEn: "Hidden",
            }),
            value: kpi(counts?.listingsHidden),
            disconnected: !loading && counts?.listingsHidden == null,
          },
          {
            label: safeT("admin_trade_kpi_reports", {
              fallbackKo: "신고 대기",
              fallbackEn: "Reports pending",
            }),
            value: kpi(counts?.reportsPending),
            disconnected: !loading && counts?.reportsPending == null,
          },
          {
            label: safeT("admin_trade_kpi_promo", {
              fallbackKo: "홍보중",
              fallbackEn: "Promoted",
            }),
            value: kpi(counts?.promoActive),
            disconnected: !loading && counts?.promoActive == null,
          },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <OpsPanel
          title={safeT("admin_trade_ops_queues", {
            fallbackKo: "운영 대기",
            fallbackEn: "Ops queues",
          })}
          rows={[
            {
              label: safeT("admin_trade_ops_reports", {
                fallbackKo: "신고 검토",
                fallbackEn: "Reports",
              }),
              count: loading ? null : counts?.reportsPending ?? null,
              href: "/admin/reports",
              disconnected: !loading && counts?.reportsPending == null,
            },
            {
              label: safeT("admin_trade_ops_flow", {
                fallbackKo: "거래 운영",
                fallbackEn: "Trade flow",
              }),
              count: null,
              href: "/admin/trade-flow",
              disconnected: false,
            },
            {
              label: safeT("admin_trade_ops_complete", {
                fallbackKo: "구매자 확인",
                fallbackEn: "Buyer confirm",
              }),
              count: null,
              href: "/admin/trade-flow?panel=complete",
              disconnected: false,
            },
            {
              label: safeT("admin_trade_ops_promo", {
                fallbackKo: "더 알리기",
                fallbackEn: "Promote",
              }),
              count: loading ? null : counts?.promoPending ?? null,
              href: "/admin/ad-applications",
              disconnected: !loading && counts?.promoPending == null,
            },
          ]}
        />

        <section className="rounded-ui-rect border border-sam-border bg-sam-surface">
          <div className="flex items-center justify-between border-b border-sam-border px-3 py-2">
            <h2 className="sam-text-body font-semibold text-sam-fg">
              {safeT("admin_trade_link_panel", {
                fallbackKo: "바로가기",
                fallbackEn: "Shortcuts",
              })}
            </h2>
          </div>
          <ul className="divide-y divide-sam-border-soft sam-text-body-secondary">
            {[
              { href: "/admin/posts-management", label: t("admin_menu_posts_management") },
              { href: "/admin/reports", label: t("admin_menu_reports") },
              { href: "/admin/trade-flow", label: t("admin_menu_chat_flow") },
              { href: "/admin/chats/trade", label: t("admin_menu_chat_trade") },
              { href: "/admin/ad-applications", label: t("admin_menu_ads_applications") },
              { href: "/admin/menus/trade", label: t("admin_menu_menu_trade") },
            ].map((row) => (
              <li key={row.href}>
                <Link
                  href={row.href}
                  prefetch={false}
                  className="flex items-center justify-between px-3 py-2.5 hover:bg-sam-surface-muted/80"
                >
                  <span>{row.label}</span>
                  <span className="text-signature">↗</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-ui-rect border border-sam-border bg-sam-surface">
        <div className="flex items-center justify-between border-b border-sam-border px-3 py-2">
          <h2 className="sam-text-body font-semibold text-sam-fg">
            {safeT("admin_trade_recent_listings", {
              fallbackKo: "최근 게시물",
              fallbackEn: "Recent listings",
            })}
          </h2>
          <Link
            href="/admin/posts-management"
            prefetch={false}
            className="sam-text-body-secondary font-medium text-signature hover:underline"
          >
            {t("admin_menu_posts_management")}
          </Link>
        </div>
        {loading ? (
          <p className="px-3 py-6 text-center sam-text-body text-sam-muted">{t("common_loading")}</p>
        ) : recent.length === 0 ? (
          <p className="px-3 py-6 text-center sam-text-body text-sam-muted">—</p>
        ) : (
          <table className="w-full table-fixed text-left sam-text-body-secondary">
            <thead className="border-b border-sam-border sam-text-xxs text-sam-muted">
              <tr>
                <th className="px-3 py-2">
                  {safeT("admin_trade_th_listing", { fallbackKo: "상품", fallbackEn: "Listing" })}
                </th>
                <th className="px-3 py-2">
                  {safeT("admin_trade_th_seller", { fallbackKo: "판매자", fallbackEn: "Seller" })}
                </th>
                <th className="px-3 py-2">
                  {safeT("admin_trade_th_status", { fallbackKo: "상태", fallbackEn: "Status" })}
                </th>
                <th className="px-3 py-2">
                  {safeT("admin_trade_th_created", { fallbackKo: "등록", fallbackEn: "Created" })}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sam-border-soft">
              {recent.map((p) => (
                <tr key={p.id} className="hover:bg-sam-surface-muted/40">
                  <td className="truncate px-3 py-2">
                    <Link
                      href={`/admin/products/${p.id}`}
                      className="font-medium text-signature hover:underline"
                    >
                      {p.title}
                    </Link>
                  </td>
                  <td className="truncate px-3 py-2">
                    {p.seller?.nickname ?? p.sellerId ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <TradeStatusBadge status={p.status} />
                  </td>
                  <td className="px-3 py-2 sam-text-xxs text-sam-muted">
                    {new Date(p.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
