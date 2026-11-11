"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayAlert } from "@/components/ui/dibay-overlay";
import { moimApi, moimRoutes } from "@/lib/moim/moim-client-api";
import type { MoimCardDto, MoimCategoryDto } from "@/lib/moim/moim-api-types";
import { MAIN_BOTTOM_NAV_FAB_BOTTOM_CLASS, MAIN_BOTTOM_NAV_FAB_SECTOR_Z_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { MoimMineItem } from "@/components/moim/MoimCard";
import { MoimLocalList } from "@/components/moim/MoimLocalList";
import { useMoimLocalList } from "@/components/moim/use-moim-local-list";
import { chipClass, moimCategoryLabel, moimCls } from "@/components/moim/moim-ui";

/** 모임 탭 홈 /moim (시안 U1) — 내 모임 · 카테고리 칩 · 우리 동네 모임 · 모임 만들기 */
export function MoimTabHome() {
  const { t, language } = useI18n();
  const router = useRouter();
  const [mine, setMine] = useState<MoimCardDto[] | null>(null);
  const [categories, setCategories] = useState<MoimCategoryDto[] | null>(null);
  const [categoriesFailed, setCategoriesFailed] = useState(false);
  const [inviteCount, setInviteCount] = useState(0);
  const [category, setCategory] = useState<string | null>(null);
  const list = useMoimLocalList({ category });

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
      <div className={moimCls.column}>
        <div className="px-4 pt-3">
          <Link
            href={moimRoutes.search}
            className={`${moimCls.input} flex items-center gap-2 text-[14px] text-sam-meta`}
            aria-label={t("moim_search_open_aria")}
          >
            <Search className="h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0">{t("moim_search_placeholder")}</span>
          </Link>
        </div>

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

        {categories && categories.length > 0 ? (
          <div className={`${moimCls.hScroll} pt-4`} role="tablist" aria-label={t("moim_home_category_aria")}>
            <button type="button" role="tab" aria-selected={category === null} className={chipClass(category === null)} onClick={() => setCategory(null)}>
              {t("moim_home_category_all_chip")}
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={category === c.id}
                className={chipClass(category === c.id)}
                onClick={() => setCategory(c.id)}
              >
                {moimCategoryLabel(c, language)}
              </button>
            ))}
          </div>
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
