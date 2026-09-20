"use client";

import Link from "next/link";
import { AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { findAdminMenuByKey } from "@/lib/admin/find-admin-menu-item";
import { adminMenu } from "@/components/admin/admin-menu";
import {
  ADS_WORKSPACE_HREF,
  promotionWorkspacePurposeCopy,
} from "@/lib/admin/promotion-ownership-visibility";

const ENTRIES = [
  {
    key: "promotion-events",
    href: "/admin/platform-events",
    ko: "이벤트",
    en: "Events",
    descKo: "고객이 보는 이벤트 콘텐츠와 이벤트 페이지를 관리합니다.",
    descEn: "Manage event content and the public event page customers see.",
  },
  {
    key: "promotion-popup",
    href: "/admin/platform-popup",
    ko: "팝업",
    en: "Popups",
    descKo: "앱 화면 위에 표시되는 프로모션 팝업을 관리합니다.",
    descEn: "Manage promotion popups shown over the app screen.",
  },
  {
    key: "promotion-banners",
    href: "/admin/platform-promotion/banners",
    ko: "배너",
    en: "Banners",
    descKo: "커뮤니티·거래 화면 안에 노출되는 이벤트 배너를 관리합니다.",
    descEn: "Manage event banners shown inside Community and Trade screens.",
  },
  {
    key: "promotion-notifications",
    href: "/admin/platform-promotion/notifications",
    ko: "알림",
    en: "Notifications",
    descKo: "Push 알림과 앱 알림함 전달을 관리합니다.",
    descEn: "Manage Push delivery and in-app notification inbox.",
  },
  {
    key: "promotion-owner-requests",
    href: "/admin/platform-event-owner-requests",
    ko: "오너 요청",
    en: "Owner requests",
    descKo: "매장 오너가 신청한 프로모션을 검토합니다.",
    descEn: "Review promotion requests submitted by store owners.",
  },
] as const;

export function AdminPromotionLandingClient() {
  const { language, safeT } = useI18n();
  const lang = language === "en" ? "en" : "ko";

  return (
    <div className="space-y-6 p-4" data-admin-promotion-landing="1">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">
            {safeT("admin_menu_promotion", {
              fallbackKo: "프로모션 / 이벤트",
              fallbackEn: "Promotion / Events",
            })}
          </h1>
          <p
            className="mt-1 max-w-2xl text-sm text-sam-muted"
            data-admin-promotion-workspace-purpose="1"
          >
            {safeT("admin_promotion_landing_desc", {
              fallbackKo: promotionWorkspacePurposeCopy("ko"),
              fallbackEn: promotionWorkspacePurposeCopy("en"),
            })}
          </p>
        </div>
        <AdminActionLink
          href="/admin/platform-events/new"
          variant="primary"
          data-admin-promotion-create-cta="1"
        >
          {safeT("admin_platform_events_create", {
            fallbackKo: "새 이벤트 만들기",
            fallbackEn: "Create event",
          })}
        </AdminActionLink>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ENTRIES.map((entry) => {
          const menu = findAdminMenuByKey(adminMenu, entry.key);
          const href = menu?.path || entry.href;
          return (
            <li key={entry.key}>
              <Link
                href={href}
                data-admin-promotion-entry={entry.key}
                className="block rounded-ui-rect border border-sam-border bg-sam-surface p-4 hover:bg-sam-fg/5"
              >
                <div className="font-semibold">{lang === "en" ? entry.en : entry.ko}</div>
                <p className="mt-1 text-xs text-sam-muted">
                  {lang === "en" ? entry.descEn : entry.descKo}
                </p>
                <p className="mt-2 text-[11px] font-medium text-sam-fg/80">
                  {lang === "en" ? "Go to management →" : "관리 화면으로 →"}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-sam-muted" data-admin-promotion-paid-ads-note="1">
        {safeT("admin_promotion_paid_ads_note", {
          fallbackKo:
            "유료 광고와 광고 노출 위치/재고는 「광고 / 노출」에서 관리합니다. 인라인 이벤트 배너는 노출 위치 현황에도 표시됩니다.",
          fallbackEn:
            "Paid ads and placement inventory live under Ads / Exposure. Inline event banners also appear on Placement status.",
        })}{" "}
        <AdminActionLink href={ADS_WORKSPACE_HREF} variant="quiet">
          {safeT("admin_menu_ads", { fallbackKo: "광고 / 노출", fallbackEn: "Ads / Exposure" })}
        </AdminActionLink>
      </p>
    </div>
  );
}
