import Link from "next/link";
import { AdminAdvertisingAuthorityNav } from "@/components/admin/ads/AdminAdvertisingAuthorityNav";

const PRODUCT_LINKS = [
  {
    href: "/admin/feed-ad-products",
    ko: "피드 배너 상품 / Point 가격",
    en: "Feed banner products / Point pricing",
  },
  {
    href: "/admin/delivery-ads/commercial-settings",
    ko: "배달 배너·매장홍보 상품 / Business Cash 가격",
    en: "Delivery banner and store promotion / Business Cash pricing",
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
          상품 정의와 가격만 다룹니다. 신청 승인과 캠페인 운영은 각각 광고 신청, 노출 관리에서 처리합니다.
        </p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        {PRODUCT_LINKS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 hover:bg-sam-app"
          >
            <p className="font-semibold text-sam-fg">{item.ko}</p>
            <p className="mt-1 text-[12px] text-sam-muted">{item.en}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
