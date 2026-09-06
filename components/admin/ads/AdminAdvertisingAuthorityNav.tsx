"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

const NAV_ITEMS = [
  { href: "/admin/advertising", ko: "전체 광고", en: "All ads" },
  { href: "/admin/advertising/applications", ko: "광고 신청", en: "Applications" },
  { href: "/admin/advertising/operations", ko: "노출 관리", en: "Operations" },
  { href: "/admin/advertising/placements", ko: "광고 위치", en: "Placements" },
  { href: "/admin/advertising/products", ko: "광고 상품 / 가격", en: "Products / pricing" },
  { href: "/admin/advertising/history", ko: "광고 이력", en: "History" },
] as const;

export function AdminAdvertisingAuthorityNav() {
  const { language } = useI18n();
  const ko = language !== "en";
  const pathname = usePathname() || "";

  return (
    <nav
      aria-label={ko ? "광고 / 노출 운영 메뉴" : "Ads / Exposure authority menu"}
      className="flex flex-wrap gap-2"
      data-admin-advertising-authority-nav="1"
    >
      {NAV_ITEMS.map((item) => {
        const active =
          item.href === "/admin/advertising"
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-ui-rect border px-3 py-2 text-sm font-semibold ${
              active
                ? "border-sam-brand bg-sam-brand/10 text-sam-fg"
                : "border-sam-border bg-sam-surface text-sam-muted hover:bg-sam-app"
            }`}
            aria-current={active ? "page" : undefined}
          >
            {ko ? item.ko : item.en}
          </Link>
        );
      })}
    </nav>
  );
}
