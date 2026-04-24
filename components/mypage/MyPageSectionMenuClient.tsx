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
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {section.items.map((it) => (
          <li key={it.id} className="list-none">
            <MyPageMobileMenuRow
              href={buildMypageItemHref(section.id, it.id)}
              title={it.label}
              surface="card"
            />
          </li>
        ))}
        {showAdminEntry ? <MyPageAdminMenuEntry asListItem /> : null}
      </ul>
    </MyPageStackShell>
  );
}
