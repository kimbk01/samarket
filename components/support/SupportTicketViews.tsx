"use client";

/**
 * 고객센터 접수형 문의 화면 (Owner 「접수형 1단계」 2026-11-10).
 * 고객센터 문의 ≠ 채팅 — 말풍선·실시간 대화·「상담사」 표현 없음. 쓰기 → 접수 → 답변 대기 → 답변.
 *
 * 화면 격자(시안 3차 4절): 머리글 48px [48 뒤로 | 제목 1줄 | 48 닫기] · 상단 줄 44px(누가) ·
 * 행 44px [라벨 64px | 값 1줄 | 16] · 하단 버튼 44px 고정. 제목·값은 1줄 + 말줄임.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { DibayPendingSpinner } from "@/components/ui/DibaySpinner";
import { ChevronRight, Check, X } from "lucide-react";
import { HeaderBackRoundButton } from "@/components/navigation/HeaderBackRoundButton";
import { SupportCaseRowButton } from "@/components/support/SupportCaseRow";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayOverlayButton, dibayConfirm } from "@/components/ui/dibay-overlay";
import { formatMypageDate } from "@/lib/mypage/format-mypage-date";
import {
  getOwnerLiteStoreServerSnapshot,
  getOwnerLiteStoreSnapshot,
  subscribeOwnerLiteStore,
} from "@/lib/stores/owner-lite-external-store";
import type { SupportCaseRow, SupportMessageRow } from "@/lib/support/support-case-types";
import { listIssueTypesForCategory } from "@/lib/support/support-category-registry";
import { visibleSupportCategories, visibleSupportIssues } from "@/lib/support/support-category-settings";
import { useSupportCategoryLabels } from "@/lib/support/use-support-category-settings";
import type { SupportContext } from "@/lib/support/support-context";
import { supportErrorLabel, supportErrorNeedsReload, supportReferenceLabel } from "@/lib/support/support-display-labels";
import { resolveSupportMessageDisplayBody } from "@/lib/support/support-seed-message-text";
import { supportRequesterStatusPill } from "@/lib/support/support-status-label";
import {
  SUPPORT_TICKET_BODY_MAX,
  applySupportTicketDraft,
  buildSupportTicketOpenPayload,
  canSubmitSupportTicket,
  clearSupportTicketDraft,
  initSupportTicketForm,
  SUPPORT_TICKET_ACTIVE_LIST_MAX,
  isSupportTicketAnsweredStatus,
  isSupportTicketStoreOrderEntry,
  sortActiveSupportTickets,
  isSupportTicketClosedStatus,
  listSupportTicketCategories,
  readSupportTicketDraft,
  selectSupportTicketCategory,
  selectSupportTicketIssue,
  setSupportTicketBody,
  supportTicketDraftKey,
  switchSupportTicketAudience,
  writeSupportTicketDraft,
  type SupportTicketDraft,
  type SupportTicketFormState,
} from "@/lib/support/support-ticket-form";
import { AdPricingGuideTable, type AdPricingGuideTab } from "@/components/ads/AdPricingGuideTable";
import type { AdPricingGuide } from "@/lib/ads/ad-pricing-guide";
import { OWNER_SUPPORT_TONE_CLASS, supportPrimaryCtaToneClass } from "@/lib/support/support-owner-cta";
import { SUPPORT_BACK_PRIORITY, useSupportModalBackStep } from "@/components/support/support-modal-back-steps";

/** 최종 감사 U-4: 회원/매장 전환 — 누르는 영역 44px · 보이는 칸은 작게 */
/** 재감사 U-4-a: 높이·너비 모두 44px 이상(「회원」·「매장」 두 글자는 그대로면 약 42px) */
const SWITCH_HIT = "touch-manipulation flex min-h-11 min-w-11 items-center justify-center";
const SWITCH_SEG = "border border-[var(--overlay-border)] px-2 py-1";

/* ───────────── 공통 격자 ───────────── */

