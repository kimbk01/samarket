"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayAlert } from "@/components/ui/dibay-overlay";
import { moimApi, moimRoutes } from "@/lib/moim/moim-client-api";
import type { MoimCardDto, MoimCategoryDto } from "@/lib/moim/moim-api-types";
import { MAIN_BOTTOM_NAV_FAB_BOTTOM_CLASS, MAIN_BOTTOM_NAV_FAB_SECTOR_Z_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { MoimMineItem } from "@/components/moim/MoimCard";
import { MoimLocalList } from "@/components/moim/MoimLocalList";
import { useMoimLocalList } from "@/components/moim/use-moim-local-list";
import { moimCategoryLabel, moimCls } from "@/components/moim/moim-ui";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { DibaySecondaryTabRow } from "@/components/ui/DibaySecondaryTabRow";
import { CommunityTradeSwitchRow } from "@/components/layout/CommunityTradeTitleSwitch";
import { DIBAY_SECONDARY_TAB_LABEL_CLASS, dibaySecondaryTabClass } from "@/lib/ui/dibay-secondary-tabs";
import { useFitSectionTabPadding } from "@/lib/ui/use-fit-section-tab-padding";
import { triggerInteractionFeedback } from "@/lib/ui/light-tap-feedback";

/**
 * 모임 탭 홈 /moim (시안 U1) — 내 모임 · 우리 동네 모임 · 모임 만들기.
 * 머리글 (Owner 「3판대로 구현」 2026-11-12): 1단 「모임」 + 검색·알림 · 2단 = 카테고리 밑줄 탭(본문 칩에서 옮김) ·
 * 3단 = 「정보교환 · 거래 · 모임」 전환 줄(모임 선택). 본문 검색칸은 1단 검색으로 대신한다.
 */
export function MoimTabHome() {
  const { t, language } = useI18n();
  const router = useRouter();
  const [mine, setMine] = useState<MoimCardDto[] | null>(null);
  const [categories, setCategories] = useState<MoimCategoryDto[] | null>(null);
  const [categoriesFailed, setCategoriesFailed] = useState(false);
  const [inviteCount, setInviteCount] = useState(0);
  const [category, setCategory] = useState<string | null>(null);
  const list = useMoimLocalList({ category });
  const categoryTrackRef = useRef<HTMLDivElement | null>(null);
  /** 2단 탭 여백 — 정보교환 2단과 같은 규칙(최대 10px, 넘치면 밀어서 봄) */
  useFitSectionTabPadding(categoryTrackRef, [categories, language], { maxPadPx: 10, barInsetPx: 6 });
  const pickCategory = (next: string | null) => {
    if (next === category) return;
    triggerInteractionFeedback("light");
    setCategory(next);
  };

  useEffect(() => {
    let alive = true;
    void moimApi.listMine().then((r) => {
      if (alive) setMine(r.ok ? r.items : []);
    });
    void moimApi.categories().then((r) => {
      if (!alive) return;
      if (r.ok) setCategories(r.categories);
      else setCategoriesFailed(true);
    });
    void moimApi.receivedInvites().then((r) => {
      if (alive && r.ok) setInviteCount(r.invites.length);
    });
    return () => {
      alive = false;
    };
  }, []);

  const onCreate = () => {
    if (categories && categories.length === 0) {
      void dibayAlert({ title: t("moim_home_categories_preparing_title"), description: t("moim_home_categories_preparing_body") });
      return;
    }
    router.push(moimRoutes.create);
  };

  return (
    <div className={`${moimCls.page} pb-28`}>
      <MySubpageHeader
        registerMainTier1={false}
        hideCtaStrip
        stickyBelow={
          <>
            <DibaySecondaryTabRow
              ref={categoryTrackRef}
              navRole="category"
              tier="section"
              data-dibay-tab-align="start"
              data-moim-category-tabs=""
              bordered
              hostClassName="[--dibay-secondary-tab-pad-x:0px]"
              trackAriaLabel={t("moim_home_category_aria")}
            >
              <button
                type="button"
                role="tab"
                aria-selected={category === null}
                className={dibaySecondaryTabClass(category === null)}
                onClick={() => pickCategory(null)}
              >
                <span className={DIBAY_SECONDARY_TAB_LABEL_CLASS}>{t("moim_home_category_all_chip")}</span>
              </button>
              {(categories ?? []).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={category === c.id}
                  className={dibaySecondaryTabClass(category === c.id)}
                  onClick={() => pickCategory(c.id)}
                >
                  <span className={DIBAY_SECONDARY_TAB_LABEL_CLASS}>{moimCategoryLabel(c, language)}</span>
                </button>
              ))}
            </DibaySecondaryTabRow>
            <CommunityTradeSwitchRow active="moim" />
          </>
        }
      />
      <div className={moimCls.column}>

        {inviteCount > 0 ? (
          <Link href={moimRoutes.invites} className={`${moimCls.noticeInfo} mx-4 mt-3 flex items-center justify-between gap-2`}>
            <span>{t("moim_home_invites_banner", { count: inviteCount })}</span>
            <span aria-hidden>›</span>
          </Link>
        ) : null}

        {mine && mine.length > 0 ? (
          <section>
            <div className={moimCls.sectionHead}>
              <h2 className={moimCls.sectionTitle}>{t("moim_home_mine_title")}</h2>
              <span className={moimCls.sectionLink}>{t("moim_home_mine_count", { count: mine.length })}</span>
            </div>
            <div className="flex min-w-0 gap-3 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {mine.map((m) => (
                <MoimMineItem key={m.id} moim={m} />
              ))}
            </div>
          </section>
        ) : null}


        <section>
          <div className={moimCls.sectionHead}>
            <h2 className={moimCls.sectionTitle}>{t("moim_home_local_title")}</h2>
            <span className={moimCls.sectionLink}>{t("moim_home_sort_recent")}</span>
          </div>
          {categories && categories.length === 0 && !categoriesFailed ? (
            <p className={`${moimCls.noticeInfo} mx-4 mb-2`}>{t("moim_home_categories_preparing_body")}</p>
          ) : null}
          <MoimLocalList list={list} emptyKey="moim_home_local_empty" />
        </section>
      </div>

      <button
        type="button"
        onClick={onCreate}
        className={`fixed right-4 ${MAIN_BOTTOM_NAV_FAB_BOTTOM_CLASS} ${MAIN_BOTTOM_NAV_FAB_SECTOR_Z_CLASS} inline-flex items-center gap-1.5 rounded-full bg-sam-primary px-4 py-2.5 text-[14px] font-bold text-sam-on-primary shadow-lg active:bg-sam-primary-hover`}
      >
        <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        {t("moim_home_create_cta")}
      </button>
    </div>
  );
}
