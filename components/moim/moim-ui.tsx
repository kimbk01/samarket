"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ServiceBrandIcon } from "@/components/brand/ServiceBrandIcon";
import { DibayToast, type DibayToastTone } from "@/components/ui/dibay-overlay";
import { DIBAY_TOAST_MS } from "@/lib/ui/dibay-overlay-contract";
import { Sam } from "@/lib/ui/sam-component-classes";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { resolveLocalizedAdminLabel } from "@/lib/i18n/resolve-localized-admin-label";
import type { MoimBoardDto, MoimCategoryDto } from "@/lib/moim/moim-api-types";
import type { MoimRole } from "@/lib/moim/moim-permission-contract";

/**
 * 모임 화면 공통 클래스 (LOCKED `04-DESIGN-SYSTEM.md`):
 * 카드·버튼·입력·칩 4px(rounded-ui-rect · D-1) · 배지·아바타 pill(rounded-full · D-13) · 누르는 곳 44px(`--sam-tap-min` · R3 U-06)
 */
export const moimCls = {
  page: "min-h-full w-full min-w-0 bg-sam-app",
  column: "mx-auto w-full min-w-0 max-w-[640px]",
  card: "rounded-ui-rect border border-sam-border bg-sam-surface",
  sectionHead: "flex items-baseline justify-between gap-2 px-4 pb-2 pt-4",
  sectionTitle: "text-[15px] font-bold text-sam-fg",
  sectionLink: "shrink-0 text-[12px] text-sam-muted",
  /** 섹션 머리 「전체 보기」류 글자 버튼 — 누름 영역 44px (R3 G-tap-03) */
  sectionLinkBtn: "inline-flex min-h-[length:var(--sam-tap-min)] shrink-0 items-center text-[12px] text-sam-muted",
  btnPrimary: `${Sam.btn.primaryCombo} ${Sam.btn.disabledToken} rounded-ui-rect`,
  /** 버튼 역할 3종 (모임 감사 6번 묶음): 기본 = 화면 핵심 동작 1개 · 보조 = 그 밖 · 위험 = 숨기기·삭제·내보내기·차단·회수·종료·일정 취소·거절 (D-10) */
  btnSecondary: `${Sam.btn.outlineCombo} ${Sam.btn.disabledToken} rounded-ui-rect`,
  btnDanger: `${Sam.btn.dangerCombo} ${Sam.btn.disabledToken} rounded-ui-rect`,
  /** 작은 버튼 — 모양은 `.sam-btn--sm`, 높이만 모임 안에서 44px (전역 40px 는 앱 전체라 그대로 · R3 G-tap-01) */
  btnSm: `${Sam.btn.sm} min-h-[length:var(--sam-tap-min)]`,
  btnBlock: Sam.btn.block,
  input: `${Sam.input.base} rounded-ui-rect`,
  textarea: `${Sam.input.textarea} rounded-ui-rect`,
  label: "text-[13px] font-bold text-sam-fg",
  hint: "text-[12px] text-sam-muted",
  chip: "inline-flex min-h-[length:var(--sam-tap-min)] shrink-0 items-center whitespace-nowrap rounded-ui-rect border px-3 py-1.5 text-[13px]",
  chipOn: "border-sam-primary bg-sam-primary text-sam-on-primary",
  chipOff: "border-sam-border bg-sam-surface text-sam-fg",
  badge: "inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-1.5 py-px text-[11px] font-bold",
  badgeGreen: "bg-sam-primary-soft text-sam-primary",
  badgeGray: "bg-sam-surface-muted text-sam-muted",
  badgeWarn: "bg-sam-warning-soft text-sam-warning",
  /** 시안 b-ok 「참여 확정」 — LOCKED success 토큰 (R3 U-03) */
  badgeOk: "bg-sam-success-soft text-sam-success",
  badgeBad: "bg-sam-danger-soft text-sam-danger",
  noticeInfo: "rounded-ui-rect bg-sam-primary-soft px-3 py-2 text-[12px] text-sam-primary",
  noticeWarn: "rounded-ui-rect bg-sam-warning-soft px-3 py-2 text-[12px] text-sam-warning",
  noticeBad: "rounded-ui-rect bg-sam-danger-soft px-3 py-2 text-[12px] text-sam-danger",
  /** 가로 스와이프 줄 — 이름을 자르지 않는다 */
  hScroll: "flex min-w-0 gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
} as const;

export function chipClass(on: boolean): string {
  return `${moimCls.chip} ${on ? moimCls.chipOn : moimCls.chipOff}`;
}

/**
 * 카테고리 이름 — 앱 언어의 어드민 등록 이름만 쓴다(다른 언어 이름으로 대신하지 않음 · `docs/i18n-ssot.md` §3 · R3 G-i18n-03).
 * 그 언어 이름이 비어 있으면 같은 언어의 공용 대체 키(`community_topic_label_fallback`).
 */
export function moimCategoryLabel(c: MoimCategoryDto | null | undefined, lang: AppLanguageCode): string {
  if (!c) return "";
  const localized = resolveLocalizedAdminLabel(lang, c.labelKo ?? "", c.labelEn).trim();
  return localized || translate(lang, "community_topic_label_fallback");
}

/** 카드·공개 페이지 표시 — 직접 주제가 있으면 주제, 없으면 카테고리 이름 (「기타」 글자는 고객에게 보이지 않게) */
export function moimTopicOrCategoryLabel(
  m: { topicLabel?: string | null; category: MoimCategoryDto | null | undefined },
  lang: AppLanguageCode
): string {
  const topic = (m.topicLabel ?? "").trim();
  return topic || moimCategoryLabel(m.category, lang);
}

