"use client";

import {
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayOverlayButton } from "@/components/ui/dibay-overlay";
import type { MessageKey } from "@/lib/i18n/messages";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import {
  getSupportCategoryDefinition,
  listIssueTypesForCategory,
  listSelectableSupportCategories,
} from "@/lib/support/support-category-registry";
import type { SupportContext } from "@/lib/support/support-context";
import {
  validateSupportGuidanceCta,
  type SupportGuidanceEntryRow,
} from "@/lib/support/support-guidance-authority";
import {
  buildShortTriageSeed,
  buildTriageOpenContext,
  initSupportTriageFromContext,
  supportTriageReducer,
  type SupportTriageState,
} from "@/lib/support/support-triage-model";

function labelForCategory(
  safeT: (key: MessageKey, opts: { fallbackKo: string; fallbackEn: string }) => string,
  categoryId: string
): string {
  const def = getSupportCategoryDefinition(categoryId);
  return safeT((def?.labelKey ?? "support_cat_other") as MessageKey, {
    fallbackKo: "문의 유형",
    fallbackEn: "Category",
  });
}

function labelForIssue(
  safeT: (key: MessageKey, opts: { fallbackKo: string; fallbackEn: string }) => string,
  categoryId: string,
  issueId: string
): string {
  const issue = listIssueTypesForCategory(categoryId).find((i) => i.id === issueId);
  return safeT((issue?.labelKey ?? "support_issue_other") as MessageKey, {
    fallbackKo: "문의 세부 유형",
    fallbackEn: "Issue type",
  });
}

