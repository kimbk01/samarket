"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { SupportSheetShell } from "@/components/support/SupportSheetShell";
import { SupportTriageFlow } from "@/components/support/SupportTriageFlow";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { SupportContext } from "@/lib/support/support-context";
import { buildGenericSupportTriageContext, isSupportContextEnabled } from "@/lib/support/support-context";
import { deliverSupportOpen } from "@/lib/support/deliver-support-open";
import {
  clearPendingSupportContext,
  consumeSupportModalRestoreCaseId,
  readPendingSupportContext,
} from "@/lib/support/open-support-center";
import {
  closeSupportModal,
  getSupportModalState,
  resetSupportModalToStart,
  setSupportModalCaseId,
  subscribeSupportModalState,
  type SupportModalState,
} from "@/lib/support/support-modal-controller";
import { useSupportModalMainBottomNavSuppress } from "@/lib/support/support-modal-main-bottom-nav-suppress";
import type { SupportCaseRow, SupportMessageRow } from "@/lib/support/support-case-types";

const HISTORY_KEY = "dibaySupportModal";

function sameSupportMessages(
  prev: SupportMessageRow[],
  next: SupportMessageRow[]
): boolean {
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i += 1) {
    const a = prev[i];
    const b = next[i];
    if (!a || !b || a.id !== b.id || a.body !== b.body || a.created_at !== b.created_at) {
      return false;
    }
  }
  return true;
}

function mergeSupportMessage(
  prev: SupportMessageRow[],
  message: SupportMessageRow
): SupportMessageRow[] {
  if (prev.some((m) => m.id === message.id)) return prev;
  return [...prev, message];
}

function statusLabelMeta(status: SupportCaseRow["status"] | null): {
  key: "support_status_active" | "support_status_resolved" | "support_status_waiting_admin";
  fallbackKo: string;
  fallbackEn: string;
} {
  if (!status) {
    return { key: "support_status_active", fallbackKo: "상담 중", fallbackEn: "In progress" };
  }
  if (status === "RESOLVED" || status === "ARCHIVED") {
    return { key: "support_status_resolved", fallbackKo: "상담 종료", fallbackEn: "Closed" };
  }
  if (status === "WAITING_ADMIN" || status === "OPEN") {
    return {
      key: "support_status_waiting_admin",
      fallbackKo: "답변 대기",
      fallbackEn: "Awaiting reply",
    };
  }
  return { key: "support_status_active", fallbackKo: "상담 중", fallbackEn: "In progress" };
}

function SupportSheetChrome({
  titleId,
  title,
  statusText,
  onClose,
  closeLabel,
  subContext,
  children,
}: {
  titleId: string;
  title: string;
  statusText?: string | null;
  onClose: () => void;
  closeLabel: string;
  subContext?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex shrink-0 items-start gap-2">
        <div className="min-w-0 flex-1 pr-1">
          <h2
            id={titleId}
            className={`${OverlayUi.title} ${OverlayUi.titleSheet} !mb-1 !text-left break-keep`}
          >
            {title}
          </h2>
          {statusText ? (
            <span className="inline-flex rounded-full bg-[var(--overlay-secondary)] px-2.5 py-0.5 text-[12px] font-medium text-[var(--overlay-text-secondary)]">
              {statusText}
            </span>
          ) : null}
          {subContext}
        </div>
        <button
          type="button"
          data-support-modal-close="1"
          className={`${OverlayUi.btn.text} !h-11 !w-11 !min-h-11 !min-w-11 !max-w-11 !flex-none !px-0 !py-0 shrink-0`}
          aria-label={closeLabel}
          onClick={onClose}
        >
          <X className="mx-auto h-5 w-5" strokeWidth={2} aria-hidden />
        </button>
      </div>
      {children}
    </div>
  );
}