export function moimRoleKey(role: MoimRole): MessageKey {
  return `moim_role_${role}` as MessageKey;
}

/** 게시판 이름 — 기본 게시판은 키, 사용자 게시판은 등록 이름 */
export function useMoimBoardLabel(): (b: Pick<MoimBoardDto, "kind" | "name"> | null | undefined) => string {
  const { t } = useI18n();
  return useCallback(
    (b) => {
      if (!b) return "";
      if (b.kind === "custom") return b.name ?? "";
      return t(`moim_board_${b.kind}` as MessageKey);
    },
    [t]
  );
}

/**
 * 역할 배지 — 모임 화면·운영 화면 공용 하나 (D-8): 모임장 = primary · 부모임장·운영진 = neutral · 멤버 = 없음. 모양 pill.
 */
export function MoimRoleBadge({ role }: { role: MoimRole | null | undefined }) {
  const { t } = useI18n();
  if (!role || role === "member") return null;
  return <span className={`${moimCls.badge} ${role === "host" ? moimCls.badgeGreen : moimCls.badgeGray}`}>{t(moimRoleKey(role))}</span>;
}

/** 사람 사진 — 모임별 프로필 사진만, 없으면 닉네임 첫 글자. 모임 화면·운영 화면 공용 하나 (R3 U-08) */
export function MoimAvatar({ url, name, size = 32 }: { url: string | null | undefined; name: string; size?: number }) {
  const style = { width: size, height: size, fontSize: Math.max(12, Math.round(size * 0.36)) };
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- 모임 프로필 사진(외부 저장소 URL)
    return <img src={url} alt="" width={size} height={size} style={style} className="shrink-0 rounded-full bg-sam-surface-muted object-cover" />;
  }
  const initial = ([...(name || "").trim()][0] ?? "").toUpperCase();
  return (
    <span style={style} className="inline-grid shrink-0 place-items-center rounded-full bg-sam-primary-soft font-bold text-sam-primary" aria-hidden>
      {initial}
    </span>
  );
}

/** 모임 대표 사진 — 없으면 아이콘 */
export function MoimCover({ url, className }: { url: string | null | undefined; className: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className={`${className} bg-sam-surface-muted object-cover`} />;
  }
  return (
    <span className={`${className} grid place-items-center bg-sam-primary-soft text-sam-primary`} aria-hidden>
      <ServiceBrandIcon brand="CREW" className="h-1/2 w-1/2 max-h-8 max-w-8" />
    </span>
  );
}

export function MoimListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="grid gap-2 px-4" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`${moimCls.card} flex gap-3 p-3`}>
          <div className="h-14 w-14 shrink-0 animate-pulse rounded-ui-rect bg-sam-surface-muted" />
          <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
            <div className="h-3.5 w-2/3 animate-pulse rounded-ui-rect bg-sam-surface-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded-ui-rect bg-sam-surface-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MoimErrorState({ messageKey, onRetry }: { messageKey?: MessageKey; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <p className="text-[14px] text-sam-muted">{t(messageKey ?? "moim_screen_load_failed")}</p>
      {onRetry ? (
        <button type="button" className={`${moimCls.btnSecondary} ${moimCls.btnSm}`} onClick={onRetry}>
          {t("common_retry")}
        </button>
      ) : null}
    </div>
  );
}

export function MoimEmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <p className="text-[14px] leading-relaxed text-sam-muted">{children}</p>
      {action}
    </div>
  );
}

/** 화면 하나에 토스트 1개 */
export function useMoimToast(): {
  show: (message: string, tone?: DibayToastTone) => void;
  node: ReactNode;
} {
  const [state, setState] = useState<{ message: string; tone: DibayToastTone } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );
  const show = useCallback((message: string, tone: DibayToastTone = "default") => {
    if (timer.current) clearTimeout(timer.current);
    setState({ message, tone });
    timer.current = setTimeout(() => setState(null), DIBAY_TOAST_MS);
  }, []);
  const node = state ? <DibayToast message={state.message} tone={state.tone} /> : null;
  return { show, node };
}

/** 공백을 자른 글자 수(코드 포인트 · 서버 char_length 와 같은 셈)가 [min, max] 안인가 (감사 B11 · 서버 검사와 같은 경계) */
export function moimTextWithin(value: string, min: number, max: number): boolean {
  const n = Array.from(value.trim()).length;
  return n >= Math.max(0, min) && n <= max;
}

/** 입력칸 아래 글자 수 안내 — 정보 수정 화면과 같은 문구 「{min}~{max}자 · 지금 {count}자」, 최소 미만이면 빨간 글씨 (감사 B11) */
export function MoimTextCount({ value, min, max }: { value: string; min: number; max: number }) {
  const { t, language } = useI18n();
  const n = Array.from(value.trim()).length;
  const short = n > 0 && n < min;
  return (
    <span className={`${moimCls.hint} ${short ? "text-sam-danger" : ""}`}>
      {t("moim_manage_info_length_hint", { min, max: max.toLocaleString(language), count: n })}
    </span>
  );
}

export function formatMoimCount(memberCount: number, capacity: number | null, t: (k: MessageKey, v?: Record<string, string | number>) => string): string {
  return capacity
    ? t("moim_screen_member_count_cap", { count: memberCount, cap: capacity })
    : t(memberCount === 1 ? "moim_screen_member_count_one" : "moim_screen_member_count", { count: memberCount });
}