function TriageListButton({
  children,
  onClick,
  testId,
}: {
  children: ReactNode;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      className="w-full rounded-ui-rect border border-[var(--overlay-border)] bg-[var(--overlay-surface)] px-3 py-3 text-left text-[14px] font-medium text-[var(--overlay-text)] active:bg-[var(--overlay-secondary)]"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function SupportTriageFlow({
  context,
  openingCase,
  startError,
  onClose: _onClose,
  onResolvedWithoutCase,
  onCreateCase,
}: {
  context: SupportContext;
  openingCase: boolean;
  startError: string | null;
  onClose: () => void;
  onResolvedWithoutCase: () => void;
  onCreateCase: (payload: {
    context: SupportContext;
    issueType: string;
    initialSummary: string;
    guidanceKey?: string;
    guidanceRevision?: number;
    guidanceOutcome?: string;
    explicitOtherSelection?: boolean;
    initialBody: string;
  }) => void;
}) {
  const { safeT } = useI18n();
  const [state, dispatch] = useReducer(
    supportTriageReducer,
    context,
    initSupportTriageFromContext
  );
  const [guidanceLoading, setGuidanceLoading] = useState(false);
  const [guidanceError, setGuidanceError] = useState<string | null>(null);

  const categories = useMemo(
    () => listSelectableSupportCategories(state.audience),
    [state.audience]
  );
  const issues = useMemo(
    () => (state.category ? listIssueTypesForCategory(state.category) : []),
    [state.category]
  );

  useEffect(() => {
    if (state.step !== "GUIDANCE" || !state.category || !state.issueType) return;
    if (state.guidance || state.guidanceEmpty) return;
    let cancelled = false;
    setGuidanceLoading(true);
    setGuidanceError(null);
    void (async () => {
      try {
        const qs = new URLSearchParams({
          audience: state.audience,
          category: state.category!,
          issueType: state.issueType!,
        });
        const res = await fetch(`/api/support/guidance?${qs.toString()}`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json()) as {
          ok?: boolean;
          entries?: SupportGuidanceEntryRow[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          // Empty table / missing → handoff without fabricated advice
          dispatch({ type: "GUIDANCE_LOADED", entry: null });
          return;
        }
        const entry = Array.isArray(json.entries) && json.entries[0] ? json.entries[0] : null;
        dispatch({ type: "GUIDANCE_LOADED", entry });
      } catch {
        if (!cancelled) {
          setGuidanceError("network_error");
          dispatch({ type: "GUIDANCE_LOADED", entry: null });
        }
      } finally {
        if (!cancelled) setGuidanceLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    state.step,
    state.category,
    state.issueType,
    state.guidance,
    state.guidanceEmpty,
    state.audience,
  ]);

  const statusLine = (() => {
    if (state.step === "START_CATEGORY") {
      return safeT("support_enter_greeting", {
        fallbackKo: "무엇을 도와드릴까요?",
        fallbackEn: "How can we help?",
      });
    }
    if (state.category) {
      const cat = labelForCategory(safeT, state.category);
      if (state.issueType) {
        return `${cat} · ${labelForIssue(safeT, state.category, state.issueType)}`;
      }
      return cat;
    }
    return null;
  })();

  const canBack =
    state.step === "START_ISSUE"
      ? !state.categoryLocked
      : state.step === "GUIDANCE" || state.step === "HANDOFF_SUMMARY";

  const submitHandoff = () => {
    if (!state.category || !state.issueType) return;
    const summary = state.initialSummary.trim();
    if (!summary) return;
    const openCtx = buildTriageOpenContext(state);
    onCreateCase({
      context: openCtx,
      issueType: state.issueType,
      initialSummary: summary,
      guidanceKey: state.guidance?.id,
      guidanceRevision: state.guidance?.revision,
      guidanceOutcome: state.guidanceOutcome ?? undefined,
      explicitOtherSelection: state.explicitOtherSelection || undefined,
      initialBody: buildShortTriageSeed(state.category, state.issueType),
    });
  };

  const ctaValidated = state.guidance
    ? validateSupportGuidanceCta(state.guidance.cta_kind, state.guidance.cta_target)
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-support-triage-step={state.step}>
      {statusLine ? (
        <p className="mb-2 shrink-0 text-[13px] font-medium text-[var(--overlay-text-secondary)]">
          {statusLine}
        </p>
      ) : null}

      {canBack ? (
        <button
          type="button"
          className="mb-2 shrink-0 self-start text-[13px] font-medium text-[var(--overlay-text-secondary)] underline"
          data-support-triage-back="1"
          onClick={() => dispatch({ type: "BACK" })}
        >
          {safeT("support_triage_back", {
            fallbackKo: "뒤로",
            fallbackEn: "Back",
          })}
        </button>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {state.step === "START_CATEGORY" ? (
          <div className="grid gap-2" data-support-triage-categories="1">
            <p className={OverlayUi.body}>
              {safeT("support_enter_greeting", {
                fallbackKo: "무엇을 도와드릴까요?",
                fallbackEn: "How can we help?",
              })}
            </p>
            {categories.map((c) => (
              <TriageListButton
                key={c.id}
                testId={`support-triage-cat-${c.id}`}
                onClick={() => dispatch({ type: "SELECT_CATEGORY", categoryId: c.id })}
              >
                {labelForCategory(safeT, c.id)}
              </TriageListButton>
            ))}
          </div>
        ) : null}

        {state.step === "START_ISSUE" && state.category ? (
          <div className="grid gap-2" data-support-triage-issues="1">
            {state.categoryLocked ? (
              <div className="mb-1 rounded-ui-rect border border-[var(--overlay-border)] px-3 py-2 text-[13px] text-[var(--overlay-text-secondary)]">
                <div>
                  {safeT("support_triage_field_category", {
                    fallbackKo: "문의 분야",
                    fallbackEn: "Category",
                  })}
                  {": "}
                  {labelForCategory(safeT, state.category)}
                </div>
                {state.referenceType ? (
                  <div className="mt-1">
                    {safeT("support_triage_field_reference", {
                      fallbackKo: "관련 항목",
                      fallbackEn: "Related item",
                    })}
                    {": "}
                    {state.referenceType}
                    {state.referenceId ? ` · ${state.referenceId.slice(0, 8)}…` : ""}
                  </div>
                ) : null}
                <button
                  type="button"
                  className="mt-2 text-[12px] font-medium underline"
                  data-support-triage-switch-generic="1"
                  onClick={() => dispatch({ type: "SWITCH_TO_GENERIC" })}
                >
                  {safeT("support_triage_other_problem", {
                    fallbackKo: "다른 문제 문의",
                    fallbackEn: "Ask about something else",
                  })}
                </button>
              </div>
            ) : null}
            <p className={OverlayUi.bodySecondary}>
              {safeT("support_triage_choose_issue", {
                fallbackKo: "세부 유형을 선택해 주세요.",
                fallbackEn: "Choose a more specific issue.",
              })}
            </p>
            {issues.map((issue) => (
              <TriageListButton
                key={issue.id}
                testId={`support-triage-issue-${issue.id}`}
                onClick={() => dispatch({ type: "SELECT_ISSUE", issueType: issue.id })}
              >
                {labelForIssue(safeT, state.category!, issue.id)}
              </TriageListButton>
            ))}
          </div>
        ) : null}

        {state.step === "GUIDANCE" ? (
          <div className="grid gap-3" data-support-triage-guidance="1">
            {guidanceLoading ? (
              <p className={OverlayUi.bodySecondary}>
                {safeT("support_triage_guidance_loading", {
                  fallbackKo: "안내를 불러오는 중…",
                  fallbackEn: "Loading guidance…",
                })}
              </p>
            ) : null}
            {state.guidance ? (
              <>
                <h3 className="text-[16px] font-semibold text-[var(--overlay-text)]">
                  {state.guidance.title}
                </h3>
                <p className={`${OverlayUi.body} whitespace-pre-wrap`}>{state.guidance.body}</p>
                {ctaValidated?.ok &&
                ctaValidated.kind === "INTERNAL_ROUTE" &&
                ctaValidated.target ? (
                  <a
                    href={ctaValidated.target}
                    className="text-[13px] font-medium text-[var(--overlay-brand)] underline"
                    data-support-guidance-cta="1"
                  >
                    {safeT("support_triage_guidance_cta", {
                      fallbackKo: "관련 화면 열기",
                      fallbackEn: "Open related screen",
                    })}
                  </a>
                ) : null}
                <div className="grid gap-2 pt-1">
                  <DibayOverlayButton
                    roleTone="secondary"
                    className="w-full !min-h-11"
                    data-support-guidance-resolved="1"
                    onClick={() => {
                      dispatch({ type: "GUIDANCE_RESOLVED" });
                      onResolvedWithoutCase();
                    }}
                  >
                    {safeT("support_triage_resolved", {
                      fallbackKo: "해결됐어요",
                      fallbackEn: "That solved it",
                    })}
                  </DibayOverlayButton>
                  <DibayOverlayButton
                    roleTone="primary"
                    className="w-full !min-h-11"
                    data-support-guidance-escalate="1"
                    onClick={() => dispatch({ type: "GUIDANCE_ESCALATE" })}
                  >
                    {safeT("support_triage_ask_human", {
                      fallbackKo: "상담사에게 문의",
                      fallbackEn: "Talk to support",
                    })}
                  </DibayOverlayButton>
                </div>
              </>
            ) : null}
            {guidanceError ? (
              <p className={`${OverlayUi.caption} text-red-600`}>{guidanceError}</p>
            ) : null}
          </div>
        ) : null}

        {state.step === "HANDOFF_SUMMARY" ? (
          <HandoffSummary
            state={state}
            openingCase={openingCase}
            startError={startError}
            onSummaryChange={(value) => dispatch({ type: "SET_SUMMARY", value })}
            onSubmit={submitHandoff}
            labelCategory={state.category ? labelForCategory(safeT, state.category) : ""}
            labelIssue={
              state.category && state.issueType
                ? labelForIssue(safeT, state.category, state.issueType)
                : ""
            }
          />
        ) : null}
      </div>

      {state.step === "GUIDANCE" && state.guidanceEmpty && !guidanceLoading ? (
        <div className="shrink-0 space-y-2 border-t border-[var(--overlay-border)] pt-2">
          <p className={OverlayUi.body}>
            {safeT("support_triage_ask_human_prompt", {
              fallbackKo: "상담사에게 문의하시겠어요?",
              fallbackEn: "Would you like to talk to support?",
            })}
          </p>
          <DibayOverlayButton
            roleTone="primary"
            className="w-full !min-h-11"
            data-support-guidance-escalate="1"
            onClick={() => dispatch({ type: "GUIDANCE_ESCALATE" })}
          >
            {safeT("support_triage_ask_human", {
              fallbackKo: "상담사에게 문의",
              fallbackEn: "Talk to support",
            })}
          </DibayOverlayButton>
        </div>
      ) : null}
    </div>
  );
}

function HandoffSummary({
  state,
  openingCase,
  startError,
  onSummaryChange,
  onSubmit,
  labelCategory,
  labelIssue,
}: {
  state: SupportTriageState;
  openingCase: boolean;
  startError: string | null;
  onSummaryChange: (value: string) => void;
  onSubmit: () => void;
  labelCategory: string;
  labelIssue: string;
}) {
  const { safeT } = useI18n();
  const summaryOk = state.initialSummary.trim().length > 0;

  return (
    <div className="grid gap-3" data-support-triage-handoff="1">
      <div className="rounded-ui-rect border border-[var(--overlay-border)] px-3 py-2 text-[13px] text-[var(--overlay-text-secondary)]">
        <div>
          {safeT("support_triage_field_category", {
            fallbackKo: "문의 분야",
            fallbackEn: "Category",
          })}
          {": "}
          <span className="text-[var(--overlay-text)]">{labelCategory}</span>
        </div>
        <div className="mt-1">
          {safeT("support_triage_field_issue", {
            fallbackKo: "문의 유형",
            fallbackEn: "Issue",
          })}
          {": "}
          <span className="text-[var(--overlay-text)]">{labelIssue}</span>
        </div>
        {state.referenceType ? (
          <div className="mt-1">
            {safeT("support_triage_field_reference", {
              fallbackKo: "관련 항목",
              fallbackEn: "Related item",
            })}
            {": "}
            <span className="text-[var(--overlay-text)]">
              {state.referenceType}
              {state.referenceId ? ` · ${state.referenceId.slice(0, 8)}…` : ""}
            </span>
          </div>
        ) : null}
      </div>

      <label className="grid gap-1">
        <span className="text-[13px] font-medium text-[var(--overlay-text)]">
          {safeT("support_triage_field_summary", {
            fallbackKo: "문의 내용",
            fallbackEn: "Details",
          })}
        </span>
        <textarea
          value={state.initialSummary}
          onChange={(e) => onSummaryChange(e.target.value)}
          rows={4}
          data-form-keyboard-field="1"
          data-support-triage-summary="1"
          className={`${OverlayUi.input} min-h-[6rem] resize-none`}
          placeholder={safeT("support_triage_summary_placeholder", {
            fallbackKo: "상황을 짧게 적어 주세요.",
            fallbackEn: "Briefly describe what happened.",
          })}
        />
      </label>

      {startError ? (
        <p className={`${OverlayUi.caption} text-red-600`}>{startError}</p>
      ) : null}

      <DibayOverlayButton
        roleTone="primary"
        className="w-full !min-h-11"
        loading={openingCase}
        disabled={openingCase || !summaryOk}
        data-support-triage-create="1"
        onClick={onSubmit}
      >
        {safeT("support_triage_ask_human", {
          fallbackKo: "상담사에게 문의",
          fallbackEn: "Talk to support",
        })}
      </DibayOverlayButton>
    </div>
  );
}
