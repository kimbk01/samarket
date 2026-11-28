"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { localeTagForAppLanguage } from "@/lib/i18n/locale-for-app-language";
import type { AppLanguageCode } from "@/lib/i18n/config";
import type { MessageKey } from "@/lib/i18n/messages";
import { PHT_TIME_ZONE, formatPhtDisplayDateTime } from "@/lib/time/format-pht-display";
import { moimApi, moimRoutes } from "@/lib/moim/moim-client-api";
import type { MoimScheduleDto, MoimScheduleParticipantStatus, MoimScheduleStatus } from "@/lib/moim/moim-api-types";
import { moimCls } from "@/components/moim/moim-ui";

/**
 * 모임 일정 공통 — 날짜 표시(필리핀 시간 고정), 일정 카드, 상태 배지 (설계 §6 P10 · 시안 U4·U5).
 * 저장값은 UTC ISO 그대로, 표시 단계에서만 Asia/Manila 로 바꾼다(AGENTS.md 규정 9).
 */

/** 날짜 블록용 — 「11/15」 + 요일 (필리핀 시간) */
export function moimScheduleDateBlock(iso: string, lang: AppLanguageCode): { md: string; weekday: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { md: "", weekday: "" };
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: PHT_TIME_ZONE, month: "numeric", day: "numeric" }).formatToParts(d);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = new Intl.DateTimeFormat(localeTagForAppLanguage(lang), { timeZone: PHT_TIME_ZONE, weekday: "short" }).format(d);
  return { md: `${pick("month")}/${pick("day")}`, weekday };
}

