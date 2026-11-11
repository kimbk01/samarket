"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MYPAGE_ADDRESSES_HREF } from "@/lib/mypage/mypage-profile-routes";
import { MoimCard } from "@/components/moim/MoimCard";
import { MoimEmptyState, MoimErrorState, MoimListSkeleton, moimCls } from "@/components/moim/moim-ui";
import type { MoimLocalListState } from "@/components/moim/use-moim-local-list";

/** 우리 동네 모임 목록 본문 — 로딩·오류·주소 없음·빈 목록·더 보기 */
export function MoimLocalList({ list, emptyKey }: { list: MoimLocalListState; emptyKey: "moim_home_local_empty" | "moim_search_empty" }) {
  const { t } = useI18n();
  if (list.status === "loading" || list.status === "idle") return <MoimListSkeleton />;
  if (list.status === "error") return <MoimErrorState onRetry={list.reload} />;
  if (!list.hasAddress) {
    return (
      <MoimEmptyState
        action={
          <Link href={MYPAGE_ADDRESSES_HREF} className={`${moimCls.btnSecondary} ${moimCls.btnSm}`}>
            {t("moim_home_address_cta")}
          </Link>
        }
      >
        {t("moim_home_no_address")}
      </MoimEmptyState>
    );
  }
  if (list.items.length === 0) return <MoimEmptyState>{t(emptyKey)}</MoimEmptyState>;
  return (
    <div className="grid gap-2 px-4">
      {list.items.map((m) => (
        <MoimCard key={m.id} moim={m} />
      ))}
      {list.nextBefore ? (
        <button
          type="button"
          className={`${moimCls.btnSecondary} ${moimCls.btnSm} mt-1 w-full`}
          disabled={list.loadingMore}
          onClick={list.loadMore}
        >
          {list.loadingMore ? t("common_loading") : t("moim_home_more_btn")}
        </button>
      ) : null}
    </div>
  );
}
