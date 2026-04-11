"use client";

import type { MyPageMobileSectionDef } from "@/lib/mypage/mypage-mobile-nav-registry";
import { buildMypageItemHref } from "@/lib/mypage/mypage-mobile-nav-registry";
import { MyPageAdminMenuEntry } from "@/components/mypage/MyPageAdminMenuEntry";
import { MyPageMobileMenuRow } from "@/components/mypage/mobile/MyPageMobileMenuRow";
import { MyPageStackShell } from "@/components/mypage/mobile/MyPageStackShell";

export function MyPageSectionMenuClient({ section }: { section: MyPageMobileSectionDef }) {
  const showAdminEntry = section.id === "settings";

  return (
    <MyPageStackShell title={section.label} backHref="/mypage">
      <div className="overflow-hidden rounded-ui-rect border border-gray-200 bg-white">
        {section.items.map((it) => (
          <MyPageMobileMenuRow
            key={it.id}
            href={buildMypageItemHref(section.id, it.id)}
            title={it.label}
          />
        ))}
        {showAdminEntry ? (
          <div className="border-t border-gray-200 bg-ui-page">
            <MyPageAdminMenuEntry />
          </div>
        ) : null}
      </div>
    </MyPageStackShell>
  );
}
