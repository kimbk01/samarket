"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

/**
 * Dashboard discoverability for Paid Exposure / Feed Ad ops.
 * CONTRACT: docs/dibay-paid-exposure-feed-ad-master-contract.md §5
 * Must be reachable without memorizing /admin/feed-ads URL.
 */
const REVENUE_LINKS = [
  {
    href: "/admin/ad-applications",
    titleKo: "광고 신청 관리",
    titleEn: "Ad request queue",
    descKo: "회원 피드 광고·레거시 핀 심사",
    descEn: "Member feed ads & legacy pin review",
  },
  {
    href: "/admin/promoted-items",
    titleKo: "게시물 상위 노출",
    titleEn: "Post paid exposure",
    descKo: "거래·커뮤니티 Point 홍보 entitlement",
    descEn: "Trade/Community Point entitlements",
  },
  {
    href: "/admin/feed-ads",
    titleKo: "피드 광고 캠페인",
    titleEn: "Feed ad campaigns",
    descKo: "회원 신청 · 관리자 직접 캠페인",
    descEn: "Member-requested & admin-direct campaigns",
  },
] as const;

export function AdminRevenueOpsStrip() {
  const { language, safeT } = useI18n();
  const en = language === "en";

  return (
    <section
      className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
      data-admin-revenue-ops=""
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="sam-text-body font-semibold text-sam-fg">
            {safeT("admin_revenue_ops_title", {
              fallbackKo: "광고 · 유료노출",
              fallbackEn: "Ads · paid exposure",
            })}
          </h2>
          <p className="mt-0.5 sam-text-helper text-sam-muted">
            {safeT("admin_revenue_ops_hint", {
              fallbackKo: "광고 노출 워크스페이스와 동일 메뉴입니다. 대시보드에서 바로 들어갑니다.",
              fallbackEn: "Same as Ad exposure workspace — open from the dashboard.",
            })}
          </p>
        </div>
        <Link
          href="/admin/ad-applications"
          className="sam-text-helper font-medium text-sam-primary underline-offset-2 hover:underline"
        >
          {en ? "Open Ad exposure → Ads" : "광고 노출 → 광고 · 유료노출"}
        </Link>
      </div>
      <ul className="grid gap-2 sm:grid-cols-3">
        {REVENUE_LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="block h-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-3 transition hover:border-sam-primary hover:bg-sam-primary/5"
            >
              <p className="sam-text-body font-semibold text-sam-fg">
                {en ? link.titleEn : link.titleKo}
              </p>
              <p className="mt-1 sam-text-helper text-sam-muted">
                {en ? link.descEn : link.descKo}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
