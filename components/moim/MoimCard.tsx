"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { moimRoutes } from "@/lib/moim/moim-client-api";
import type { MoimCardDto } from "@/lib/moim/moim-api-types";
import { MoimCover, formatMoimCount, moimCls, moimTopicOrCategoryLabel } from "@/components/moim/moim-ui";

/** 모임 목록 한 줄 (우리 동네 모임·검색·초대) */
export function MoimCard({ moim, href }: { moim: MoimCardDto; href?: string }) {
  const { t, language } = useI18n();
  const category = moimTopicOrCategoryLabel(moim, language);
  const meta = [category, moim.cityLabel, formatMoimCount(moim.memberCount, moim.capacity, t)].filter(Boolean);
  return (
    <Link href={href ?? moimRoutes.home(moim.id)} className={`${moimCls.card} flex min-w-0 gap-3 p-3 active:bg-sam-surface-muted`}>
      <MoimCover url={moim.coverImageUrl} className="h-14 w-14 shrink-0 rounded-ui-rect" />
      <div className="min-w-0 flex-1">
        <p className="break-words text-[14px] font-bold leading-snug text-sam-fg">{moim.name}</p>
        {moim.intro ? <p className="mt-0.5 line-clamp-1 text-[12px] text-sam-muted">{moim.intro}</p> : null}
        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px] text-sam-muted">
          <span>{meta.join(" · ")}</span>
          {moim.joinMode === "approval" ? (
            <span className={`${moimCls.badge} ${moimCls.badgeGray}`}>{t("moim_join_mode_approval")}</span>
          ) : null}
          {moim.viewerStatus === "pending" ? (
            <span className={`${moimCls.badge} ${moimCls.badgeWarn}`}>{t("moim_screen_pending_badge")}</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

/** 내 모임 가로 목록 한 칸 */
export function MoimMineItem({ moim }: { moim: MoimCardDto }) {
  return (
    <Link href={moimRoutes.home(moim.id)} className="flex w-[76px] shrink-0 flex-col items-center gap-1 text-center">
      <MoimCover url={moim.coverImageUrl} className="h-[60px] w-[60px] rounded-full" />
      <span className="line-clamp-2 break-words text-[11.5px] leading-tight text-sam-fg">{moim.name}</span>
    </Link>
  );
}
