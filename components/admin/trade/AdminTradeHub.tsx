"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { fetchAdminPostsManagementDeduped } from "@/lib/admin/fetch-admin-posts-management-deduped";
import type { Product } from "@/lib/types/product";
import {
  ConsoleButton,
  KpiGrid,
  OpsPanel,
  SectionHeader,
  TradeStatusBadge,
} from "@/components/admin/trade-console/trade-console-ui";

/**
 * Trade Dashboard — approved console chrome.
 * KPI without aggregation contract stay `—`. External queues LINK only.
 */
export function AdminTradeHub() {
  const { t, safeT } = useI18n();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { status, json: raw } = await fetchAdminPostsManagementDeduped();
      if (status >= 200 && status < 300 && raw && typeof raw === "object") {
        const data = raw as { products?: Product[] };
        setProducts(Array.isArray(data.products) ? data.products : []);
      } else {
        setProducts([]);
      }
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const recent = products.slice(0, 8);
  const listingTotal = loading ? null : products.length;

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
            value: listingTotal,
            disconnected: listingTotal == null,
          },
          {
            label: safeT("admin_trade_kpi_active", {
              fallbackKo: "판매중",
              fallbackEn: "Active",
            }),
            value: null,
            disconnected: true,
          },
          {
            label: safeT("admin_trade_kpi_sold", {
              fallbackKo: "판매완료",
              fallbackEn: "Sold",
            }),
            value: null,
            disconnected: true,
          },
          {
            label: safeT("admin_trade_kpi_reports", {
              fallbackKo: "신고 대기",
              fallbackEn: "Reports pending",
            }),
            value: null,
            disconnected: true,
          },
          {
            label: safeT("admin_trade_kpi_trades", {
              fallbackKo: "진행 거래",
              fallbackEn: "Open trades",
            }),
            value: null,
            disconnected: true,
          },
          {
            label: safeT("admin_trade_kpi_promo", {
              fallbackKo: "홍보중",
              fallbackEn: "Promoted",
            }),
            value: null,
            disconnected: true,
          },
          {
            label: safeT("admin_trade_kpi_reviews", {
              fallbackKo: "후기",
              fallbackEn: "Reviews",
            }),
            value: null,
            disconnected: true,
          },
          {
            label: safeT("admin_trade_kpi_hidden", {
              fallbackKo: "숨김",
              fallbackEn: "Hidden",
            }),
            value: null,
            disconnected: true,
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
              count: null,
              href: "/admin/reports",
              disconnected: true,
            },
            {
              label: safeT("admin_trade_ops_flow", {
                fallbackKo: "거래 운영",
                fallbackEn: "Trade flow",
              }),
              count: null,
              href: "/admin/trade-flow",
              disconnected: true,
            },
            {
              label: safeT("admin_trade_ops_complete", {
                fallbackKo: "구매자 확인",
                fallbackEn: "Buyer confirm",
              }),
              count: null,
              href: "/admin/chats/trade-complete",
              disconnected: true,
            },
            {
              label: safeT("admin_trade_ops_promo", {
                fallbackKo: "더 알리기",
                fallbackEn: "Promote",
              }),
              count: null,
              href: "/admin/ad-applications",
              disconnected: true,
            },
          ]}
        />

        <section className="rounded-ui-rect border border-sam-border bg-sam-surface">
          <div className="flex items-center justify-between border-b border-sam-border px-3 py-2">
            <h2 className="sam-text-body font-semibold text-sam-fg">
              {safeT("admin_trade_link_panel", {
                fallbackKo: "기존 화면 LINK",
                fallbackEn: "Linked surfaces",
              })}
            </h2>
          </div>
          <ul className="divide-y divide-sam-border-soft sam-text-body-secondary">
            {[
              { href: "/admin/reports", label: t("admin_menu_reports") },
              { href: "/admin/reviews", label: t("admin_menu_trade_reviews") },
              { href: "/admin/chats/trade", label: t("admin_menu_chat_trade") },
              { href: "/admin/menus/trade", label: t("admin_menu_menu_trade") },
              { href: "/admin/trade/settings", label: t("admin_menu_trade_settings") },
              { href: "/admin/favorites", label: t("admin_menu_trade_likes") },
              { href: "/admin/trade-post-ads", label: t("admin_menu_trade_post_ads") },
              { href: "/admin/ad-applications", label: t("admin_menu_ads_applications") },
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
                <th className="px-3 py-2">상품</th>
                <th className="px-3 py-2">판매자</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2">등록</th>
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
                    {new Date(p.createdAt).toLocaleDateString("ko-KR")}
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