export function SupportTicketHeader({
  title,
  onBack,
  onClose,
  titleId,
}: {
  title: string;
  onBack?: (() => void) | null;
  onClose: () => void;
  titleId?: string;
}) {
  const { t } = useI18n();
  return (
    <div
      className="grid h-12 shrink-0 grid-cols-[48px_minmax(0,1fr)_48px] items-center border-b border-[var(--overlay-border)] bg-[var(--overlay-surface)]"
      data-support-sheet-header="1"
      data-form-keyboard-sticky-chrome="1"
    >
      {onBack ? (
        <HeaderBackRoundButton
          className="flex h-12 w-12 items-center justify-center text-[var(--overlay-text-primary)]"
          aria-label={t("support_ticket_back_aria")}
          data-support-ticket-back="1"
          onClick={onBack}
        />
      ) : (
        <span aria-hidden />
      )}
      <h2
        id={titleId}
        tabIndex={-1}
        className="truncate text-center text-[16px] font-semibold text-[var(--overlay-text-primary)] focus:outline-none"
      >
        {title}
      </h2>
      <button
        type="button"
        data-support-modal-close="1"
        className="flex h-12 w-12 items-center justify-center text-[var(--overlay-text-primary)]"
        aria-label={t("support_modal_close_aria")}
        onClick={onClose}
      >
        <X className="h-5 w-5" strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}

/**
 * 문의 창 버튼 단일 모양 (UI U6·U9 · Owner 「권장안대로」 2026-11-27): 높이 44px · 모서리 4px(rounded-ui-rect).
 * 문의 창은 전체 화면이라 「화면에 붙은 버튼 = 4px」 계약을 따른다(떠 있는 시트 12px 아님). 모든 버튼이 이것만 쓴다.
 */
const SUPPORT_BTN = "w-full !min-h-11 !rounded-ui-rect";

/**
 * 문의 창 「다시 시도」 단일 모양 (최종 점검 U14 · 2026-11-28): 44px · 4px · 테두리 보조 버튼.
 * 진행 중 목록 오류 줄·요금표 실패·상세 실패가 모두 이것만 쓴다.
 */
const SUPPORT_RETRY_BTN =
  "touch-manipulation inline-flex min-h-11 shrink-0 items-center justify-center rounded-ui-rect border border-[var(--overlay-border)] bg-[var(--overlay-surface)] px-4 text-[13px] font-semibold text-[var(--overlay-text-primary)] active:bg-[var(--overlay-secondary)]";

function SupportRetryButton({
  onClick,
  className = "",
  ...data
}: { onClick: () => void; className?: string } & Record<`data-${string}`, string>) {
  const { t } = useI18n();
  return (
    <button type="button" className={`${SUPPORT_RETRY_BTN} ${className}`.trim()} onClick={onClick} {...data}>
      {t("common_retry")}
    </button>
  );
}

/** 최종 점검 U14: 문의 창 안 「불러오는 중」 단일 모양 = DIBAY 스피너 */
function SupportLoading({ dataAttr = "1" }: { dataAttr?: string }) {
  return (
    <div className="py-6" data-support-modal-loading={dataAttr}>
      <DibayPendingSpinner layout="inline" />
    </div>
  );
}

/** 최종 점검 U9: 전송 중(스피너만 보임)에도 버튼 이름이 읽히게 */
function busyName(loading: boolean, label: string): string | undefined {
  return loading ? label : undefined;
}

/** 상단 줄 44px — 누가(회원/매장) 또는 상태 */
function TopRow({
  label,
  value,
  tag,
  owner = false,
  tagClassName,
  right,
}: {
  label: string;
  value: string;
  tag?: string;
  owner?: boolean;
  /** UI U1: 상태 줄은 상태 색(`supportRequesterStatusPill`) — 주면 회원/사장님 색 대신 이 색 */
  tagClassName?: string;
  right?: ReactNode;
}) {
  return (
    <div
      className="grid h-11 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--overlay-border)] bg-[var(--overlay-surface)] px-4"
      data-support-ticket-who={owner ? "OWNER" : "MEMBER"}
    >
      {/* 실기 결함 1(2026-11-10): 라벨은 자르지 않는다 — 칸 너비 = 글자 길이 */}
      <span className="whitespace-nowrap text-[12px] text-[var(--overlay-text-secondary)]">{label}</span>
      <span className="truncate text-[14px] font-semibold text-[var(--overlay-text-primary)]">{value}</span>
      {right ??
        (tag ? (
          <span
            className={`rounded-ui-rect px-2 py-0.5 text-[11px] font-bold ${
              tagClassName ?? (owner ? OWNER_SUPPORT_TONE_CLASS : "bg-sam-primary-soft text-sam-primary")
            }`}
          >
            {tag}
          </span>
        ) : null)}
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-4 pb-1.5 pt-3 text-[12px] font-semibold text-[var(--overlay-text-secondary)]">{children}</p>
  );
}

/** 행 44px [라벨 64px | 값 1줄 | 16px] */
function FieldRow({
  label,
  value,
  placeholder,
  onClick,
  testId,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onClick?: () => void;
  testId?: string;
}) {
  const inner = (
    <>
      <span className="truncate text-[12px] text-[var(--overlay-text-secondary)]">{label}</span>
      <span
        className={`truncate text-[14px] ${value ? "text-[var(--overlay-text-primary)]" : "text-[var(--overlay-text-secondary)]"}`}
      >
        {value || placeholder || ""}
      </span>
      <span className="flex justify-end text-[var(--overlay-text-secondary)]" aria-hidden>
        {onClick ? <ChevronRight className="h-4 w-4" strokeWidth={2} /> : null}
      </span>
    </>
  );
  const cls =
    "grid h-11 w-full grid-cols-[64px_minmax(0,1fr)_16px] items-center gap-2 border-b border-[var(--overlay-border)] px-4 text-left last:border-b-0";
  return onClick ? (
    <button type="button" className={`${cls} active:bg-[var(--overlay-secondary)]`} onClick={onClick} data-testid={testId}>
      {inner}
    </button>
  ) : (
    <div className={cls} data-testid={testId}>
      {inner}
    </div>
  );
}

function Group({ children }: { children: ReactNode }) {
  return (
    <div className="border-y border-[var(--overlay-border)] bg-[var(--overlay-surface)]">{children}</div>
  );
}

function Footer({ children }: { children: ReactNode }) {
  return (
    <div
      className="shrink-0 border-t border-[var(--overlay-border)] bg-[var(--overlay-surface)] px-4 pb-1 pt-2.5"
      data-form-keyboard-footer="1"
      data-support-composer="1"
    >
      {children}
    </div>
  );
}

function useViewerOwnerStores() {
  const snap = useSyncExternalStore(subscribeOwnerLiteStore, getOwnerLiteStoreSnapshot, getOwnerLiteStoreServerSnapshot);
  return snap.ownerStores;
}

/* ───────────── 진행 중인 문의 (실기 결함 3 · 2026-11-10) ───────────── */

/**
 * 고객센터 FAB 숫자를 보고 눌렀을 때 답변 온 문의로 바로 갈 수 있게 — 쓰기 화면 맨 위.
 * 같은 대상(회원 / 그 매장)의 진행 중 문의만, 답변 완료 먼저(최근 순). 없으면 아무것도 그리지 않는다.
 */
function ActiveTicketList({
  audience,
  storeId,
  refreshKey,
  onOpenCase,
}: {
  audience: "MEMBER" | "OWNER";
  storeId: string | null;
  /** 최종 감사 U-3: 문의 상세에서 쓰기로 돌아오면 다시 읽는다(쓰기 화면은 그대로 유지되므로) */
  refreshKey: number;
  onOpenCase: (caseId: string) => void;
}) {
  const { t } = useI18n();
  const [rows, setRows] = useState<SupportCaseRow[]>([]);
  /** 최종 감사 U-14: 불러오기 실패를 숨기지 않는다 — 작은 오류 줄 + 다시 시도 */
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (audience === "OWNER" && !storeId) {
      setRows([]);
      setFailed(false);
      return;
    }
    let cancelled = false;
    setFailed(false);
    const qs = new URLSearchParams({ audience });
    if (audience === "OWNER" && storeId) qs.set("storeId", storeId);
    void fetch(`/api/support/cases?${qs.toString()}`, { credentials: "include", cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((j: { ok?: boolean; cases?: SupportCaseRow[] } | null) => {
        if (cancelled) return;
        if (!j?.ok || !Array.isArray(j.cases)) {
          setFailed(true);
          return;
        }
        setRows(sortActiveSupportTickets(j.cases).slice(0, SUPPORT_TICKET_ACTIVE_LIST_MAX));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [audience, storeId, attempt, refreshKey]);

  if (failed && rows.length === 0) {
    return (
      <div
        className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-[var(--overlay-border)] bg-[var(--overlay-surface)] pl-4"
        data-support-ticket-active-error="1"
        role="alert"
      >
        <span className="truncate text-[12px] text-[var(--overlay-text-secondary)]">
          {t("support_ticket_active_load_failed")}
        </span>
        <SupportRetryButton
          data-support-ticket-active-retry="1"
          className="my-1 mr-4"
          onClick={() => setAttempt((n) => n + 1)}
        />
      </div>
    );
  }
  if (rows.length === 0) return null;
  return (
    <div data-support-ticket-active-list="1">
      <SectionLabel>{t("support_ticket_active_section")}</SectionLabel>
      <div className="border-y border-[var(--overlay-border)] bg-[var(--overlay-surface)]">
        {rows.map((c) => (
          <SupportCaseRowButton key={c.id} c={c} surface="overlay" onOpen={onOpenCase} />
        ))}
      </div>
    </div>
  );
}

/* ───────────── 쓰기 ───────────── */

type ComposeView = "form" | "pick_category" | "pick_issue" | "ad_pricing";

/** 광고 감사 E: 「광고 금액 확인」 줄이 나오는 문의 유형 (회원 광고 · 사장님 배달 광고) */
const AD_PRICING_SUPPORT_CATEGORIES = new Set(["AD", "DELIVERY_AD", "CAMPAIGN"]);

/** 고객센터 창 안 광고 요금표 — 공지 고정 게시물과 같은 표·같은 API (시안 ④) */
function SupportAdPricingView({
  titleId,
  owner,
  onBack,
  onClose,
}: {
  titleId: string;
  owner: boolean;
  onBack: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [guide, setGuide] = useState<AdPricingGuide | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<AdPricingGuideTab>(owner ? "store" : "member");
  /** R-28: 실패 화면에서 「다시 시도」 — 공지 화면과 같은 동작 */
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/ads/pricing-guide", { cache: "no-store", credentials: "include" })
      .then((r) => r.json().catch(() => null))
      .then((j: { ok?: boolean; guide?: AdPricingGuide } | null) => {
        if (cancelled) return;
        if (j?.ok && j.guide) setGuide(j.guide);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-sam-app" data-support-ticket-view="ad_pricing">
      <SupportTicketHeader titleId={titleId} title={t("ad_guide_title")} onBack={onBack} onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        {failed ? (
          <div className="py-6 text-center">
            <p className="text-[13px] text-[var(--overlay-text-secondary)]">{t("ad_guide_load_failed")}</p>
            <SupportRetryButton
              data-support-ad-pricing-retry="1"
              className="mt-3"
              onClick={() => {
                setFailed(false);
                setGuide(null);
                setAttempt((n) => n + 1);
              }}
            />
          </div>
        ) : !guide ? (
          <SupportLoading dataAttr="ad_pricing" />
        ) : (
          <AdPricingGuideTable guide={guide} tab={tab} onTabChange={setTab} showApply={false} />
        )}
      </div>
      <Footer>
        <DibayOverlayButton
          roleTone="primary"
          className={`${SUPPORT_BTN} ${supportPrimaryCtaToneClass(owner)}`}
          data-support-ad-pricing-back="1"
          onClick={onBack}
        >
          {t("ad_guide_back_to_inquiry")}
        </DibayOverlayButton>
      </Footer>
    </div>
  );
}

export function SupportTicketCompose({
  context,
  viewerName,
  titleId,
  hidden = false,
  submitting,
  submitError,
  onClose,
  onSubmit,
  onOpenStoreChat,
  onOpenCase,
}: {
  context: SupportContext;
  viewerName: string;
  titleId: string;
  /** 최종 감사 U-3: 문의 상세가 위에 열려 있어 숨긴 채 유지 중 — 입력 내용·화면 단계는 그대로 둔다 */
  hidden?: boolean;
  submitting: boolean;
  submitError: string | null;
  onClose: () => void;
  onSubmit: (state: SupportTicketFormState, draftKey: string) => void;
  /** 주문 화면 — 「매장에 문의하기(주문 채팅)」 */
  onOpenStoreChat: (href: string) => void;
  /** 진행 중인 문의 행 — 그 문의 상세로 */
  onOpenCase: (caseId: string) => void;
}) {
  const { t, safeT } = useI18n();
  const labels = useSupportCategoryLabels();
  const ownerStores = useViewerOwnerStores();
  const viewerHasStore = ownerStores.length > 0;
  const [state, setState] = useState<SupportTicketFormState>(() => initSupportTicketForm(context));
  const [view, setView] = useState<ComposeView>("form");
  const draftKey = useMemo(() => supportTicketDraftKey(context), [context]);
  const [draft, setDraft] = useState<SupportTicketDraft | null>(() => readSupportTicketDraft(draftKey));
  const touchedRef = useRef(false);
  /** 최종 감사 U-3: 상세에서 돌아오면 「진행 중인 문의」 상태가 바뀌었을 수 있다 — 그 목록만 다시 읽는다 */
  const [activeRefreshKey, setActiveRefreshKey] = useState(0);
  const wasHiddenRef = useRef(hidden);
  useEffect(() => {
    if (wasHiddenRef.current && !hidden) setActiveRefreshKey((n) => n + 1);
    wasHiddenRef.current = hidden;
  }, [hidden]);

  // 쓰는 대로 저장 — 이어 쓰기 카드가 떠 있는 동안(아직 고르지 않음)은 저장본을 덮지 않는다.
  //   고객이 「이어 쓰기」 또는 「지우기」를 고른 뒤부터 저장한다(새로 쓰기 시작해도 예전 저장본은 묻지 않고 지우지 않음).
  // 최종 점검 U2: 300ms 안에 닫기·◁·상세 열기를 해도 잃지 않게 — 기다리는 저장은 그때 바로 쓴다(타이머만 지우지 않음).
  const pendingSaveRef = useRef<{ key: string; state: SupportTicketFormState } | null>(null);
  const flushPendingSave = useCallback(() => {
    const pending = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (pending) writeSupportTicketDraft(pending.key, pending.state);
  }, []);
  useEffect(() => {
    if (!touchedRef.current || draft) {
      pendingSaveRef.current = null;
      return;
    }
    pendingSaveRef.current = { key: draftKey, state };
    const id = window.setTimeout(flushPendingSave, 300);
    return () => window.clearTimeout(id);
  }, [draftKey, state, draft, flushPendingSave]);
  useEffect(() => () => flushPendingSave(), [flushPendingSave]);
  useEffect(() => {
    if (hidden) flushPendingSave();
  }, [hidden, flushPendingSave]);

  const update = useCallback((fn: (s: SupportTicketFormState) => SupportTicketFormState) => {
    touchedRef.current = true;
    // 병합 전 C: 「작성 중인 문의가 있어요」 카드를 두고 새로 입력을 시작하면 카드를 닫고 새 글을 저장한다
    // (화면에 보이는 글 = 저장되는 글 하나 · 카드가 떠 있는 동안 입력이 저장되지 않던 것)
    setDraft(null);
    setState(fn);
  }, []);

  const isOwner = state.audience === "OWNER";
  const ownerStore = isOwner ? ownerStores.find((s) => s.id === state.storeId) ?? null : null;
  const switchable = !state.categoryLocked && context.audience === "MEMBER" && viewerHasStore;
  const switchStore =
    ownerStores.find((s) => String(s.approval_status) === "approved") ?? ownerStores[0] ?? null;

  // 어드민 「문의 유형 관리」 이름·순서·숨김 적용(3단계) — 정의·서버 판정은 코드 그대로
  const categories = visibleSupportCategories(
    labels.index,
    state.audience,
    listSupportTicketCategories({ audience: state.audience, viewerHasStore })
  );
  const issues = state.category
    ? visibleSupportIssues(labels.index, state.audience, state.category, listIssueTypesForCategory(state.category))
    : [];
  const referenceText = state.referenceType
    ? `${supportReferenceLabel(safeT, state.referenceType)}${
        state.referenceTitle ? ` · ${state.referenceTitle}` : state.referenceId ? ` · ${state.referenceId.slice(0, 8)}` : ""
      }`
    : "";

  const title = isOwner ? t("support_ticket_owner_title") : t("support_ticket_title");

  // 최종 점검 M1: 분야·세부 선택·요금표에서 ◁ = 화면 ‹ (쓰기 화면으로) — 숨긴 채 유지 중이면 등록하지 않는다
  useSupportModalBackStep(!hidden && view !== "form", SUPPORT_BACK_PRIORITY.composeSubView, () => setView("form"));
  const storeOrderEntry = isSupportTicketStoreOrderEntry(state);

  const whoRow = (
    <TopRow
      label={isOwner ? t("support_ticket_who_owner") : t("support_ticket_who_member")}
      value={isOwner ? ownerStore?.store_name || t("support_ticket_tag_owner") : viewerName}
      tag={isOwner ? t("support_ticket_tag_owner") : t("support_ticket_tag_member")}
      owner={isOwner}
      right={
        switchable && switchStore ? (
          /* 최종 감사 U-4: 누르는 영역 44px(SWITCH_HIT) — 보이는 묶음 모양은 그대로 작게(SWITCH_SEG) */
          <span className="-my-px inline-flex items-center text-[11px] font-bold" data-support-ticket-switch-group="1">
            <button
              type="button"
              data-support-ticket-switch="MEMBER"
              aria-pressed={!isOwner}
              className={`${SWITCH_HIT} pl-1`}
              onClick={() =>
                update((s) =>
                  switchSupportTicketAudience(s, { audience: "MEMBER", sourceSurface: "mypage_customer_center" })
                )
              }
            >
              <span
                className={`${SWITCH_SEG} rounded-l-ui-rect ${
                  !isOwner ? "bg-sam-primary text-sam-on-primary" : "text-[var(--overlay-text-secondary)]"
                }`}
              >
                {t("support_ticket_switch_member")}
              </span>
            </button>
            <button
              type="button"
              data-support-ticket-switch="OWNER"
              aria-pressed={isOwner}
              className={`${SWITCH_HIT} pr-1`}
              onClick={() =>
                update((s) =>
                  switchSupportTicketAudience(s, {
                    audience: "OWNER",
                    storeId: switchStore.id,
                    sourceSurface: "owner_customer_center",
                  })
                )
              }
            >
              <span
                className={`${SWITCH_SEG} -ml-px rounded-r-ui-rect ${
                  isOwner ? OWNER_SUPPORT_TONE_CLASS : "text-[var(--overlay-text-secondary)]"
                }`}
              >
                {t("support_ticket_switch_owner")}
              </span>
            </button>
          </span>
        ) : undefined
      }
    />
  );

  if (view === "ad_pricing") {
    return (
      <SupportAdPricingView titleId={titleId} owner={isOwner} onBack={() => setView("form")} onClose={onClose} />
    );
  }

  if (view === "pick_category" || view === "pick_issue") {
    const picking = view === "pick_category";
    const list = picking
      ? categories.map((c) => ({ id: c.id, label: labels.categoryLabel(state.audience, c.id), on: c.id === state.category }))
      : issues.map((i) => ({
          id: i.id,
          label: labels.issueLabel(state.audience, state.category, i.id),
          on: i.id === state.issueType,
        }));
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-sam-app" data-support-ticket-view={view}>
        <SupportTicketHeader
          titleId={titleId}
          title={picking ? t("support_ticket_pick_category_title") : t("support_ticket_pick_issue_title")}
          onBack={() => setView("form")}
          onClose={onClose}
        />
        {whoRow}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-3">
          <Group>
            {list.map((row) => (
              <button
                key={row.id}
                type="button"
                data-testid={picking ? `support-ticket-cat-${row.id}` : `support-ticket-issue-${row.id}`}
                className="grid h-11 w-full grid-cols-[minmax(0,1fr)_16px] items-center gap-2 border-b border-[var(--overlay-border)] px-4 text-left last:border-b-0 active:bg-[var(--overlay-secondary)]"
                onClick={() => {
                  if (picking) {
                    update((s) => selectSupportTicketCategory(s, row.id));
                    setView("pick_issue");
                  } else {
                    update((s) => selectSupportTicketIssue(s, row.id));
                    setView("form");
                  }
                }}
              >
                <span
                  className={`truncate text-[14px] ${row.on ? "font-semibold text-sam-primary" : "text-[var(--overlay-text-primary)]"}`}
                >
                  {row.label}
                </span>
                <span className="flex justify-end text-[var(--overlay-text-secondary)]" aria-hidden>
                  {row.on ? <Check className="h-4 w-4 text-sam-primary" strokeWidth={2.5} /> : <ChevronRight className="h-4 w-4" strokeWidth={2} />}
                </span>
              </button>
            ))}
          </Group>
        </div>
      </div>
    );
  }

  const canSubmit = canSubmitSupportTicket(state) && !submitting;
  const bodyLen = state.body.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-sam-app" data-support-ticket-view="form">
      <SupportTicketHeader titleId={titleId} title={title} onClose={onClose} />
      {whoRow}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-form-keyboard-scroll-root="1">
        <ActiveTicketList
          audience={state.audience}
          storeId={state.storeId ?? null}
          refreshKey={activeRefreshKey}
          onOpenCase={onOpenCase}
        />

        {draft ? (
          <div
            className="mx-4 mt-3 overflow-hidden rounded-ui-rect border border-sam-warning bg-[var(--overlay-surface)]"
            data-support-ticket-draft="1"
          >
            <p className="flex h-9 items-center bg-sam-warning-soft px-3 text-[13px] font-semibold text-[var(--overlay-text-primary)]">
              {t("support_ticket_draft_title")}
            </p>
            {draft.category ? (
              <FieldRow
                label={t("support_ticket_field_category")}
                value={[
                  labels.categoryLabel(draft.audience, draft.category),
                  labels.issueLabel(draft.audience, draft.category, draft.issueType),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ) : null}
            <FieldRow label={t("support_ticket_section_body")} value={draft.body.replace(/\s+/g, " ")} />
            <FieldRow
              label={t("support_ticket_draft_saved")}
              value={formatMypageDate(draft.savedAt, { style: "datetime" })}
            />
            <div className="grid grid-cols-2 gap-2 p-3">
              <DibayOverlayButton
                roleTone="primary"
                className={`${SUPPORT_BTN} ${supportPrimaryCtaToneClass(isOwner)}`}
                data-support-ticket-draft-continue="1"
                onClick={() => {
                  const d = draft;
                  setDraft(null);
                  update((s) => applySupportTicketDraft(s, d));
                }}
              >
                {t("support_ticket_draft_continue")}
              </DibayOverlayButton>
              <DibayOverlayButton
                roleTone="destructive"
                className={SUPPORT_BTN}
                data-support-ticket-draft-delete="1"
                onClick={() => {
                  void (async () => {
                    const ok = await dibayConfirm({
                      title: t("support_ticket_draft_delete_title"),
                      description: t("support_ticket_draft_delete_body"),
                      cancelLabel: t("support_ticket_cancel"),
                      confirmLabel: t("support_ticket_draft_delete"),
                      confirmTone: "destructive",
                    });
                    if (!ok) return;
                    clearSupportTicketDraft(draftKey);
                    setDraft(null);
                  })();
                }}
              >
                {t("support_ticket_draft_delete")}
              </DibayOverlayButton>
            </div>
          </div>
        ) : null}

        {storeOrderEntry ? (
          <div
            className="mx-4 mt-3 grid gap-2 rounded-ui-rect border border-[var(--overlay-border)] bg-[var(--overlay-surface)] p-3"
            data-support-ticket-store-first="1"
          >
            <p className="text-[14px] font-semibold text-[var(--overlay-text-primary)]">
              {t("support_ticket_store_first_title")}
            </p>
            <p className="text-[12px] leading-relaxed text-[var(--overlay-text-secondary)]">
              {state.storeChatHref ? t("support_ticket_store_first_body") : t("support_ticket_store_first_chat_closed")}
            </p>
            {state.storeChatHref ? (
              <DibayOverlayButton
                roleTone="primary"
                className={`${SUPPORT_BTN} ${supportPrimaryCtaToneClass(isOwner)}`}
                data-support-ticket-store-chat="1"
                onClick={() => onOpenStoreChat(state.storeChatHref!)}
              >
                {t("support_ticket_store_first_cta")}
              </DibayOverlayButton>
            ) : null}
          </div>
        ) : null}

        <SectionLabel>
          {draft
            ? t("support_ticket_new_section")
            : storeOrderEntry
              ? t("support_ticket_store_unresolved")
              : t("support_ticket_section_what")}
        </SectionLabel>
        <Group>
          <FieldRow
            label={t("support_ticket_field_category")}
            value={state.category ? labels.categoryLabel(state.audience, state.category) : ""}
            placeholder={t("support_ticket_pick_placeholder")}
            onClick={state.categoryLocked ? undefined : () => setView("pick_category")}
            testId="support-ticket-field-category"
          />
          <FieldRow
            label={t("support_ticket_field_issue")}
            value={labels.issueLabel(state.audience, state.category, state.issueType)}
            placeholder={t("support_ticket_pick_placeholder")}
            onClick={state.category ? () => setView("pick_issue") : undefined}
            testId="support-ticket-field-issue"
          />
          {AD_PRICING_SUPPORT_CATEGORIES.has(String(state.category ?? "")) ? (
            /* 광고 감사 E: 광고 문의 중 금액 확인 — 창 안에서 요금표, 「이 내용으로 문의하기」로 돌아온다 */
            <button
              type="button"
              data-testid="support-ticket-ad-pricing"
              onClick={() => setView("ad_pricing")}
              className="grid h-11 w-full grid-cols-[minmax(0,1fr)_16px] items-center gap-2 border-b border-[var(--overlay-border)] bg-sam-primary-soft px-4 text-left last:border-b-0 active:bg-[var(--overlay-secondary)]"
            >
              <span className="truncate text-[14px] font-semibold text-sam-primary">{t("ad_guide_check_prices")}</span>
              <span className="flex justify-end text-sam-primary" aria-hidden>
                <ChevronRight className="h-4 w-4" strokeWidth={2} />
              </span>
            </button>
          ) : null}
          {referenceText ? <FieldRow label={t("support_ticket_field_reference")} value={referenceText} /> : null}
        </Group>

        <SectionLabel>{t("support_ticket_section_body")}</SectionLabel>
        <div className="border-y border-[var(--overlay-border)] bg-[var(--overlay-surface)] px-4 py-3">
          <textarea
            value={state.body}
            onChange={(e) => {
              const v = e.target.value;
              update((s) => setSupportTicketBody(s, v));
            }}
            rows={5}
            maxLength={SUPPORT_TICKET_BODY_MAX}
            data-form-keyboard-field="1"
            data-support-ticket-body="1"
            className="block min-h-[7.5rem] w-full resize-none rounded-ui-rect border border-[var(--overlay-border)] bg-[var(--overlay-surface)] px-3 py-2.5 text-[14px] leading-relaxed text-[var(--overlay-text-primary)] placeholder:text-[var(--overlay-text-secondary)] focus:border-sam-primary focus:outline-none"
            placeholder={t("support_ticket_body_placeholder")}
          />
          <p className="mt-1 text-right text-[11px] text-[var(--overlay-text-secondary)]">
            {t("support_ticket_body_count", { count: bodyLen, max: SUPPORT_TICKET_BODY_MAX })}
          </p>
        </div>
        <p className="px-4 py-3 text-[12px] leading-relaxed text-[var(--overlay-text-secondary)]">{t("support_ticket_help")}</p>
      </div>
      <Footer>
        {submitError ? (
          <p className="mb-2 text-[12px] text-[var(--overlay-danger)]" role="alert">
            {supportErrorLabel(safeT, submitError)}
          </p>
        ) : null}
        {/* 최종 점검 M3: 사장님 = 누를 수 있을 때·전송 중 모두 갈색, 정말 비활성일 때만 회색 */}
        <DibayOverlayButton
          roleTone="primary"
          className={`${SUPPORT_BTN} ${supportPrimaryCtaToneClass(isOwner, { disabled: !canSubmit, loading: submitting })}`}
          loading={submitting}
          disabled={!canSubmit}
          aria-label={busyName(submitting, t("support_ticket_submit"))}
          data-support-ticket-submit="1"
          onClick={() => {
            if (!buildSupportTicketOpenPayload(state)) return;
            flushPendingSave();
            onSubmit(state, draftKey);
          }}
        >
          {t("support_ticket_submit")}
        </DibayOverlayButton>
      </Footer>
    </div>
  );
}

/* ───────────── 접수 완료 ───────────── */

export type SupportTicketSubmittedInfo = {
  caseNo: string;
  categoryLabel: string;
  issueLabel: string;
  createdAt: string;
  audience: "MEMBER" | "OWNER";
  storeId: string | null;
  /** 고객 문의 SSOT §6 (F4): 같은 분야 진행 중 문의에 이어 붙었다 — 기존 문의의 번호·분야·세부를 보여 준다. */
  merged?: boolean;
};

export function SupportTicketSubmitted({
  info,
  titleId,
  onClose,
  onViewMine,
}: {
  info: SupportTicketSubmittedInfo;
  titleId: string;
  onClose: () => void;
  onViewMine: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-sam-app" data-support-ticket-view="submitted">
      <SupportTicketHeader titleId={titleId} title={t("support_ticket_submitted_title")} onClose={onClose} />
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-sam-primary-soft text-sam-primary">
          <Check className="h-7 w-7" strokeWidth={2.5} aria-hidden />
        </span>
        <p className="mt-2 text-[17px] font-semibold text-[var(--overlay-text-primary)]">
          {info.merged ? t("support_ticket_merged_heading") : t("support_ticket_submitted_heading")}
        </p>
        {info.merged ? (
          <p className="text-[13px] leading-relaxed text-[var(--overlay-text-secondary)]" data-support-ticket-merged="1">
            {t("support_ticket_merged_hint")}
          </p>
        ) : null}
        <p className="text-[13px] text-[var(--overlay-text-secondary)]">
          {[info.categoryLabel, info.issueLabel].filter(Boolean).join(" · ")}
        </p>
        <p className="text-[13px] text-[var(--overlay-text-secondary)]">
          {t("support_ticket_submitted_no", { no: info.caseNo })} · {formatMypageDate(info.createdAt, { style: "datetime" })}
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-[var(--overlay-text-secondary)]">
          {t("support_ticket_waiting_hint")}
        </p>
      </div>
      <Footer>
        <div className="grid grid-cols-2 gap-2">
          <DibayOverlayButton roleTone="secondary" className={SUPPORT_BTN} onClick={onViewMine} data-support-ticket-view-mine="1">
            {t("support_ticket_view_mine")}
          </DibayOverlayButton>
          <DibayOverlayButton roleTone="secondary" className={SUPPORT_BTN} onClick={onClose} data-support-ticket-ok="submitted">
            {t("support_ticket_ok")}
          </DibayOverlayButton>
        </div>
      </Footer>
    </div>
  );
}

/* ───────────── 비로그인 ───────────── */

export function SupportTicketLogin({
  titleId,
  onClose,
  onLogin,
  onSignup,
}: {
  titleId: string;
  onClose: () => void;
  onLogin: () => void;
  onSignup: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-sam-app" data-support-ticket-view="login">
      <SupportTicketHeader titleId={titleId} title={t("support_ticket_title")} onClose={onClose} />
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-[17px] font-semibold text-[var(--overlay-text-primary)]">{t("support_ticket_login_title")}</p>
        <p className="text-[13px] leading-relaxed text-[var(--overlay-text-secondary)]">{t("support_ticket_login_body")}</p>
      </div>
      <Footer>
        <div className="grid grid-cols-2 gap-2">
          <DibayOverlayButton roleTone="secondary" className={SUPPORT_BTN} onClick={onSignup} data-support-ticket-signup="1">
            {t("support_ticket_signup_cta")}
          </DibayOverlayButton>
          <DibayOverlayButton roleTone="primary" className={SUPPORT_BTN} onClick={onLogin} data-support-ticket-login="1">
            {t("support_ticket_login_cta")}
          </DibayOverlayButton>
        </div>
      </Footer>
    </div>
  );
}

/* ───────────── 문의 상세(질문·답변) ───────────── */

function QaBlock({
  label,
  at,
  body,
  answer = false,
  deleted = false,
  edited = false,
}: {
  label: string;
  at: string;
  body: string;
  answer?: boolean;
  deleted?: boolean;
  /** 최종 점검 U13: 어드민이 답변을 고쳤다(`edited_at`) — 시각 옆 「수정됨」 */
  edited?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between gap-2 px-4 pb-1.5">
        <span className="truncate text-[12px] font-semibold text-[var(--overlay-text-secondary)]">{label}</span>
        <span className="shrink-0 text-[11px] text-[var(--overlay-text-secondary)]">
          {at}
          {edited ? <span data-support-ticket-edited="1">{` · ${t("support_message_edited")}`}</span> : null}
        </span>
      </div>
      <div
        className={`border-y border-[var(--overlay-border)] bg-[var(--overlay-surface)] px-4 py-3 ${
          answer ? "border-l-[3px] border-l-sam-primary" : ""
        }`}
        data-support-ticket-qa={answer ? "answer" : "question"}
      >
        {deleted ? (
          <p className="text-[14px] italic text-[var(--overlay-text-secondary)]">{t("support_message_deleted")}</p>
        ) : (
          <p data-user-content="" className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-[var(--overlay-text-primary)]">
            {body}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * 재감사 D1 — 이 앱 실행 동안 본 「종료 + 안 읽은 답변」 내용 (문의 id → 글).
 * 서버는 그 내용을 한 번만 주고 읽음 처리하므로, 같은 창이 다시 그려지거나 다시 열려도 빈 화면이 되지 않게 한다.
 */
const closedUnreadSeen = new Map<string, SupportMessageRow[]>();

/** 최종 점검 M1: 추가 문의 입력 글 — 문의별 임시 저장(닫거나 ◁ 해도 잃지 않음 · 보내면 지움) */
const FOLLOW_UP_DRAFT_PREFIX = "dibaySupportFollowUpDraft:";

function readFollowUpDraft(caseId: string): string {
  try {
    return window.sessionStorage.getItem(FOLLOW_UP_DRAFT_PREFIX + caseId) ?? "";
  } catch {
    return "";
  }
}

function writeFollowUpDraft(caseId: string, text: string): void {
  try {
    if (text) window.sessionStorage.setItem(FOLLOW_UP_DRAFT_PREFIX + caseId, text);
    else window.sessionStorage.removeItem(FOLLOW_UP_DRAFT_PREFIX + caseId);
  } catch {
    /* 저장 실패 — 화면 안 입력은 그대로 */
  }
}

export function SupportTicketDetail({
  caseId,
  titleId,
  onClose,
  onClosedByRequester,
  onDone,
  onNewInquiry,
  onUnauthorized,
  onBack,
}: {
  caseId: string;
  titleId: string;
  onClose: () => void;
  /** 「확인했어요」 성공 — 쓰기 화면에서 연 상세면 쓰기 화면으로, 아니면 닫기 (M2) */
  onClosedByRequester: () => void;
  /** 종료+안 읽은 답변 「확인」·답변 대기 「확인」 — 위와 같은 규칙 (M2 · 재감사 4). 없으면 닫기 */
  onDone?: () => void;
  onNewInquiry: (fromCase: { audience: "MEMBER" | "OWNER"; ownerStoreId: string | null } | null) => void;
  onUnauthorized: () => void;
  /** 쓰기 화면의 「진행 중인 문의」에서 연 경우 — 머리글 뒤로 = 쓰기 화면 */
  onBack?: (() => void) | null;
}) {
  const { t, safeT } = useI18n();
  const labels = useSupportCategoryLabels();
  const [supportCase, setSupportCase] = useState<SupportCaseRow | null>(null);
  const [messages, setMessages] = useState<SupportMessageRow[]>([]);
  const [closedView, setClosedView] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** 최종 점검 M1: 입력 칸 열림과 글을 나눈다 — ◁ 로 칸을 닫아도 글은 남는다 */
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpText, setFollowUpTextState] = useState(() =>
    typeof window === "undefined" ? "" : readFollowUpDraft(caseId)
  );
  const setFollowUpText = useCallback(
    (text: string) => {
      setFollowUpTextState(text);
      writeFollowUpDraft(caseId, text);
    },
    [caseId]
  );
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  /** 재감사 D1: 호출부가 새 함수를 넘겨도 다시 조회하지 않는다 */
  const onUnauthorizedRef = useRef(onUnauthorized);
  useEffect(() => {
    onUnauthorizedRef.current = onUnauthorized;
  });
  /** 재감사 D1: 늦게 도착한 옛 응답이 최신 화면을 덮지 않게(마지막 요청만 반영) */
  const loadSeqRef = useRef(0);

  /** 최종 점검 U8: 이미 그린 문의를 다시 읽을 때(추가 문의 보낸 뒤 등)는 대기 표시로 바꾸지 않는다(처음 읽을 때만) */
  const loadedOnceRef = useRef(false);
  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    const stale = () => seq !== loadSeqRef.current;
    if (!loadedOnceRef.current) setLoading(true);
    setError(null);
    try {
      const fetchCase = () => fetch(`/api/support/cases/${encodeURIComponent(caseId)}`, { credentials: "include" });
      let res = await fetchCase();
      if (res.status === 401) {
        // 토큰 만료 직후일 수 있다 — 세션을 한 번 살린 뒤 다시 읽고, 그래도 401 이면 로그인 안내
        const { ensureSessionHealthy } = await import("@/lib/auth/dibay-session-manager");
        await ensureSessionHealthy("support_modal_case_load");
        res = await fetchCase();
      }
      if (stale()) return;
      if (res.status === 401) {
        onUnauthorizedRef.current();
        return;
      }
      const json = (await res.json()) as {
        ok?: boolean;
        case?: SupportCaseRow;
        messages?: SupportMessageRow[];
        closed?: boolean;
        error?: string;
        notificationsRead?: number;
      };
      if (stale()) return;
      if (!res.ok || !json.ok || !json.case) {
        setError(res.status === 403 || res.status === 404 ? "forbidden" : (json.error ?? "load_failed"));
        return;
      }
      if (Number(json.notificationsRead ?? 0) > 0 && typeof window !== "undefined") {
        const { KASAMA_NOTIFICATIONS_UPDATED } = await import("@/lib/notifications/notification-events");
        const { resyncBadgesAfterNotificationEventsRead } = await import(
          "@/lib/notifications/client/notification-events-read-resync"
        );
        window.dispatchEvent(new Event(KASAMA_NOTIFICATIONS_UPDATED));
        resyncBadgesAfterNotificationEventsRead("notification_opened");
      }
      setSupportCase(json.case);
      loadedOnceRef.current = true;
      const closed = json.closed === true || isSupportTicketClosedStatus(json.case.status);
      let shown = (json.messages ?? []).filter((m) => m.sender_type !== "SYSTEM");
      if (closed) {
        // 재감사 D1: 종료+안 읽은 답변은 서버가 한 번만 내용을 준다(그때 읽음 처리) — 창이 다시 열려도 같은 내용을 보이게 기억
        if (shown.length > 0) closedUnreadSeen.set(caseId, shown);
        else shown = closedUnreadSeen.get(caseId) ?? [];
      }
      setClosedView(closed);
      setMessages(shown);
    } catch {
      if (!stale()) setError("network_error");
    } finally {
      if (!stale()) setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const fromCase = supportCase
    ? { audience: supportCase.audience, ownerStoreId: supportCase.owner_store_id }
    : null;

  useSupportModalBackStep(followUpOpen && !closedView, SUPPORT_BACK_PRIORITY.followUpInput, () =>
    setFollowUpOpen(false)
  );

  const sendFollowUp = async () => {
    const body = followUpText.trim();
    if (!body || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/support/cases/${encodeURIComponent(caseId)}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setActionError(json.error ?? (res.status === 429 ? "rate_limited" : "send_failed"));
        if (supportErrorNeedsReload(json.error)) void load();
        return;
      }
      setFollowUpText("");
      setFollowUpOpen(false);
      await load();
    } catch {
      setActionError("network_error");
    } finally {
      setBusy(false);
    }
  };

  const confirmClose = async () => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/support/cases/${encodeURIComponent(caseId)}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        // 2차 재감사 A: 화면이 본 마지막 글 시각 — 그 뒤 새 답변이 왔으면 서버가 닫지 않는다(case_updated)
        body: JSON.stringify({ action: "close", seenLastMessageAt: supportCase?.last_message_at ?? null }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setActionError(json.error ?? (res.status === 429 ? "rate_limited" : "update_failed"));
        // 새 답변이 와서 닫지 않았다·상태가 바뀌었다 → 다시 읽어 최신 상태를 보여 준다(안내 문구는 그대로 둔다)
        if (supportErrorNeedsReload(json.error)) void load();
        return;
      }
      onClosedByRequester();
    } catch {
      setActionError("network_error");
    } finally {
      setBusy(false);
    }
  };

  const categoryLabel = supportCase ? labels.categoryLabel(supportCase.audience, supportCase.category) : "";
  const headerTitle = supportCase
    ? [supportCase.public_case_no, categoryLabel].filter(Boolean).join(" · ")
    : t("support_ticket_title");
  // UI U1: 문구·색 모두 같은 정의(supportRequesterStatusPill)
  const statusText = supportCase ? t(supportRequesterStatusPill(supportCase.status, supportCase.requester_unread_count).key) : "";
  const answered = isSupportTicketAnsweredStatus(supportCase?.status);
  const lastAt = supportCase ? formatMypageDate(supportCase.last_message_at, { style: "datetime" }) : "";
  const ownerTone = supportCase?.audience === "OWNER";

  let requesterSeen = 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-sam-app" data-support-ticket-view="detail">
      <SupportTicketHeader
        titleId={titleId}
        title={headerTitle}
        // 병합 전 L1: 화면 ‹ 도 기기 ◁ 와 같이 — 추가 문의 입력칸이 열려 있으면 먼저 닫는다(계약 §6)
        onBack={onBack ? () => (followUpOpen && !closedView ? setFollowUpOpen(false) : onBack()) : null}
        onClose={onClose}
      />
      {/* 최종 감사 U-2: 종료 문의도 같은 상태 줄 — 종료+안 읽은 답변 = 「새 답변」, 종료 = 「종료」(계약 §14 U1) */}
      {supportCase ? (
        <TopRow
          label={t("support_ticket_status_label")}
          value={lastAt}
          tag={statusText}
          owner={supportCase.audience === "OWNER"}
          tagClassName={supportRequesterStatusPill(supportCase.status, supportCase.requester_unread_count).className}
        />
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-3" data-support-message-list="1">
        {loading ? (
          <SupportLoading />
        ) : error ? (
          <div className="mx-4 rounded-ui-rect border border-[var(--overlay-border)] bg-[var(--overlay-surface)] p-4 text-[14px] text-[var(--overlay-danger)]">
            {error === "forbidden" ? t("support_case_unavailable") : supportErrorLabel(safeT, error)}
            {error !== "forbidden" ? (
              <div className="mt-3">
                <SupportRetryButton data-support-ticket-detail-retry="1" onClick={() => void load()} />
              </div>
            ) : null}
          </div>
        ) : closedView && messages.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 pt-16 text-center" data-support-ticket-closed="1">
            <p className="text-[17px] font-semibold text-[var(--overlay-text-primary)]">{t("support_ticket_closed_title")}</p>
            <p className="text-[13px] leading-relaxed text-[var(--overlay-text-secondary)]">{t("support_ticket_closed_hint")}</p>
          </div>
        ) : (
          <>
            {closedView ? (
              // 고객 문의 SSOT §3-1 (F3, Owner 2026-11-27): 안 읽은 답변이 있는 종료 문의 = 내용을 보여 주고, 읽으면 사라진다.
              <p
                className="mx-4 mb-3 rounded-ui-rect border border-[var(--overlay-border)] bg-[var(--overlay-surface)] px-3 py-2.5 text-[13px] leading-relaxed text-[var(--overlay-text-secondary)]"
                data-support-ticket-closed-unread="1"
              >
                {t("support_ticket_closed_unread_hint")}
              </p>
            ) : null}
            {messages.map((m) => {
            const fromRequester = m.sender_type === "MEMBER" || m.sender_type === "OWNER";
            const label = fromRequester
              ? requesterSeen++ === 0
                ? t("support_ticket_my_question")
                : t("support_ticket_followup_label")
              : t("support_ticket_answer_label");
            return (
              <QaBlock
                key={m.id}
                label={label}
                at={formatMypageDate(m.created_at, { style: "datetime" })}
                body={resolveSupportMessageDisplayBody(safeT, m.body)}
                answer={!fromRequester}
                deleted={Boolean(m.deleted_at)}
                edited={!fromRequester && Boolean(m.edited_at) && !m.deleted_at}
              />
            );
          })}
          </>
        )}
        {!loading && !error && !closedView && !answered ? (
          <p className="px-4 pb-4 text-[12px] leading-relaxed text-[var(--overlay-text-secondary)]">
            {t("support_ticket_waiting_hint")}
          </p>
        ) : null}
      </div>
      {!loading && !error ? (
        <Footer>
          {actionError ? (
            <p className="mb-2 text-[12px] text-[var(--overlay-danger)]" role="alert">
              {supportErrorLabel(safeT, actionError)}
            </p>
          ) : null}
          {/* 최종 점검 U3: 닫는 「확인」은 어디서나 보조(secondary) 모양 · 새 문의 = 허브와 같은 「문의하기」 */}
          {closedView && messages.length > 0 ? (
            <DibayOverlayButton
              roleTone="secondary"
              className={SUPPORT_BTN}
              data-support-ticket-ok="closed_unread"
              onClick={() => {
                // 병합 전 B: 「확인」 = 답변을 확인함 → 기억한 내용을 지운다(그 뒤 옛 푸시로 다시 열면 「종료된 문의예요」 · 계약 §6)
                closedUnreadSeen.delete(caseId);
                (onDone ?? onClose)();
              }}
            >
              {t("support_ticket_ok")}
            </DibayOverlayButton>
          ) : closedView ? (
            <DibayOverlayButton
              roleTone="primary"
              className={`${SUPPORT_BTN} ${supportPrimaryCtaToneClass(ownerTone)}`}
              data-support-ticket-new="1"
              onClick={() => onNewInquiry(fromCase)}
            >
              {t("support_enter_cta")}
            </DibayOverlayButton>
          ) : followUpOpen ? (
            <div className="grid gap-2">
              <textarea
                value={followUpText}
                onChange={(e) => setFollowUpText(e.target.value.slice(0, SUPPORT_TICKET_BODY_MAX))}
                rows={3}
                maxLength={SUPPORT_TICKET_BODY_MAX}
                data-form-keyboard-field="1"
                data-support-ticket-followup="1"
                className="block w-full resize-none rounded-ui-rect border border-[var(--overlay-border)] bg-[var(--overlay-surface)] px-3 py-2.5 text-[14px] leading-relaxed text-[var(--overlay-text-primary)] placeholder:text-[var(--overlay-text-secondary)] focus:border-sam-primary focus:outline-none"
                placeholder={t("support_ticket_body_placeholder")}
              />
              <div className="grid grid-cols-2 gap-2">
                <DibayOverlayButton
                  roleTone="secondary"
                  className={SUPPORT_BTN}
                  data-support-ticket-followup-cancel="1"
                  onClick={() => {
                    setFollowUpText("");
                    setFollowUpOpen(false);
                  }}
                >
                  {t("support_ticket_cancel")}
                </DibayOverlayButton>
                <DibayOverlayButton
                  roleTone="primary"
                  className={`${SUPPORT_BTN} ${supportPrimaryCtaToneClass(ownerTone, {
                    disabled: !followUpText.trim(),
                    loading: busy,
                  })}`}
                  loading={busy}
                  disabled={busy || !followUpText.trim()}
                  aria-label={busyName(busy, t("support_ticket_followup_send"))}
                  data-support-ticket-followup-send="1"
                  onClick={() => void sendFollowUp()}
                >
                  {t("support_ticket_followup_send")}
                </DibayOverlayButton>
              </div>
            </div>
          ) : answered ? (
            <>
              {/* 최종 점검 U5: 「확인했어요」 = 되돌릴 수 없는 종료 — 누르기 전에 한 줄 안내 */}
              <p
                className="mb-2 text-[12px] leading-relaxed text-[var(--overlay-text-secondary)]"
                data-support-ticket-confirm-note="1"
              >
                {t("support_ticket_confirm_note")}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <DibayOverlayButton
                  roleTone="secondary"
                  className={SUPPORT_BTN}
                  data-support-ticket-followup-open="1"
                  onClick={() => setFollowUpOpen(true)}
                >
                  {t("support_ticket_followup_cta")}
                </DibayOverlayButton>
                <DibayOverlayButton
                  roleTone="primary"
                  className={`${SUPPORT_BTN} ${supportPrimaryCtaToneClass(ownerTone, { loading: busy })}`}
                  loading={busy}
                  disabled={busy}
                  aria-label={busyName(busy, t("support_ticket_confirm_cta"))}
                  data-support-ticket-confirm="1"
                  onClick={() => void confirmClose()}
                >
                  {t("support_ticket_confirm_cta")}
                </DibayOverlayButton>
              </div>
            </>
          ) : (
            <DibayOverlayButton roleTone="secondary" className={SUPPORT_BTN} data-support-ticket-ok="waiting" onClick={onDone ?? onClose}>
              {t("support_ticket_ok")}
            </DibayOverlayButton>
          )}
        </Footer>
      ) : null}
    </div>
  );
}
