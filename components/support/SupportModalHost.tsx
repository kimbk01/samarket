"use client";

import { KASAMA_NOTIFICATIONS_UPDATED } from "@/lib/notifications/notification-events";
import { resyncBadgesAfterNotificationEventsRead } from "@/lib/notifications/client/notification-events-read-resync";
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
import { privateRealtimeChannelOptions } from "@/lib/supabase/private-realtime-channel-options";
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
import { supportCaseStatusLabelMeta } from "@/lib/support/support-status-label";
import { useSupportModalMainBottomNavSuppress } from "@/lib/support/support-modal-main-bottom-nav-suppress";
import type { SupportCaseRow, SupportMessageRow } from "@/lib/support/support-case-types";
import { supportErrorLabel } from "@/lib/support/support-display-labels";

const HISTORY_KEY = "dibaySupportModal";

function sameSupportMessages(
  prev: SupportMessageRow[],
  next: SupportMessageRow[]
): boolean {
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i += 1) {
    const a = prev[i];
    const b = next[i];
    if (
      !a ||
      !b ||
      a.id !== b.id ||
      a.body !== b.body ||
      a.created_at !== b.created_at ||
      (a.deleted_at ?? null) !== (b.deleted_at ?? null) ||
      (a.edited_at ?? null) !== (b.edited_at ?? null)
    ) {
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
    <div className="flex min-h-0 flex-1 flex-col" data-support-sheet-chrome="1">
      <div
        className="mb-2 flex shrink-0 items-start gap-2"
        data-support-sheet-header="1"
        data-form-keyboard-sticky-chrome="1"
      >
        <div className="min-w-0 flex-1 pr-1">
          <h2
            id={titleId}
            className={`${OverlayUi.title} ${OverlayUi.titleSheet} !mb-1 !text-left break-keep`}
          >
            {title}
          </h2>
          {statusText ? (
            <span className="inline-flex rounded-full bg-[var(--overlay-secondary)] px-2.5 py-0.5 text-[length:var(--overlay-caption-size)] font-medium text-[var(--overlay-text-secondary)]">
              {statusText}
            </span>
          ) : null}
          {subContext}
        </div>
        <button
          type="button"
          data-support-modal-close="1"
          className="dibay-overlay-icon-btn shrink-0"
          aria-label={closeLabel}
          onClick={onClose}
        >
          <X className="h-5 w-5" strokeWidth={2} aria-hidden />
        </button>
      </div>
      {children}
    </div>
  );
}

function ContextChips({ context }: { context: SupportContext }) {
  const { safeT } = useI18n();
  if (!context.category || context.needsCategorySelection) return null;
  const defLabel = safeT("support_enter_category_label");
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <span className="rounded-[length:var(--overlay-radius-sm)] border border-[var(--overlay-border)] px-2 py-0.5 text-[length:var(--overlay-caption-size)] text-[var(--overlay-text-secondary)]">
        {defLabel}
      </span>
      {context.audience === "OWNER" && context.storeId ? (
        <span className="rounded-[length:var(--overlay-radius-sm)] border border-[var(--overlay-border)] px-2 py-0.5 text-[length:var(--overlay-caption-size)] text-[var(--overlay-text-secondary)]">
          {safeT("support_chip_store")}
        </span>
      ) : null}
      {context.referenceType ? (
        <span className="rounded-[length:var(--overlay-radius-sm)] border border-[var(--overlay-border)] px-2 py-0.5 text-[length:var(--overlay-caption-size)] text-[var(--overlay-text-secondary)]">
          {safeT("support_triage_field_reference")}
        </span>
      ) : null}
    </div>
  );
}

