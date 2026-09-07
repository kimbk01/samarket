import Link from "next/link";
import { AdminAdvertisingAuthorityNav } from "@/components/admin/ads/AdminAdvertisingAuthorityNav";
import { ADS_CANONICAL_PRODUCTS } from "@/lib/ads/ads-canonical-product-ssot";

const PRODUCT_ROWS = [
  {
    key: "community_boost" as const,
    href: "/admin/advertising/boosts",
    placements: null as string[] | null,
  },
  {
    key: "trade_boost" as const,
    href: "/admin/advertising/boosts",
    placements: null as string[] | null,
  },
  {
    key: "delivery_store_sponsored" as const,
    href: "/admin/delivery-ads/commercial-settings",
    placements: ["STORES_HOME_FEED", "STORES_CATEGORY_FEED"],
  },
  {
    key: "community_banner" as const,
    href: "/admin/feed-ad-products",
    placements: ["COMMUNITY_HOME", "COMMUNITY_TOPIC"],
  },
  {
    key: "trade_banner" as const,
    href: "/admin/feed-ad-products",
    placements: ["TRADE_HOME", "TRADE_CATEGORY"],
  },
  {
    key: "delivery_home_banner" as const,
    href: "/admin/delivery-ads/commercial-settings",
    placements: ["STORES_HOME_HERO"],
  },
  {
    key: "popup" as const,
    href: "/admin/advertising/operations",
    placements: ["Admin Direct · 결제 없음 · Member/Owner 신규 판매 없음"],
  },
] as const;

export default function AdminAdvertisingProductsPage() {
  return (
    <div className="space-y-4" data-admin-advertising-products="1">
      <AdminAdvertisingAuthorityNav />
      <header className="space-y-1">
        <p className="text-[12px] text-sam-muted">
          <Link href="/admin/advertising" className="underline">
            광고 / 노출
          </Link>
          {" › "}
          광고 상품 / 가격
        </p>
        <h1 className="text-lg font-semibold text-sam-fg">광고 상품 / 가격</h1>
        <p className="text-[13px] text-sam-muted">
          상품 정의와 가격만 다룹니다. 신청 승인과 캠페인 운영은 각각 광고 승인, 노출 관리에서 처리합니다.
          family catalog(promotion-products / feed_ad_products / delivery_ad_packages)가 가격 authority입니다.
        </p>
      </header>
      <div className="grid gap-3">
        {PRODUCT_ROWS.map((row) => {
          const product = ADS_CANONICAL_PRODUCTS[row.key];
          return (
            <Link
              key={row.key}
              href={row.href}
              className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 hover:bg-sam-app"
              data-ads-product-key={row.key}
            >
              <p className="font-semibold text-sam-fg">{product.publicNameKo}</p>
              <p className="mt-1 text-[12px] text-sam-muted">
                {product.actor} · {product.currency}
                {product.approvalRequired ? " · 승인 필요" : " · 승인 없음"}
                {product.sellable ? "" : " · 신규 판매 없음"}
              </p>
              {row.placements?.length ? (
                <ul className="mt-2 space-y-0.5 text-[12px] text-sam-muted">
                  {row.placements.map((p) => (
                    <li key={p}>· {p}</li>
                  ))}
                </ul>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