/** 일정 시각 한 줄 — 「11월 19일 (수) 오후 7:30」 (필리핀 시간) */
export function formatMoimScheduleWhen(iso: string | null | undefined, lang: AppLanguageCode): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(localeTagForAppLanguage(lang), {
    timeZone: PHT_TIME_ZONE,
    month: "short",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

/** 짧은 시각 — 카드·공개 페이지 (기존 PHT 표시 함수) */
export function formatMoimScheduleShort(iso: string, lang: AppLanguageCode): string {
  return formatPhtDisplayDateTime(iso, lang);
}

export function moimScheduleStarted(s: Pick<MoimScheduleDto, "startsAt">, now = Date.now()): boolean {
  const t = Date.parse(s.startsAt);
  return Number.isFinite(t) && t <= now;
}

export function formatMoimScheduleCount(
  confirmed: number,
  capacity: number | null,
  t: (k: MessageKey, v?: Record<string, string | number>) => string
): string {
  return capacity ? t("moim_schedule_count_cap", { count: confirmed, cap: capacity }) : t("moim_schedule_count", { count: confirmed });
}

/** 화면에 보이는 일정 상태 — 시작했는데 아직 모집 단계(recruiting·full·closed)면 「진행 중」 (R3 U-03) */
export type MoimScheduleDisplayStatus = MoimScheduleStatus | "started";

export function moimScheduleDisplayStatus(
  s: Pick<MoimScheduleDto, "status" | "startsAt">,
  now = Date.now()
): MoimScheduleDisplayStatus {
  if ((s.status === "recruiting" || s.status === "full" || s.status === "closed") && moimScheduleStarted(s, now)) return "started";
  return s.status;
}

/** 상태 배지 색 — 모집 중은 neutral(시안 U4·U5 · D-25), 정원 마감 warn, 취소 danger */
export const MOIM_SCHEDULE_STATUS_TONE: Record<MoimScheduleDisplayStatus, string> = {
  recruiting: moimCls.badgeGray,
  full: moimCls.badgeWarn,
  closed: moimCls.badgeGray,
  started: moimCls.badgeGreen,
  done: moimCls.badgeGray,
  cancelled: moimCls.badgeBad,
};

export function MoimScheduleStatusBadge({ status }: { status: MoimScheduleDisplayStatus }) {
  const { t } = useI18n();
  return (
    <span className={`${moimCls.badge} ${MOIM_SCHEDULE_STATUS_TONE[status] ?? moimCls.badgeGray}`}>
      {t(`moim_schedule_status_${status}_badge` as MessageKey)}
    </span>
  );
}

/** 내 참여 상태 배지 — 확정(success · 시안 b-ok)·대기만 표시 */
export function MoimScheduleMyBadge({ status }: { status: MoimScheduleParticipantStatus | null }) {
  const { t } = useI18n();
  if (status === "confirmed") return <span className={`${moimCls.badge} ${moimCls.badgeOk}`}>{t("moim_schedule_my_confirmed_badge")}</span>;
  if (status === "requested") return <span className={`${moimCls.badge} ${moimCls.badgeWarn}`}>{t("moim_schedule_my_requested_badge")}</span>;
  return null;
}

/** 카드 오른쪽 배지 1개 (시안 U4) — 내가 참여 확정이면 「참여 확정」, 아니면 일정 상태 */
export function moimScheduleCardBadge(
  s: Pick<MoimScheduleDto, "status" | "startsAt" | "viewer">,
  now = Date.now()
): { kind: "my_confirmed" } | { kind: "status"; status: MoimScheduleDisplayStatus } {
  /** 취소·종료된 일정은 상태가 먼저 — 참여 기록이 confirmed 로 남아도 「참여 확정」으로 덮지 않는다 (R3 재감사 P2) */
  if (s.status === "cancelled" || s.status === "done") return { kind: "status", status: moimScheduleDisplayStatus(s, now) };
  if (s.viewer.status === "confirmed") return { kind: "my_confirmed" };
  return { kind: "status", status: moimScheduleDisplayStatus(s, now) };
}

/** 날짜 칸 (시안 U3·U4) — 흰 칸 + 테두리, 위 작은 날짜(primary · D-28) · 아래 굵은 요일 */
export function MoimScheduleDateBox({ iso, muted = false }: { iso: string; muted?: boolean }) {
  const { language } = useI18n();
  const { md, weekday } = moimScheduleDateBlock(iso, language);
  return (
    <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface">
      <span className={`text-[11px] leading-tight ${muted ? "text-sam-muted" : "text-sam-primary"}`}>{md}</span>
      <b className={`text-[15px] leading-tight ${muted ? "text-sam-muted" : "text-sam-fg"}`}>{weekday}</b>
    </span>
  );
}

/** 일정 카드 — 날짜 · 제목 · 시각·장소 · 인원 · 오른쪽 배지 1개 */
export function MoimScheduleCard({ schedule }: { schedule: MoimScheduleDto }) {
  const { t, language } = useI18n();
  const ended = schedule.status === "done" || schedule.status === "cancelled";
  const badge = moimScheduleCardBadge(schedule);
  return (
    <Link href={moimRoutes.schedule(schedule.moimId, schedule.id)} className={`${moimCls.card} flex items-start gap-3 p-3 active:bg-sam-surface-muted`}>
      <MoimScheduleDateBox iso={schedule.startsAt} muted={ended} />
      <span className="min-w-0 flex-1">
        <b className="block break-words text-[14px] text-sam-fg">{schedule.title}</b>
        <span className="block break-words text-[12px] text-sam-muted">
          {[formatMoimScheduleShort(schedule.startsAt, language), schedule.placeText].filter(Boolean).join(" · ")}
        </span>
        <span className="mt-1 block text-[12px] text-sam-muted">{formatMoimScheduleCount(schedule.confirmedCount, schedule.capacity, t)}</span>
      </span>
      {badge.kind === "my_confirmed" ? <MoimScheduleMyBadge status="confirmed" /> : <MoimScheduleStatusBadge status={badge.status} />}
    </Link>
  );
}

/** 일정 목록 불러오기 (다가오는·지난) */
export function useMoimSchedules(moimId: string, scope: "upcoming" | "past") {
  const [items, setItems] = useState<MoimScheduleDto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [key, setKey] = useState(0);
  useEffect(() => {
    let alive = true;
    setItems(null);
    setFailed(false);
    void moimApi.schedules(moimId, scope).then((r) => {
      if (!alive) return;
      if (!r.ok) setFailed(true);
      else setItems(r.items);
    });
    return () => {
      alive = false;
    };
  }, [moimId, scope, key]);
  return { items, failed, retry: () => setKey((k) => k + 1) };
}
