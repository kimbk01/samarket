"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { resolveProfileLocationAddressLines } from "@/lib/profile/profile-location";
import { MannerBatteryDisplay } from "@/components/trust/MannerBatteryDisplay";
import { MyPageContent } from "./MyPageContent";
import { buildMyPageHref, normalizeMyPageSection, normalizeMyPageTab } from "./mypage-nav";
import { MyPageSidebar } from "./MyPageSidebar";
import type { MyPageConsoleProps } from "./types";

export function MyPageConsole(props: MyPageConsoleProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeTab = normalizeMyPageTab(searchParams.get("tab"));
  const activeSection = normalizeMyPageSection(activeTab, searchParams.get("section"));
  const displayName = props.profile.nickname?.trim() || props.profile.email?.split("@")[0] || "내정보";
  const regionLine = resolveProfileLocationAddressLines(props.profile).join(" · ") || "지역 설정 필요";

  const todayItems = useMemo(
    () => [
      {
        label: "진행중 거래",
        value: String((props.overviewCounts.purchases ?? 0) + (props.overviewCounts.sales ?? 0)),
        href: buildMyPageHref("trade", "sales"),
      },
      {
        label: "미확인 알림",
        value: props.notificationBadge ?? "0",
        href: buildMyPageHref("messenger", "alerts"),
      },
      {
        label: "주문 상태",
        value: props.storeAttentionSummary ?? "확인",
        href: buildMyPageHref("store", "orders"),
      },
      {
        label: "관심 사용자",
        value: props.favoriteBadge ?? "0",
        href: buildMyPageHref("account", "favorite-users"),
      },
    ],
    [props.favoriteBadge, props.notificationBadge, props.overviewCounts.purchases, props.overviewCounts.sales, props.storeAttentionSummary]
  );

  return (
    <div className="space-y-4 px-4 py-4">
      <section className="rounded-[4px] border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <p className="text-[14px] font-semibold text-gray-900">{displayName}</p>
            <p className="text-[12px] text-gray-500">{regionLine}</p>
            <div className="pt-1">
              <MannerBatteryDisplay raw={props.mannerScore} size="sm" layout="inline" className="gap-1.5" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/mypage/edit"
              className="rounded-[4px] border border-gray-200 px-3 py-2 text-[12px] font-medium text-gray-700"
            >
              프로필 수정
            </Link>
            <Link
              href={buildMyPageHref("settings", "address")}
              className="rounded-[4px] border border-gray-200 px-3 py-2 text-[12px] font-medium text-gray-700"
            >
              주소 관리
            </Link>
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-[4px] border border-gray-900 px-3 py-2 text-[12px] font-semibold text-gray-900 lg:hidden"
            >
              메뉴
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {todayItems.map((item) => (
            <button
              key={`${item.label}:${item.href}`}
              type="button"
              onClick={() => router.replace(item.href, { scroll: false })}
              className="rounded-[4px] border border-gray-200 bg-gray-50 px-3 py-3 text-left"
            >
              <p className="text-[11px] text-gray-500">{item.label}</p>
              <p className="mt-1 text-[14px] font-semibold text-gray-900">{item.value}</p>
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[260px,minmax(0,1fr)]">
        <div className="hidden lg:block lg:self-start lg:sticky lg:top-[76px]">
          <MyPageSidebar activeTab={activeTab} activeSection={activeSection} />
        </div>
        <MyPageContent activeTab={activeTab} activeSection={activeSection} {...props} />
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-[120] bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)}>
          <div
            className="h-full w-[85vw] max-w-[320px] overflow-y-auto bg-white p-3"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between border-b border-gray-200 pb-3">
              <p className="text-[14px] font-semibold text-gray-900">내정보 메뉴</p>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-[4px] border border-gray-200 px-3 py-1.5 text-[12px] text-gray-700"
              >
                닫기
              </button>
            </div>
            <MyPageSidebar
              activeTab={activeTab}
              activeSection={activeSection}
              onClose={() => setMobileOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
