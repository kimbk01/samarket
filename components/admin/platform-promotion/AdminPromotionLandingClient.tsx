"use client";

import Link from "next/link";
import { AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { findAdminMenuByKey } from "@/lib/admin/find-admin-menu-item";
import { adminMenu } from "@/components/admin/admin-menu";

const ENTRIES = [
  {
    key: "promotion-events",
    href: "/admin/platform-events",
    ko: "이벤트",
    en: "Events",
    descKo: "무엇을 프로모션할지 — 콘텐츠 작성·게시",
    descEn: "What you promote — create and publish content",
  },
  {
    key: "promotion-popup",
    href: "/admin/platform-popup",
    ko: "팝업",
    en: "Popups",
    descKo: "어떻게 보일지 — A–D 팝업 노출",
    descEn: "How it appears — A–D popup presentations",
  },
  {
    key: "promotion-banners",
    href: "/admin/platform-promotion/banners",
    ko: "배너",
    en: "Banners",
    descKo: "어디에 보일지 — 인라인/히어로 × 커뮤니티/거래",
    descEn: "Where it appears — Inline/Hero × Community/Trade",
  },
  {
    key: "promotion-notifications",
    href: "/admin/platform-promotion/notifications",
    ko: "알림",
    en: "Notifications",
    descKo: "Push 보내기 vs 앱 알림(Bell) — 저장 ≠ 발송",
    descEn: "Push send vs in-app Bell — Save ≠ Send",
  },
  {
    key: "promotion-owner-requests",
    href: "/admin/platform-event-owner-requests",
    ko: "오너 요청",
    en: "Owner requests",
    descKo: "오너 신청 검토 — 승인 = Event 초안 (게시/발송 아님)",
    descEn: "Review owner requests — Approve = Event draft only",
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
          <p className="mt-1 max-w-2xl text-sm text-sam-muted">
            {safeT("admin_promotion_landing_desc", {
              fallbackKo:
                "플랫폼 프로모션 운영. 유료 광고(광고 / 노출)와 분리된 Admin 권한입니다.",
              fallbackEn:
                "Platform promotion operations. Separate from Paid Ads (Ads / Exposure).",
            })}
          </p>
        </div>
        <AdminActionLink href="/admin/platform-events/new" variant="primary" data-admin-promotion-create-cta="1">
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
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-sam-muted" data-admin-promotion-paid-ads-note="1">
        {safeT("admin_promotion_paid_ads_note", {
          fallbackKo: "유료 광고·슬롯 현황은 「광고 / 노출」 워크스페이스에서 관리합니다.",
          fallbackEn: "Paid ads and slot inventory live under the Ads / Exposure workspace.",
        })}{" "}
        <AdminActionLink href="/admin/advertising" variant="quiet">
          {safeT("admin_menu_ads", { fallbackKo: "광고 / 노출", fallbackEn: "Ads / Exposure" })}
        </AdminActionLink>
      </p>
    </div>
  );
}
