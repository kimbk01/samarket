"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MyPageMobileSectionDef } from "@/lib/mypage/mypage-mobile-nav-registry";
import { buildMypageItemHref } from "@/lib/mypage/mypage-mobile-nav-registry";
import { MyPageAdminMenuEntry } from "@/components/mypage/MyPageAdminMenuEntry";
import { MyPageMobileMenuRow } from "@/components/mypage/mobile/MyPageMobileMenuRow";
import { MyPageStackShell } from "@/components/mypage/mobile/MyPageStackShell";
import { useClientMembershipState } from "@/hooks/use-client-membership-state";
import { MypageGuestSubrouteRedirect } from "@/components/mypage/MypageGuestSubrouteRedirect";
import { getCurrentUser } from "@/lib/auth/get-current-user";

export function MyPageSectionMenuClient({ section }: { section: MyPageMobileSectionDef }) {
  const { t, safeT } = useI18n();
  const membership = useClientMembershipState("mypage-section-menu");
  const showAdminEntry = section.id === "settings";
  // 세션 사용자 있으면 정적 메뉴 즉시 표시 (terminal checking 에서 "…" 고착 방지 — MyContent 와 동일)
  const sessionUser = getCurrentUser();
  const treatAsMember = Boolean(sessionUser?.id) || membership.status === "member";

  if (!treatAsMember && membership.status === "checking") {
    return (
      <MyPageStackShell title={safeT(section.labelKey)} backHref="/mypage">
        <div className="py-6 text-center sam-text-body text-sam-muted">{t("mypage_comp_loading_ellipsis")}</div>
      </MyPageStackShell>
    );
  }

  if (!treatAsMember && membership.status === "guest") {
    return (
      <MyPageStackShell title={safeT(section.labelKey)} backHref="/mypage">
        <MypageGuestSubrouteRedirect />
      </MyPageStackShell>
    );
  }

  return (
    <MyPageStackShell title={safeT(section.labelKey)} backHref="/mypage">
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {section.items.map((it) => (
          <li key={it.id} className="list-none">
            <MyPageMobileMenuRow
              href={buildMypageItemHref(section.id, it.id)}
              title={safeT(it.labelKey)}
              description={it.descriptionKey ? safeT(it.descriptionKey) : undefined}
              surface="card"
            />
          </li>
        ))}
        {showAdminEntry ? <MyPageAdminMenuEntry asListItem /> : null}
      </ul>
    </MyPageStackShell>
  );
}
