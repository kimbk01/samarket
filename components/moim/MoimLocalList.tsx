"use client";

import { DibaySpinner } from "@/components/ui/DibaySpinner";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildMypageAddressesHrefFromPath } from "@/lib/addresses/mypage-addresses-return-to";
import { MoimCard } from "@/components/moim/MoimCard";
import { MoimEmptyState, MoimErrorState, MoimListSkeleton, moimCls } from "@/components/moim/moim-ui";
import type { MoimLocalListState } from "@/components/moim/use-moim-local-list";

/** 우리 동네 모임 목록 본문 — 로딩·오류·주소 없음·빈 목록·더 보기 */
export function MoimLocalList({ list, emptyKey }: { list: MoimLocalListState; emptyKey: "moim_home_local_empty" | "moim_home_local_empty_preparing" | "moim_search_empty" }) {
  const { t } = useI18n();
  const pathname = usePathname();
  if (list.status === "loading" || list.status === "idle") return <MoimListSkeleton />;
  if (list.status === "error") return <MoimErrorState onRetry={list.reload} />;
  if (!list.hasAddress) {
    /** 대표 주소는 있으나 시/군을 정할 수 없음 → 「주소 확인하기」(다시 저장) · 대표 주소 없음 → 「주소 등록하기」. 저장 뒤 이 화면으로 돌아온다 */
    const unresolved = list.areaStatus === "city_unresolved";
    return (
      <MoimEmptyState
        action={
          <Link href={buildMypageAddressesHrefFromPath(pathname)} className={`${moimCls.btnSecondary} ${moimCls.btnSm}`}>
            {t(unresolved ? "moim_address_check_cta" : "moim_home_address_cta")}
          </Link>
        }
      >
        {t(unresolved ? "moim_home_city_unresolved" : "moim_home_no_address")}
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
          {list.loadingMore ? <DibaySpinner size="sm" tone="current" label={t("common_loading")} /> : t("moim_home_more_btn")}
        </button>
      ) : null}
    </div>
  );
}
