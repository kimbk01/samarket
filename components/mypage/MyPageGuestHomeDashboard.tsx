"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AuthLoginPanel } from "@/components/auth/AuthLoginPanel";
import { MyInfoMenuSection } from "@/components/mypage/myinfo/MyInfoMenuSection";
import { MyInfoHomeLinkRow } from "@/components/mypage/myinfo/MyInfoHomeMenuSections";
import { MyInfoLanguageToggleRow } from "@/components/mypage/myinfo/MyInfoLanguageToggleRow";
import { renderMypageHomeMenuIcon } from "@/components/mypage/myinfo/myinfo-menu-icon";
import { MYPAGE_IA_GUEST_PUBLIC_ROWS } from "@/lib/mypage/mypage-ia";
import { MYPAGE_HOME_BODY_CLASS, MYPAGE_HOME_CARD_CLASS } from "@/lib/ui/mypage-home-starbucks-styles";
import { MYPAGE_HOME_MENU_FLOW_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";
import { useMypageHubScrollRestore } from "@/lib/mypage/use-mypage-hub-scroll-restore";

/**
 * 비로그인 `/mypage` = 로그인 화면 (Owner 2026-11-02). 회원 전용 메뉴·「—」 요약은 보이지 않는다.
 * 아래에는 로그인 없이 열리는 공개 행만 (고객센터 · 약관 · 개인정보처리방침 · 사업자 정보 · 언어 · 버전).
 * 로그인 완료 → 같은 자리 `/mypage` 가 회원 홈으로 바뀐다.
 */
export function MyPageGuestHomeDashboard() {
  useMypageHubScrollRestore(true);
  const { safeT, t } = useI18n();

  return (
    <div className={MYPAGE_HOME_BODY_CLASS} data-mypage-ia="guest-login">
      <div className={MYPAGE_HOME_MENU_FLOW_CLASS}>
        <section
          className={`${MYPAGE_HOME_CARD_CLASS} w-full px-5 pb-5 pt-6`}
          data-testid="mypage-guest-login"
          aria-labelledby="mypage-guest-login-title"
        >
          <AuthLoginPanel active next="/mypage" headingId="mypage-guest-login-title" headingAs="h2" />
          <p className="mt-4 text-center text-[12px] leading-relaxed text-sam-muted">{t("mypage_ia_guest_login_lead")}</p>
        </section>

        <MyInfoMenuSection title={safeT("mypage_ia_guest_public_title")}>
          {MYPAGE_IA_GUEST_PUBLIC_ROWS.map((item, index) => (
            <MyInfoHomeLinkRow key={item.href} first={index === 0} item={item} />
          ))}
          <MyInfoLanguageToggleRow icon={renderMypageHomeMenuIcon("languages")} first={false} />
        </MyInfoMenuSection>
      </div>
    </div>
  );
}
