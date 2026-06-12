"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketUserAvatar } from "@/components/profile/SamarketUserAvatar";
import { MYINFO_SURFACE, MYINFO_TYPO } from "./myinfo-theme";
import {
  MYPAGE_HOME_ADDRESS_ROW_CLASS,
  MYPAGE_HOME_CARD_FOOTER_CLASS,
  MYPAGE_HOME_OUTLINE_BTN_CLASS,
} from "@/lib/ui/mypage-home-starbucks-styles";
import { AddressKindHeadPin } from "@/components/addresses/AddressKindHeadPin";
import { useRequireAuthAction } from "@/hooks/use-require-auth-action";
import { Sam } from "@/lib/ui/css-vars";

/**
 * 비로그인 내정보 프로필 — 로그인 UI와 동일 레이아웃, 프로필 영역에 로그인 안내.
 * 진입 시 모달 자동 오픈 없음 — CTA·메뉴 탭에서만 AuthModal.
 */
export function MyInfoGuestProfileCard({ nextHref = "/mypage" }: { nextHref?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const requireAuth = useRequireAuthAction();

  const openLogin = useCallback(() => {
    void requireAuth(
      "profile_edit",
      () => {
        router.refresh();
      },
      { next: nextHref },
    );
  }, [requireAuth, nextHref, router]);

  const loginButton = (
    <button type="button" onClick={openLogin} className={`${Sam.btn.primary} min-h-11 w-full px-6 md:min-w-[160px] md:flex-none`}>
      {t("profile_guest_login_cta")}
    </button>
  );

  return (
    <article className={MYINFO_SURFACE.profileCard}>
      <div className={`${MYINFO_SURFACE.cardPad} space-y-4`}>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 items-start gap-3.5">
            <div className="block shrink-0">
              <SamarketUserAvatar avatarUrl={null} sizePx={72} alt="" />
            </div>

            <div className="min-w-0 flex-1 pt-0.5">
              <p className={`${MYINFO_TYPO.profileName} truncate text-left`}>{t("profile_guest_name")}</p>
              <p className={`mt-1 text-left ${MYINFO_TYPO.subText}`}>{t("mypage_comp_login_required")}</p>
              <p className={`mt-0.5 text-left ${MYINFO_TYPO.subText}`}>{t("profile_guest_desc")}</p>
            </div>
          </div>

          <div className="hidden shrink-0 flex-col gap-2 md:flex md:items-stretch md:pt-0.5">{loginButton}</div>
        </div>

        <div className={MYPAGE_HOME_ADDRESS_ROW_CLASS}>
          <AddressKindHeadPin kind="master" className="mt-0.5 shrink-0 opacity-40" />
          <span className={`min-w-0 flex-1 line-clamp-2 break-words ${MYINFO_TYPO.subText} opacity-70`}>
            {t("mypage_comp_placeholder_dash")}
          </span>
        </div>
      </div>

      <div className={`${MYPAGE_HOME_CARD_FOOTER_CLASS} md:hidden`}>
        <button
          type="button"
          onClick={openLogin}
          className={`${MYPAGE_HOME_OUTLINE_BTN_CLASS} w-full justify-center`}
        >
          {t("profile_guest_login_cta")}
        </button>
      </div>
    </article>
  );
}
