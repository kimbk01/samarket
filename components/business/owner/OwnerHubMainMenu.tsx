"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import type { BusinessAdminSidebarSection } from "@/lib/business/business-admin-nav";
import { isBusinessAdminNavHrefActive } from "@/lib/business/business-admin-nav";
import { resolveOwnerHubMenuIcon } from "@/lib/business/owner-hub-menu-icons";
import { MYINFO_SURFACE, MYINFO_TYPO } from "@/components/mypage/myinfo/myinfo-theme";
import { MyInfoMenuSection } from "@/components/mypage/myinfo/MyInfoMenuSection";

function OwnerHubMenuRow({
  title,
  description,
  href,
  pathname,
  searchParams,
  badge,
}: {
  title: string;
  description?: string;
  href: string;
  pathname: string;
  searchParams: ReturnType<typeof useSearchParams>;
  badge?: number;
}) {
  const active = isBusinessAdminNavHrefActive(href, pathname, searchParams);
  const Icon = resolveOwnerHubMenuIcon(title);

  const rowTone = active ? "bg-[#E7F3FF]" : "bg-transparent";

  return (
    <Link
      href={href}
      className={`flex ${MYINFO_SURFACE.row} w-full min-w-0 items-center gap-3 px-4 py-3 transition-[transform,background-color,opacity] duration-100 hover:bg-sam-app active:scale-[0.99] active:opacity-95 ${rowTone}`}
      aria-current={active ? "page" : undefined}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-sam-app text-sam-fg">
        <Icon className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate ${MYINFO_TYPO.menuTitle} text-sam-fg`}>{title}</span>
        {description?.trim() ? (
          <span className={`mt-0.5 block truncate ${MYINFO_TYPO.subText}`}>{description.trim()}</span>
        ) : null}
      </span>
      {badge != null && badge > 0 ? (
        <span className="inline-flex min-h-[20px] min-w-[20px] shrink-0 items-center justify-center rounded-full bg-red-600 px-1.5 sam-text-xxs font-bold text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
      <ChevronRight className="h-[18px] w-[18px] shrink-0 text-sam-meta" strokeWidth={2} aria-hidden />
    </Link>
  );
}

export function OwnerHubMainMenu({
  sections,
  pathname,
}: {
  sections: BusinessAdminSidebarSection[];
  pathname: string;
}) {
  const searchParams = useSearchParams();
  return (
    <div className="space-y-4 px-1 py-2">
      {sections.map((section) => (
        <MyInfoMenuSection key={section.title} title={section.title}>
          {section.items.map((item) => (
            <OwnerHubMenuRow
              key={item.label + item.href}
              title={item.label}
              description={item.description}
              href={item.href}
              pathname={pathname}
              searchParams={searchParams}
              badge={item.badge}
            />
          ))}
        </MyInfoMenuSection>
      ))}
    </div>
  );
}
