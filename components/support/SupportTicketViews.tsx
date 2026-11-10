"use client";

/**
 * 고객센터 접수형 문의 화면 (Owner 「접수형 1단계」 2026-11-10).
 * 고객센터 문의 ≠ 채팅 — 말풍선·실시간 대화·「상담사」 표현 없음. 쓰기 → 접수 → 답변 대기 → 답변.
 *
 * 화면 격자(시안 3차 4절): 머리글 48px [48 뒤로 | 제목 1줄 | 48 닫기] · 상단 줄 44px(누가) ·
 * 행 44px [라벨 64px | 값 1줄 | 16] · 하단 버튼 44px 고정. 제목·값은 1줄 + 말줄임.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Check, X } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayOverlayButton, dibayConfirm } from "@/components/ui/dibay-overlay";
import type { MessageKey } from "@/lib/i18n/messages";
import { formatMypageDate } from "@/lib/mypage/format-mypage-date";
import {
  getOwnerLiteStoreServerSnapshot,
  getOwnerLiteStoreSnapshot,
  subscribeOwnerLiteStore,
} from "@/lib/stores/owner-lite-external-store";
import type { SupportCaseRow, SupportMessageRow } from "@/lib/support/support-case-types";
import { getSupportCategoryDefinition, listIssueTypesForCategory } from "@/lib/support/support-category-registry";
import type { SupportContext } from "@/lib/support/support-context";
import { supportErrorLabel, supportReferenceLabel } from "@/lib/support/support-display-labels";
import { supportCaseStatusLabelMeta } from "@/lib/support/support-status-label";
import {
  SUPPORT_TICKET_BODY_MAX,
  applySupportTicketDraft,
  buildSupportTicketOpenPayload,
  canSubmitSupportTicket,
  clearSupportTicketDraft,
  initSupportTicketForm,
  isSupportTicketAnsweredStatus,
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

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

const OWNER_TONE_BG = "bg-[var(--dibay-brown)]";

export function supportTicketCategoryLabel(t: T, categoryId: string | null | undefined): string {
  const def = categoryId ? getSupportCategoryDefinition(categoryId) : null;
  return t((def?.labelKey ?? "support_cat_other") as MessageKey);
}

export function supportTicketIssueLabel(
  t: T,
  categoryId: string | null | undefined,
  issueId: string | null | undefined
): string {
  if (!categoryId || !issueId) return "";
  const issue = listIssueTypesForCategory(categoryId).find((i) => i.id === issueId);
  return t((issue?.labelKey ?? "support_issue_other") as MessageKey);
}

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
        <button
          type="button"
          className="flex h-12 w-12 items-center justify-center text-[var(--overlay-text-primary)]"
          aria-label={t("support_ticket_back_aria")}
          data-support-ticket-back="1"
          onClick={onBack}
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={2} aria-hidden />
        </button>
      ) : (
        <span aria-hidden />
      )}
      <h2
        id={titleId}
        className="truncate text-center text-[16px] font-semibold text-[var(--overlay-text-primary)]"
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

/** 상단 줄 44px — 누가(회원/매장) 또는 상태 */
function TopRow({
  label,
  value,
  tag,
  owner = false,
  right,
}: {
  label: string;
  value: string;
  tag?: string;
  owner?: boolean;
  right?: ReactNode;
}) {
  return (
    <div
      className="grid h-11 shrink-0 grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-2 border-b border-[var(--overlay-border)] bg-[var(--overlay-surface)] px-4"
      data-support-ticket-who={owner ? "OWNER" : "MEMBER"}
    >
      <span className="truncate text-[12px] text-[var(--overlay-text-secondary)]">{label}</span>
      <span className="truncate text-[14px] font-semibold text-[var(--overlay-text-primary)]">{value}</span>
      {right ??
        (tag ? (
          <span
            className={`rounded-ui-rect px-2 py-0.5 text-[11px] font-bold ${
              owner ? `${OWNER_TONE_BG} text-sam-on-primary` : "bg-sam-primary-soft text-sam-primary"
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

/* ───────────── 쓰기 ───────────── */

type ComposeView = "form" | "pick_category" | "pick_issue";

export function SupportTicketCompose({
  context,
  viewerName,
  titleId,
  submitting,
  submitError,
  onClose,
  onSubmit,
}: {
  context: SupportContext;
  viewerName: string;
  titleId: string;
  submitting: boolean;
  submitError: string | null;
  onClose: () => void;
  onSubmit: (state: SupportTicketFormState, draftKey: string) => void;
}) {
  const { t, safeT } = useI18n();
  const ownerStores = useViewerOwnerStores();
  const viewerHasStore = ownerStores.length > 0;
  const [state, setState] = useState<SupportTicketFormState>(() => initSupportTicketForm(context));
  const [view, setView] = useState<ComposeView>("form");
  const draftKey = useMemo(() => supportTicketDraftKey(context), [context]);
  const [draft, setDraft] = useState<SupportTicketDraft | null>(() => readSupportTicketDraft(draftKey));
  const touchedRef = useRef(false);

  // 쓰는 대로 저장 — 이어 쓰기 카드가 떠 있는 동안(아직 고르지 않음)은 저장본을 덮지 않는다.
  //   고객이 「이어 쓰기」 또는 「지우기」를 고른 뒤부터 저장한다(새로 쓰기 시작해도 예전 저장본은 묻지 않고 지우지 않음).
  useEffect(() => {
    if (!touchedRef.current || draft) return;
    const id = window.setTimeout(() => writeSupportTicketDraft(draftKey, state), 300);
    return () => window.clearTimeout(id);
  }, [draftKey, state, draft]);

  const update = useCallback((fn: (s: SupportTicketFormState) => SupportTicketFormState) => {
    touchedRef.current = true;
    setState(fn);
  }, []);

  const isOwner = state.audience === "OWNER";
  const ownerStore = isOwner ? ownerStores.find((s) => s.id === state.storeId) ?? null : null;
  const switchable = !state.categoryLocked && context.audience === "MEMBER" && viewerHasStore;
  const switchStore =
    ownerStores.find((s) => String(s.approval_status) === "approved") ?? ownerStores[0] ?? null;

  const categories = listSupportTicketCategories({ audience: state.audience, viewerHasStore });
  const issues = state.category ? listIssueTypesForCategory(state.category) : [];
  const referenceText = state.referenceType
    ? `${supportReferenceLabel(safeT, state.referenceType)}${
        state.referenceTitle ? ` · ${state.referenceTitle}` : state.referenceId ? ` · ${state.referenceId.slice(0, 8)}` : ""
      }`
    : "";

  const title = isOwner ? t("support_ticket_owner_title") : t("support_ticket_title");

  const whoRow = (
    <TopRow
      label={isOwner ? t("support_ticket_who_owner") : t("support_ticket_who_member")}
      value={isOwner ? ownerStore?.store_name || t("support_ticket_tag_owner") : viewerName}
      tag={isOwner ? t("support_ticket_tag_owner") : t("support_ticket_tag_member")}
      owner={isOwner}
      right={
        switchable && switchStore ? (
          <span className="inline-flex overflow-hidden rounded-ui-rect border border-[var(--overlay-border)] text-[11px] font-bold">
            <button
              type="button"
              data-support-ticket-switch="MEMBER"
              className={`px-2 py-1 ${!isOwner ? "bg-sam-primary text-sam-on-primary" : "text-[var(--overlay-text-secondary)]"}`}
              onClick={() =>
                update((s) =>
                  switchSupportTicketAudience(s, { audience: "MEMBER", sourceSurface: "mypage_customer_center" })
                )
              }
            >
              {t("support_ticket_switch_member")}
            </button>
            <button
              type="button"
              data-support-ticket-switch="OWNER"
              className={`px-2 py-1 ${isOwner ? `${OWNER_TONE_BG} text-sam-on-primary` : "text-[var(--overlay-text-secondary)]"}`}
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
              {t("support_ticket_switch_owner")}
            </button>
          </span>
        ) : undefined
      }
    />
  );

  if (view === "pick_category" || view === "pick_issue") {
    const picking = view === "pick_category";
    const list = picking
      ? categories.map((c) => ({ id: c.id, label: supportTicketCategoryLabel(t, c.id), on: c.id === state.category }))
      : issues.map((i) => ({
          id: i.id,
          label: supportTicketIssueLabel(t, state.category, i.id),
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
                  supportTicketCategoryLabel(t, draft.category),
                  supportTicketIssueLabel(t, draft.category, draft.issueType),
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
                className="w-full !min-h-11"
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
                className="w-full !min-h-11"
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

        <SectionLabel>{draft ? t("support_ticket_new_section") : t("support_ticket_section_what")}</SectionLabel>
        <Group>
          <FieldRow
            label={t("support_ticket_field_category")}
            value={state.category ? supportTicketCategoryLabel(t, state.category) : ""}
            placeholder={t("support_ticket_pick_placeholder")}
            onClick={state.categoryLocked ? undefined : () => setView("pick_category")}
            testId="support-ticket-field-category"
          />
          <FieldRow
            label={t("support_ticket_field_issue")}
            value={supportTicketIssueLabel(t, state.category, state.issueType)}
            placeholder={t("support_ticket_pick_placeholder")}
            onClick={state.category ? () => setView("pick_issue") : undefined}
            testId="support-ticket-field-issue"
          />
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
        <DibayOverlayButton
          roleTone="primary"
          className={`w-full !min-h-11 ${isOwner ? "!bg-[var(--dibay-brown)]" : ""}`}
          loading={submitting}
          disabled={!canSubmit}
          data-support-ticket-submit="1"
          onClick={() => {
            if (!buildSupportTicketOpenPayload(state)) return;
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
          {t("support_ticket_submitted_heading")}
        </p>
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
          <DibayOverlayButton roleTone="secondary" className="w-full !min-h-11" onClick={onViewMine} data-support-ticket-view-mine="1">
            {t("support_ticket_view_mine")}
          </DibayOverlayButton>
          <DibayOverlayButton roleTone="primary" className="w-full !min-h-11" onClick={onClose}>
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
          <DibayOverlayButton roleTone="secondary" className="w-full !min-h-11" onClick={onSignup} data-support-ticket-signup="1">
            {t("support_ticket_signup_cta")}
          </DibayOverlayButton>
          <DibayOverlayButton roleTone="primary" className="w-full !min-h-11" onClick={onLogin} data-support-ticket-login="1">
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
}: {
  label: string;
  at: string;
  body: string;
  answer?: boolean;
  deleted?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between gap-2 px-4 pb-1.5">
        <span className="truncate text-[12px] font-semibold text-[var(--overlay-text-secondary)]">{label}</span>
        <span className="shrink-0 text-[11px] text-[var(--overlay-text-secondary)]">{at}</span>
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

export function SupportTicketDetail({
  caseId,
  titleId,
  onClose,
  onClosedByRequester,
  onNewInquiry,
  onUnauthorized,
}: {
  caseId: string;
  titleId: string;
  onClose: () => void;
  onClosedByRequester: () => void;
  onNewInquiry: (fromCase: { audience: "MEMBER" | "OWNER"; ownerStoreId: string | null } | null) => void;
  onUnauthorized: () => void;
}) {
  const { t, safeT } = useI18n();
  const [supportCase, setSupportCase] = useState<SupportCaseRow | null>(null);
  const [messages, setMessages] = useState<SupportMessageRow[]>([]);
  const [closedView, setClosedView] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [followUp, setFollowUp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
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
      if (res.status === 401) {
        onUnauthorized();
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
      setClosedView(json.closed === true || isSupportTicketClosedStatus(json.case.status));
      setMessages((json.messages ?? []).filter((m) => m.sender_type !== "SYSTEM"));
    } catch {
      setError("network_error");
    } finally {
      setLoading(false);
    }
  }, [caseId, onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  const fromCase = supportCase
    ? { audience: supportCase.audience, ownerStoreId: supportCase.owner_store_id }
    : null;

  const sendFollowUp = async () => {
    const body = (followUp ?? "").trim();
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
        setActionError(json.error ?? "send_failed");
        if (json.error === "case_closed") void load();
        return;
      }
      setFollowUp(null);
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
        body: JSON.stringify({ action: "close" }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setActionError(json.error ?? "update_failed");
        return;
      }
      onClosedByRequester();
    } catch {
      setActionError("network_error");
    } finally {
      setBusy(false);
    }
  };

  const categoryLabel = supportCase ? supportTicketCategoryLabel(t, supportCase.category) : "";
  const headerTitle = supportCase
    ? [supportCase.public_case_no, categoryLabel].filter(Boolean).join(" · ")
    : t("support_ticket_title");
  const statusText = supportCase ? t(supportCaseStatusLabelMeta(supportCase.status).key) : "";
  const answered = isSupportTicketAnsweredStatus(supportCase?.status);
  const lastAt = supportCase ? formatMypageDate(supportCase.last_message_at, { style: "datetime" }) : "";

  let requesterSeen = 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-sam-app" data-support-ticket-view="detail">
      <SupportTicketHeader titleId={titleId} title={headerTitle} onClose={onClose} />
      {supportCase && !closedView ? (
        <TopRow
          label={t("support_ticket_status_label")}
          value={lastAt}
          tag={statusText}
          owner={supportCase.audience === "OWNER"}
        />
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-3" data-support-message-list="1">
        {loading ? (
          <div className="grid gap-3 px-4" data-support-modal-loading="1">
            <div className="h-4 w-1/3 animate-pulse rounded-ui-rect bg-[var(--overlay-secondary)]" />
            <div className="h-20 w-full animate-pulse rounded-ui-rect bg-[var(--overlay-secondary)]" />
            <div className="h-20 w-full animate-pulse rounded-ui-rect bg-[var(--overlay-secondary)]" />
          </div>
        ) : error ? (
          <div className="mx-4 rounded-ui-rect border border-[var(--overlay-border)] bg-[var(--overlay-surface)] p-4 text-[14px] text-[var(--overlay-danger)]">
            {error === "forbidden" ? t("support_case_unavailable") : supportErrorLabel(safeT, error)}
            {error !== "forbidden" ? (
              <DibayOverlayButton roleTone="secondary" className="mt-3 w-full" onClick={() => void load()}>
                {t("common_retry")}
              </DibayOverlayButton>
            ) : null}
          </div>
        ) : closedView ? (
          <div className="flex flex-col items-center gap-2 px-6 pt-16 text-center" data-support-ticket-closed="1">
            <p className="text-[17px] font-semibold text-[var(--overlay-text-primary)]">{t("support_ticket_closed_title")}</p>
            <p className="text-[13px] leading-relaxed text-[var(--overlay-text-secondary)]">{t("support_ticket_closed_hint")}</p>
          </div>
        ) : (
          messages.map((m) => {
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
                body={m.body}
                answer={!fromRequester}
                deleted={Boolean(m.deleted_at)}
              />
            );
          })
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
          {closedView ? (
            <DibayOverlayButton roleTone="primary" className="w-full !min-h-11" onClick={() => onNewInquiry(fromCase)}>
              {t("support_ticket_new_cta")}
            </DibayOverlayButton>
          ) : followUp !== null ? (
            <div className="grid gap-2">
              <textarea
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value.slice(0, SUPPORT_TICKET_BODY_MAX))}
                rows={3}
                maxLength={SUPPORT_TICKET_BODY_MAX}
                data-form-keyboard-field="1"
                data-support-ticket-followup="1"
                className="block w-full resize-none rounded-ui-rect border border-[var(--overlay-border)] bg-[var(--overlay-surface)] px-3 py-2.5 text-[14px] leading-relaxed text-[var(--overlay-text-primary)] placeholder:text-[var(--overlay-text-secondary)] focus:border-sam-primary focus:outline-none"
                placeholder={t("support_ticket_body_placeholder")}
              />
              <div className="grid grid-cols-2 gap-2">
                <DibayOverlayButton roleTone="secondary" className="w-full !min-h-11" onClick={() => setFollowUp(null)}>
                  {t("support_ticket_cancel")}
                </DibayOverlayButton>
                <DibayOverlayButton
                  roleTone="primary"
                  className="w-full !min-h-11"
                  loading={busy}
                  disabled={busy || !followUp.trim()}
                  onClick={() => void sendFollowUp()}
                >
                  {t("support_ticket_followup_send")}
                </DibayOverlayButton>
              </div>
            </div>
          ) : answered ? (
            <div className="grid grid-cols-2 gap-2">
              <DibayOverlayButton
                roleTone="secondary"
                className="w-full !min-h-11"
                data-support-ticket-followup-open="1"
                onClick={() => setFollowUp("")}
              >
                {t("support_ticket_followup_cta")}
              </DibayOverlayButton>
              <DibayOverlayButton
                roleTone="primary"
                className="w-full !min-h-11"
                loading={busy}
                disabled={busy}
                data-support-ticket-confirm="1"
                onClick={() => void confirmClose()}
              >
                {t("support_ticket_confirm_cta")}
              </DibayOverlayButton>
            </div>
          ) : (
            <DibayOverlayButton roleTone="secondary" className="w-full !min-h-11" onClick={onClose}>
              {t("support_ticket_ok")}
            </DibayOverlayButton>
          )}
        </Footer>
      ) : null}
    </div>
  );
}