function ContextChips({ context }: { context: SupportContext }) {
  const { safeT } = useI18n();
  if (!context.category || context.needsCategorySelection) return null;
  const defLabel = safeT("support_enter_category_label", {
    fallbackKo: "문의 유형",
    fallbackEn: "Category",
  });
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <span className="rounded-ui-rect border border-[var(--overlay-border)] px-2 py-0.5 text-[12px] text-[var(--overlay-text-secondary)]">
        {defLabel}
      </span>
      {context.audience === "OWNER" && context.storeId ? (
        <span className="rounded-ui-rect border border-[var(--overlay-border)] px-2 py-0.5 text-[12px] text-[var(--overlay-text-secondary)]">
          Store
        </span>
      ) : null}
      {context.referenceType ? (
        <span className="rounded-ui-rect border border-[var(--overlay-border)] px-2 py-0.5 text-[12px] text-[var(--overlay-text-secondary)]">
          {safeT("support_triage_field_reference", {
            fallbackKo: "관련 항목",
            fallbackEn: "Related item",
          })}
        </span>
      ) : null}
    </div>
  );
}

function SupportActiveConversation({
  caseId,
  titleId,
  title,
  closeLabel,
  onClose,
  onRequestNewInquiry,
  onDismissibleChange,
}: {
  caseId: string;
  titleId: string;
  title: string;
  closeLabel: string;
  onClose: () => void;
  onRequestNewInquiry: () => void;
  onDismissibleChange: (dismissible: boolean) => void;
}) {
  const { safeT } = useI18n();
  const [supportCase, setSupportCase] = useState<SupportCaseRow | null>(null);
  const [messages, setMessages] = useState<SupportMessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );
  const listRef = useRef<HTMLDivElement | null>(null);
  const hasLoadedOnceRef = useRef(false);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent === true && hasLoadedOnceRef.current;
      if (!silent) setLoading(true);
      if (!silent) setError(null);
      try {
        const fetchCase = () =>
          fetch(`/api/support/cases/${encodeURIComponent(caseId)}`, {
            credentials: "include",
          });
        let res = await fetchCase();
        if (res.status === 401) {
          const { ensureSessionHealthy } = await import("@/lib/auth/dibay-session-manager");
          await ensureSessionHealthy("support_modal_case_load");
          res = await fetchCase();
        }
        const json = (await res.json()) as {
          ok?: boolean;
          case?: SupportCaseRow;
          messages?: SupportMessageRow[];
          error?: string;
        };
        if (!res.ok || !json.ok || !json.case) {
          setError(
            res.status === 401
              ? "unauthorized"
              : res.status === 403 || res.status === 404
                ? "forbidden"
                : (json.error ?? "load_failed")
          );
          if (!silent) {
            setSupportCase(null);
            setMessages([]);
          }
          onDismissibleChange(true);
          return;
        }
        setSupportCase(json.case);
        const nextMessages = json.messages ?? [];
        setMessages((prev) =>
          silent && sameSupportMessages(prev, nextMessages) ? prev : nextMessages
        );
        hasLoadedOnceRef.current = true;
        const closed =
          json.case.status === "RESOLVED" || json.case.status === "ARCHIVED";
        onDismissibleChange(closed);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [caseId, onDismissibleChange]
  );

  useEffect(() => {
    hasLoadedOnceRef.current = false;
    void load();
  }, [load]);

  useEffect(() => {
    const onOff = () => setOffline(true);
    const onOn = () => setOffline(false);
    window.addEventListener("offline", onOff);
    window.addEventListener("online", onOn);
    return () => {
      window.removeEventListener("offline", onOff);
      window.removeEventListener("online", onOn);
    };
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return;
    const channel = sb
      .channel(`support-modal-case-${caseId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `case_id=eq.${caseId}`,
        },
        () => {
          void load({ silent: true });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "support_cases",
          filter: `id=eq.${caseId}`,
        },
        () => {
          void load({ silent: true });
        }
      )
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [caseId, load]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending || offline) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/support/cases/${encodeURIComponent(caseId)}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        message?: SupportMessageRow;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "send_failed");
        return;
      }
      setDraft("");
      if (json.message) {
        setMessages((prev) => mergeSupportMessage(prev, json.message!));
      } else {
        await load({ silent: true });
      }
    } catch {
      setError("network_error");
    } finally {
      setSending(false);
    }
  };

  const closed =
    supportCase?.status === "RESOLVED" || supportCase?.status === "ARCHIVED";
  const statusMeta = statusLabelMeta(supportCase?.status ?? null);
  const statusLabel = safeT(statusMeta.key, {
    fallbackKo: statusMeta.fallbackKo,
    fallbackEn: statusMeta.fallbackEn,
  });
  const statusText = supportCase?.public_case_no
    ? `${supportCase.public_case_no} · ${statusLabel}`
    : statusLabel;

  return (
    <SupportSheetChrome
      titleId={titleId}
      title={title}
      statusText={statusText}
      onClose={onClose}
      closeLabel={closeLabel}
    >
      {loading ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3" data-support-modal-loading="1">
          <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--overlay-secondary)]" />
          <div className="h-16 w-full animate-pulse rounded-ui-rect bg-[var(--overlay-secondary)]" />
          <div className="h-16 w-[70%] self-end animate-pulse rounded-ui-rect bg-[var(--overlay-secondary)]" />
        </div>
      ) : error && messages.length === 0 ? (
        <div className="rounded-ui-rect border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error === "unauthorized"
            ? safeT("support_case_auth_required", {
                fallbackKo: "로그인이 필요합니다.",
                fallbackEn: "Please sign in to view this case.",
              })
            : error === "forbidden"
              ? safeT("support_case_unavailable", {
                  fallbackKo: "이 문의를 열 수 없습니다.",
                  fallbackEn: "This support case is unavailable.",
                })
              : error}
          {error !== "forbidden" ? (
            <DibayOverlayButton
              roleTone="secondary"
              className="mt-3 w-full"
              onClick={() => void load()}
            >
              {safeT("common_retry", { fallbackKo: "다시 시도", fallbackEn: "Retry" })}
            </DibayOverlayButton>
          ) : null}
        </div>
      ) : (
        <div
          ref={listRef}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain"
          data-support-message-list="1"
        >
          {messages.map((m) => {
            const mine = m.sender_type === "MEMBER" || m.sender_type === "OWNER";
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-ui-rect px-3 py-2 text-[14px] leading-relaxed ${
                    mine
                      ? "bg-[var(--overlay-primary)] text-white"
                      : "bg-[var(--overlay-secondary)] text-[var(--overlay-text-primary)]"
                  }`}
                >
                  {!mine ? (
                    <p className="mb-1 text-[11px] font-semibold text-[var(--overlay-text-secondary)]">
                      {safeT("support_agent_identity", {
                        fallbackKo: "DIBAY 고객센터",
                        fallbackEn: "DIBAY Support",
                      })}
                    </p>
                  ) : null}
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p
                    className={`mt-1 text-[11px] ${
                      mine ? "text-white/80" : "text-[var(--overlay-text-secondary)]"
                    }`}
                  >
                    {new Date(m.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="shrink-0 pt-2" data-form-keyboard-footer="1" data-support-composer="1">
        {closed ? (
          <div className="space-y-2">
            <p className={`${OverlayUi.bodySecondary} !mb-0`}>
              {safeT("support_case_closed_hint", {
                fallbackKo: "이 문의는 종료되었습니다.",
                fallbackEn: "This case is closed.",
              })}
            </p>
            <DibayOverlayButton
              roleTone="primary"
              className="w-full !min-h-11"
              onClick={onRequestNewInquiry}
            >
              {safeT("support_new_inquiry_cta", {
                fallbackKo: "새 문의하기",
                fallbackEn: "New inquiry",
              })}
            </DibayOverlayButton>
          </div>
        ) : (
          <div className="space-y-1.5">
            {offline ? (
              <p className={`${OverlayUi.caption} !mb-0 text-amber-700`}>
                {safeT("support_offline_hint", {
                  fallbackKo: "오프라인입니다. 연결 후 다시 시도해 주세요.",
                  fallbackEn: "You are offline. Retry when connected.",
                })}
              </p>
            ) : null}
            {error ? (
              <p className={`${OverlayUi.caption} !mb-0 text-red-600`}>{error}</p>
            ) : null}
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={1}
                data-form-keyboard-field="1"
                disabled={sending || offline}
                className={`${OverlayUi.input} min-h-11 flex-1 resize-none !py-2.5`}
                placeholder={safeT("support_message_placeholder", {
                  fallbackKo: "메시지를 입력하세요",
                  fallbackEn: "Type your message",
                })}
              />
              <DibayOverlayButton
                roleTone="primary"
                className="!h-10 !w-10 !min-h-10 !min-w-10 !max-w-10 shrink-0 !rounded-full !px-0"
                disabled={sending || offline || !draft.trim()}
                loading={sending}
                onClick={() => void send()}
                aria-label={safeT("support_send_cta", {
                  fallbackKo: "전송",
                  fallbackEn: "Send",
                })}
              >
                {safeT("support_send_cta", {
                  fallbackKo: "전송",
                  fallbackEn: "Send",
                })}
              </DibayOverlayButton>
            </div>
          </div>
        )}
      </div>
    </SupportSheetChrome>
  );
}

function SupportStartBody({
  titleId,
  title,
  closeLabel,
  context,
  openingCase,
  startError,
  onClose,
  onCreateCase,
  onResolvedWithoutCase,
}: {
  titleId: string;
  title: string;
  closeLabel: string;
  context: SupportContext | null;
  openingCase: boolean;
  startError: string | null;
  onClose: () => void;
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
  onResolvedWithoutCase: () => void;
}) {
  const { safeT } = useI18n();
  return (
    <SupportSheetChrome
      titleId={titleId}
      title={title}
      statusText={safeT("support_enter_greeting", {
        fallbackKo: "무엇을 도와드릴까요?",
        fallbackEn: "How can we help?",
      })}
      onClose={onClose}
      closeLabel={closeLabel}
      subContext={context ? <ContextChips context={context} /> : null}
    >
      {context && isSupportContextEnabled(context) ? (
        <SupportTriageFlow
          context={context}
          openingCase={openingCase}
          startError={startError}
          onClose={onClose}
          onResolvedWithoutCase={onResolvedWithoutCase}
          onCreateCase={onCreateCase}
        />
      ) : (
        <p className={OverlayUi.bodySecondary}>
          {safeT("support_enter_missing_context", {
            fallbackKo: "문의 정보를 불러올 수 없습니다. 다시 시도해 주세요.",
            fallbackEn: "Could not load inquiry context. Please try again.",
          })}
        </p>
      )}
    </SupportSheetChrome>
  );
}

export function SupportModalHost() {
  const { safeT } = useI18n();
  const titleId = useId();
  const activeTitleId = useId();
  const modal = useSyncExternalStore(
    subscribeSupportModalState,
    getSupportModalState,
    (): SupportModalState => ({
      phase: "closed",
      context: null,
      caseId: null,
      restoreCaseId: null,
    })
  );
  const open = modal.phase === "open";
  useSupportModalMainBottomNavSuppress(open);

  const [openingCase, setOpeningCase] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [activeDismissible, setActiveDismissible] = useState(false);
  const historyPushed = useRef(false);
  const closingFromPop = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (getSupportModalState().phase === "open") return;
    const restoreId = consumeSupportModalRestoreCaseId();
    if (restoreId) {
      deliverSupportOpen({ caseId: restoreId, source: "restore" });
      return;
    }
    const pending = readPendingSupportContext();
    if (pending) {
      deliverSupportOpen({ context: pending, source: "enter" });
      clearPendingSupportContext();
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setOpeningCase(false);
      setStartError(null);
      setActiveDismissible(false);
      if (historyPushed.current && !closingFromPop.current) {
        historyPushed.current = false;
        try {
          if (window.history.state?.[HISTORY_KEY]) {
            window.history.back();
          }
        } catch {
          /* ignore */
        }
      }
      closingFromPop.current = false;
      return;
    }

    if (!historyPushed.current) {
      try {
        window.history.pushState({ ...window.history.state, [HISTORY_KEY]: true }, "");
        historyPushed.current = true;
      } catch {
        /* ignore */
      }
    }

    const onPop = () => {
      if (!historyPushed.current) return;
      historyPushed.current = false;
      closingFromPop.current = true;
      const active = document.activeElement as HTMLElement | null;
      if (active && typeof active.blur === "function") {
        active.blur();
      }
      closeSupportModal();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open]);

  const handleClose = useCallback(() => {
    closeSupportModal();
  }, []);

  const handleCreateCase = useCallback(
    async (payload: {
      context: SupportContext;
      issueType: string;
      initialSummary: string;
      guidanceKey?: string;
      guidanceRevision?: number;
      guidanceOutcome?: string;
      explicitOtherSelection?: boolean;
      initialBody: string;
    }) => {
      if (openingCase) return;
      if (!isSupportContextEnabled(payload.context)) {
        setStartError("missing_context");
        return;
      }
      setOpeningCase(true);
      setStartError(null);
      try {
        const res = await fetch("/api/support/cases/open", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            context: payload.context,
            issueType: payload.issueType,
            initialSummary: payload.initialSummary,
            initialBody: payload.initialBody,
            guidanceKey: payload.guidanceKey,
            guidanceRevision: payload.guidanceRevision,
            guidanceOutcome: payload.guidanceOutcome,
            requireIssueType: true,
            explicitOtherSelection: payload.explicitOtherSelection === true,
          }),
        });
        const json = (await res.json()) as {
          ok?: boolean;
          case?: { id: string };
          error?: string;
        };
        if (!res.ok || !json.ok || !json.case?.id) {
          setStartError(json.error ?? "open_failed");
          return;
        }
        clearPendingSupportContext();
        setSupportModalCaseId(json.case.id);
      } catch {
        setStartError("network_error");
      } finally {
        setOpeningCase(false);
      }
    },
    [openingCase]
  );

  const handleNewInquiry = useCallback(() => {
    const prev = getSupportModalState().context;
    const audience = prev?.audience === "OWNER" ? "OWNER" : "MEMBER";
    const storeId = prev?.storeId;
    resetSupportModalToStart(
      buildGenericSupportTriageContext({
        audience,
        sourceSurface:
          audience === "OWNER" ? "owner_customer_center" : "mypage_customer_center",
        storeId,
      })
    );
    setActiveDismissible(false);
    setStartError(null);
  }, []);

  const title = safeT("support_center_brand_title", {
    fallbackKo: "DIBAY 고객센터",
    fallbackEn: "DIBAY Support",
  });
  const closeLabel = safeT("support_modal_close_aria", {
    fallbackKo: "고객센터 닫기",
    fallbackEn: "Close support",
  });

  const showStart = open && !modal.caseId;
  const showActive = open && Boolean(modal.caseId);
  const dismissible = showStart ? true : activeDismissible;

  return (
    <SupportSheetShell
      open={open}
      onClose={handleClose}
      dismissible={dismissible}
      ariaLabel={title}
    >
      {showStart ? (
        <SupportStartBody
          titleId={titleId}
          title={title}
          closeLabel={closeLabel}
          context={modal.context}
          openingCase={openingCase}
          startError={startError}
          onClose={handleClose}
          onCreateCase={(payload) => void handleCreateCase(payload)}
          onResolvedWithoutCase={handleClose}
        />
      ) : null}
      {showActive && modal.caseId ? (
        <SupportActiveConversation
          caseId={modal.caseId}
          titleId={activeTitleId}
          title={title}
          closeLabel={closeLabel}
          onClose={handleClose}
          onRequestNewInquiry={handleNewInquiry}
          onDismissibleChange={setActiveDismissible}
        />
      ) : null}
    </SupportSheetShell>
  );
}