type SupportNewInquiryOrigin = {
  audience: "MEMBER" | "OWNER";
  ownerStoreId: string | null;
};

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
  /** DEF-11 — pass the loaded case identity so a new inquiry keeps its audience/store. */
  onRequestNewInquiry: (fromCase: SupportNewInquiryOrigin | null) => void;
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
          notificationsRead?: number;
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
        // Phase 3 A3 — server cleared this case's bell rows → let badge owners refetch.
        if (Number(json.notificationsRead ?? 0) > 0 && typeof window !== "undefined") {
          window.dispatchEvent(new Event(KASAMA_NOTIFICATIONS_UPDATED));
          resyncBadgesAfterNotificationEventsRead("notification_opened");
        }
        const nextMessages = json.messages ?? [];
        setMessages((prev) =>
          silent && sameSupportMessages(prev, nextMessages) ? prev : nextMessages
        );
        hasLoadedOnceRef.current = true;
        const closed =
          json.case.status === "RESOLVED" || json.case.status === "ARCHIVED";
        onDismissibleChange(closed);
      } catch {
        // DEF-07: network failure / non-JSON (e.g. 502 HTML) must surface as an error with
        // Retry — never as an empty conversation with a live composer.
        if (!silent) {
          setError("network_error");
          setSupportCase(null);
          setMessages([]);
          onDismissibleChange(true);
        }
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

  const nearBottomRef = useRef(true);
  const pendingOwnSendRef = useRef(false);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
      nearBottomRef.current = gap < 80;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, [loading]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (pendingOwnSendRef.current || nearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
      pendingOwnSendRef.current = false;
    }
  }, [messages.length]);

  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return;
    const channel = sb
      .channel(`support-modal-case-${caseId}`, privateRealtimeChannelOptions())
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
        if (json.error === "case_closed") {
          // DEF-12: case was closed meanwhile — re-read so the closed state + "새 문의하기" show.
          void load({ silent: true });
        }
        return;
      }
      pendingOwnSendRef.current = true;
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
  const statusMeta = supportCaseStatusLabelMeta(supportCase?.status ?? null);
  const statusLabel = safeT(statusMeta.key);
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
          <div className="h-16 w-full animate-pulse rounded-[length:var(--overlay-radius-md)] bg-[var(--overlay-secondary)]" />
          <div className="h-16 w-[70%] self-end animate-pulse rounded-[length:var(--overlay-radius-md)] bg-[var(--overlay-secondary)]" />
        </div>
      ) : error && messages.length === 0 ? (
        <div className="rounded-[length:var(--overlay-radius-md)] bg-[color:color-mix(in_srgb,var(--overlay-danger)_8%,#fff)] p-4 text-[length:var(--overlay-body-2-size)] text-[color:var(--overlay-danger)]">
          {error === "unauthorized"
            ? safeT("support_case_auth_required")
            : error === "forbidden"
              ? safeT("support_case_unavailable")
              : supportErrorLabel(safeT, error)}
          {error !== "forbidden" ? (
            <DibayOverlayButton
              roleTone="secondary"
              className="mt-3 w-full"
              onClick={() => void load()}
            >
              {safeT("common_retry")}
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
            const isSystem = m.sender_type === "SYSTEM";
            if (isSystem) {
              return (
                <div key={m.id} className="flex justify-center">
                  <div className="max-w-[90%] rounded-[length:var(--overlay-radius-md)] bg-[var(--overlay-secondary)] px-3 py-1.5 text-center text-[length:var(--overlay-caption-size)] text-[var(--overlay-text-secondary)]">
                    <p data-user-content="" className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className="mt-0.5 text-[length:var(--overlay-caption-size)] text-[var(--overlay-text-secondary)]">
                      {new Date(m.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              );
            }
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-[length:var(--overlay-radius-md)] px-3 py-2 text-[length:var(--overlay-body-2-size)] leading-relaxed ${
                    mine
                      ? "bg-[var(--overlay-primary)] text-[color:var(--overlay-surface)]"
                      : "bg-[var(--overlay-secondary)] text-[var(--overlay-text-primary)]"
                  }`}
                >
                  {!mine ? (
                    <p className="mb-1 text-[length:var(--overlay-caption-size)] font-semibold text-[var(--overlay-text-secondary)]">
                      {safeT("support_agent_identity")}
                    </p>
                  ) : null}
                  {m.deleted_at ? (
                    <p
                      className={`italic ${mine ? "text-[color:color-mix(in_srgb,var(--overlay-surface)_80%,transparent)]" : "text-[var(--overlay-text-secondary)]"}`}
                      data-support-msg-deleted="1"
                    >
                      {safeT("support_message_deleted")}
                    </p>
                  ) : (
                    <p data-user-content="" className="whitespace-pre-wrap break-words">{m.body}</p>
                  )}
                  <p
                    className={`mt-1 text-[length:var(--overlay-caption-size)] ${
                      mine ? "text-[color:color-mix(in_srgb,var(--overlay-surface)_80%,transparent)]" : "text-[var(--overlay-text-secondary)]"
                    }`}
                  >
                    {new Date(m.created_at).toLocaleString()}
                    {m.edited_at && !m.deleted_at
                      ? ` · ${safeT("support_message_edited")}`
                      : ""}
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
              {safeT("support_case_closed_hint")}
            </p>
            <DibayOverlayButton
              roleTone="primary"
              className="w-full"
              onClick={() =>
                onRequestNewInquiry(
                  supportCase
                    ? {
                        audience: supportCase.audience,
                        ownerStoreId: supportCase.owner_store_id,
                      }
                    : null
                )
              }
            >
              {safeT("support_new_inquiry_cta")}
            </DibayOverlayButton>
          </div>
        ) : (
          <div className="space-y-1.5">
            {offline ? (
              <p className={`${OverlayUi.caption} !mb-0`}>
                {safeT("support_offline_hint")}
              </p>
            ) : null}
            {error ? (
              <p className={`${OverlayUi.captionDanger} !mb-0`}>
                {supportErrorLabel(safeT, error)}
              </p>
            ) : null}
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={1}
                data-form-keyboard-field="1"
                disabled={sending || offline}
                className={`${OverlayUi.input} min-h-11 flex-1 resize-none !py-2.5`}
                placeholder={safeT("support_message_placeholder")}
              />
              <DibayOverlayButton
                roleTone="primary"
                className="!h-10 !w-10 !min-h-10 !min-w-10 !max-w-10 shrink-0 !rounded-full !px-0"
                disabled={sending || offline || !draft.trim()}
                loading={sending}
                onClick={() => void send()}
                aria-label={safeT("support_send_cta")}
              >
                {safeT("support_send_cta")}
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
      statusText={safeT("support_enter_greeting")}
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
          {safeT("support_enter_missing_context")}
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

  const handleNewInquiry = useCallback((fromCase: SupportNewInquiryOrigin | null) => {
    const prev = getSupportModalState().context;
    // DEF-11: opened by caseId (push / history) → context is null; fall back to the
    // loaded case's audience/store instead of defaulting an Owner to MEMBER.
    const audience =
      (prev?.audience ?? fromCase?.audience) === "OWNER" ? "OWNER" : "MEMBER";
    const storeId =
      prev?.storeId ??
      (audience === "OWNER" ? fromCase?.ownerStoreId ?? undefined : undefined);
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

  const title = safeT("support_center_brand_title");
  const closeLabel = safeT("support_modal_close_aria");

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
