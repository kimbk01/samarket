"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ServiceBrandIcon } from "@/components/brand/ServiceBrandIcon";
import { DibayToast, type DibayToastTone } from "@/components/ui/dibay-overlay";
import { DIBAY_TOAST_MS } from "@/lib/ui/dibay-overlay-contract";
import { Sam } from "@/lib/ui/sam-component-classes";
import type { MessageKey } from "@/lib/i18n/messages";
import type { AppLanguageCode } from "@/lib/i18n/config";
import type { MoimBoardDto, MoimCategoryDto } from "@/lib/moim/moim-api-types";
import type { MoimRole } from "@/lib/moim/moim-permission-contract";

/** 모임 화면 공통 클래스 — 카드·버튼·입력 4px(rounded-ui-rect), 칩·배지 pill(rounded-full) */
export const moimCls = {
  page: "min-h-full w-full min-w-0 bg-sam-app",
  column: "mx-auto w-full min-w-0 max-w-[640px]",
  card: "rounded-ui-rect border border-sam-border bg-sam-surface",
  sectionHead: "flex items-baseline justify-between gap-2 px-4 pb-2 pt-4",
  sectionTitle: "text-[15px] font-bold text-sam-fg",
  sectionLink: "shrink-0 text-[12px] text-sam-muted",
  btnPrimary: `${Sam.btn.primaryCombo} ${Sam.btn.disabledToken} rounded-ui-rect`,
  btnSecondary: `${Sam.btn.outlineCombo} rounded-ui-rect`,
  btnDanger: `${Sam.btn.dangerCombo} rounded-ui-rect`,
  btnSm: "sam-btn--sm",
  input: `${Sam.input.base} rounded-ui-rect`,
  textarea: `${Sam.input.textarea} rounded-ui-rect`,
  label: "text-[13px] font-bold text-sam-fg",
  hint: "text-[12px] text-sam-muted",
  chip: "inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px]",
  chipOn: "border-sam-primary bg-sam-primary text-sam-on-primary",
  chipOff: "border-sam-border bg-sam-surface text-sam-fg",
  badge: "inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-1.5 py-px text-[11px] font-bold",
  badgeGreen: "bg-sam-primary-soft text-sam-primary",
  badgeGray: "bg-sam-surface-muted text-sam-muted",
  badgeWarn: "bg-sam-warning-soft text-sam-warning",
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

/** 카테고리 이름 — 앱 언어에 맞는 이름(어드민 등록 ko·en) */
export function moimCategoryLabel(c: MoimCategoryDto | null | undefined, lang: AppLanguageCode): string {
  if (!c) return "";
  return lang === "en" ? c.labelEn || c.labelKo : c.labelKo || c.labelEn;
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

/** 모임장·부모임장·운영진만 배지 (멤버는 배지 없음) */
export function MoimRoleBadge({ role }: { role: MoimRole | null | undefined }) {
  const { t } = useI18n();
  if (!role || role === "member") return null;
  return <span className={`${moimCls.badge} ${moimCls.badgeGreen}`}>{t(moimRoleKey(role))}</span>;
}

/** 사람 사진 — 모임별 프로필 사진만, 없으면 닉네임 첫 글자 */
export function MoimAvatar({ url, name, size = 32 }: { url: string | null | undefined; name: string; size?: number }) {
  const style = { width: size, height: size };
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" style={style} className="shrink-0 rounded-full bg-sam-surface-muted object-cover" />;
  }
  const initial = [...(name || "").trim()][0] ?? "";
  return (
    <span
      style={style}
      className="inline-grid shrink-0 place-items-center rounded-full bg-sam-primary-soft text-[12px] font-bold text-sam-primary"
      aria-hidden
    >
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

export function formatMoimCount(memberCount: number, capacity: number | null, t: (k: MessageKey, v?: Record<string, string | number>) => string): string {
  return capacity
    ? t("moim_screen_member_count_cap", { count: memberCount, cap: capacity })
    : t("moim_screen_member_count", { count: memberCount });
}
