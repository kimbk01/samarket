"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { moimRoutes } from "@/lib/moim/moim-client-api";
import type { MoimCardDto } from "@/lib/moim/moim-api-types";
import type { MessageKey } from "@/lib/i18n/messages";
import { MoimCover, formatMoimCount, moimCls, moimTopicOrCategoryLabel } from "@/components/moim/moim-ui";

export type MoimCardBadge = { key: "closed" | "sched" | "approval" | "pending"; labelKey: MessageKey; tone: string };

/**
 * 카드 배지 규칙 (R3):
 * - 종료 모임 = 회색 「종료」 하나(U-12) — 모집·가입 배지는 의미가 없어 그리지 않는다
 * - 모집 중 일정이 있으면 회색 「일정 모집 중」(U1-card-badge-sched · D-25: 초록 배지와 구분되게 neutral)
 * - 승인제 = 회색 「승인제」 · 내 가입 신청 중 = 경고색
 */
export function moimCardBadges(m: Pick<MoimCardDto, "status" | "hasRecruitingSchedule" | "joinMode" | "viewerStatus">): MoimCardBadge[] {
  if (m.status === "closed") return [{ key: "closed", labelKey: "moim_card_closed_badge", tone: moimCls.badgeGray }];
  const out: MoimCardBadge[] = [];
  if (m.hasRecruitingSchedule) out.push({ key: "sched", labelKey: "moim_card_schedule_recruiting_badge", tone: moimCls.badgeGray });
  if (m.joinMode === "approval") out.push({ key: "approval", labelKey: "moim_join_mode_approval", tone: moimCls.badgeGray });
  if (m.viewerStatus === "pending") out.push({ key: "pending", labelKey: "moim_screen_pending_badge", tone: moimCls.badgeWarn });
  return out;
}

/** 종료 모임 표지는 흐리게 (U-12) */
export function moimCardCoverDim(m: Pick<MoimCardDto, "status">): string {
  return m.status === "closed" ? "opacity-50" : "";
}

/** 모임 목록 한 줄 (우리 동네 모임·검색·초대) */
export function MoimCard({ moim, href }: { moim: MoimCardDto; href?: string }) {
  const { t, language } = useI18n();
  const category = moimTopicOrCategoryLabel(moim, language);
  const meta = [category, moim.cityLabel, formatMoimCount(moim.memberCount, moim.capacity, t)].filter(Boolean);
  return (
    <Link href={href ?? moimRoutes.home(moim.id)} className={`${moimCls.card} flex min-w-0 gap-3 p-3 active:bg-sam-surface-muted`}>
      <MoimCover url={moim.coverImageUrl} className={`h-14 w-14 shrink-0 rounded-ui-rect ${moimCardCoverDim(moim)}`} />
      <div className="min-w-0 flex-1">
        <p className="break-words text-[14px] font-bold leading-snug text-sam-fg">{moim.name}</p>
        {moim.intro ? <p className="mt-0.5 line-clamp-1 text-[12px] text-sam-muted">{moim.intro}</p> : null}
        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px] text-sam-muted">
          <span>{meta.join(" · ")}</span>
          {moimCardBadges(moim).map((b) => (
            <span key={b.key} className={`${moimCls.badge} ${b.tone}`}>
              {t(b.labelKey)}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}

/** 내 모임 가로 목록 한 칸 — 종료 모임은 흐린 표지 + 회색 「종료」 (R3 U-12) */
/**
 * R5 B12: 내 모임 줄 정리 — 가입 신청 중 모임은 맨 뒤로, 개수는 신청 중을 빼고 센다(활동 멤버·종료 모임).
 */
export function arrangeMoimMine(items: readonly MoimCardDto[]): { items: MoimCardDto[]; count: number } {
  const pending = items.filter((m) => m.viewerStatus === "pending");
  const rest = items.filter((m) => m.viewerStatus !== "pending");
  return { items: [...rest, ...pending], count: rest.length };
}

export function MoimMineItem({ moim }: { moim: MoimCardDto }) {
  const { t } = useI18n();
  const closed = moim.status === "closed";
  /** R5 B12: 가입 신청 중 = 흐린 표지 + 「신청 중」 */
  const pending = moim.viewerStatus === "pending";
  return (
    <Link href={moimRoutes.home(moim.id)} className="flex w-[76px] shrink-0 flex-col items-center gap-1 text-center">
      <MoimCover url={moim.coverImageUrl} className={`h-[60px] w-[60px] rounded-full ${pending ? "opacity-50" : moimCardCoverDim(moim)}`} />
      <span className={`line-clamp-2 break-words text-[11.5px] leading-tight ${closed || pending ? "text-sam-muted" : "text-sam-fg"}`}>{moim.name}</span>
      {closed ? <span className={`${moimCls.badge} ${moimCls.badgeGray}`}>{t("moim_card_closed_badge")}</span> : null}
      {!closed && pending ? <span className={`${moimCls.badge} ${moimCls.badgeWarn}`}>{t("moim_screen_pending_badge")}</span> : null}
    </Link>
  );
}
