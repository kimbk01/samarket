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
import { DibayBottomSheet, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { SupportContext } from "@/lib/support/support-context";
import { isSupportContextEnabled } from "@/lib/support/support-context";
import {
  clearPendingSupportContext,
  consumeSupportModalRestoreCaseId,
  readPendingSupportContext,
} from "@/lib/support/open-support-center";
import {
  closeSupportModal,
  getSupportModalState,
  openSupportModal,
  resetSupportModalToStart,
  setSupportModalCaseId,
  subscribeSupportModalState,
  type SupportModalState,
} from "@/lib/support/support-modal-controller";
import { useSupportModalMainBottomNavSuppress } from "@/lib/support/support-modal-main-bottom-nav-suppress";
import type { SupportCaseRow, SupportMessageRow } from "@/lib/support/support-case-types";

const SUPPORT_SHEET_HEIGHT_RATIO = 0.8;
const HISTORY_KEY = "dibaySupportModal";

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
      <div className="mb-3 flex shrink-0 items-start gap-2">
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
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <span className="rounded-ui-rect border border-[var(--overlay-border)] px-2 py-0.5 text-[12px] text-[var(--overlay-text-secondary)]">
        {safeT("support_enter_category_label", {
          fallbackKo: "문의 유형",
          fallbackEn: "Category",
        })}
        : {context.category}
      </span>
      {context.audience === "OWNER" && context.storeId ? (
        <span className="rounded-ui-rect border border-[var(--overlay-border)] px-2 py-0.5 text-[12px] text-[var(--overlay-text-secondary)]">
          Store · {context.storeId.slice(0, 8)}…
        </span>
      ) : null}
      {context.referenceType ? (
        <span className="rounded-ui-rect border border-[var(--overlay-border)] px-2 py-0.5 text-[12px] text-[var(--overlay-text-secondary)]">
          {context.referenceType}
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
  onKeyboardInset,
}: {
  caseId: string;
  titleId: string;
  title: string;
  closeLabel: string;
  onClose: () => void;
  onRequestNewInquiry: () => void;
  onDismissibleChange: (dismissible: boolean) => void;
  onKeyboardInset: (px: number) => void;
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
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const kb = useFormKeyboardViewport({ enabled: true });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fetchCase = () =>
        fetch(`/api/support/cases/${encodeURIComponent(caseId)}`, {
          credentials: "include",
        });
      let res = await fetchCase();
      // Cold-start race: session may still be restoring — heal once then retry.
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
        // Fail-closed: do not fall back to legacy inquiry / messenger routes.
        setError(
          res.status === 401
            ? "unauthorized"
            : res.status === 403 || res.status === 404
              ? "forbidden"
              : (json.error ?? "load_failed")
        );
        setSupportCase(null);
        setMessages([]);
        onDismissibleChange(true);
        return;
      }
      setSupportCase(json.case);
      setMessages(json.messages ?? []);
      const closed =
        json.case.status === "RESOLVED" || json.case.status === "ARCHIVED";
      onDismissibleChange(closed);
    } finally {
      setLoading(false);
    }
  }, [caseId, onDismissibleChange]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    onKeyboardInset(kb.effectiveBottomInset);
  }, [kb.effectiveBottomInset, onKeyboardInset]);

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
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
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
          void load();
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
          void load();
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
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "send_failed");
        return;
      }
      setDraft("");
      await load();
    } catch {
      setError("network_error");
    } finally {
      setSending(false);
    }
  };

  const closed =
    supportCase?.status === "RESOLVED" || supportCase?.status === "ARCHIVED";
  const statusMeta = statusLabelMeta(supportCase?.status ?? null);
  const statusText = safeT(statusMeta.key, {
    fallbackKo: statusMeta.fallbackKo,
    fallbackEn: statusMeta.fallbackEn,
  });

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
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain">
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
          <div ref={bottomRef} />
        </div>
      )}

      <div className="shrink-0 space-y-2 pt-3" data-form-keyboard-footer="1">
        {closed ? (
          <>
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
          </>
        ) : (
          <>
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
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              data-form-keyboard-field="1"
              disabled={sending || offline}
              className={`${OverlayUi.input} w-full resize-none !min-h-[44px]`}
              placeholder={safeT("support_message_placeholder", {
                fallbackKo: "메시지를 입력하세요",
                fallbackEn: "Type your message",
              })}
            />
            <DibayOverlayButton
              roleTone="primary"
              className="w-full !min-h-11"
              disabled={sending || offline || !draft.trim()}
              loading={sending}
              onClick={() => void send()}
            >
              {safeT("support_send_cta", {
                fallbackKo: "전송",
                fallbackEn: "Send",
              })}
            </DibayOverlayButton>
          </>
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
  onStart,
}: {
  titleId: string;
  title: string;
  closeLabel: string;
  context: SupportContext | null;
  openingCase: boolean;
  startError: string | null;
  onClose: () => void;
  onStart: () => void;
}) {
  const { safeT } = useI18n();
  return (
    <SupportSheetChrome
      titleId={titleId}
      title={title}
      onClose={onClose}
      closeLabel={closeLabel}
      subContext={context ? <ContextChips context={context} /> : null}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {context ? (
          <>
            <p className={OverlayUi.body}>
              {safeT("support_enter_greeting", {
                fallbackKo: "무엇을 도와드릴까요?",
                fallbackEn: "How can we help?",
              })}
            </p>
            <p className={OverlayUi.bodySecondary}>
              {safeT("support_modal_start_hint", {
                fallbackKo:
                  "문의하기를 누르면 상담이 시작됩니다. 현재 화면 정보는 상담에 전달됩니다.",
                fallbackEn:
                  "Tap Contact us to start. Your current screen context is shared with support.",
              })}
            </p>
          </>
        ) : (
          <p className={OverlayUi.bodySecondary}>
            {safeT("support_enter_missing_context", {
              fallbackKo: "문의 정보를 불러올 수 없습니다. 다시 시도해 주세요.",
              fallbackEn: "Could not load inquiry context. Please try again.",
            })}
          </p>
        )}
        {startError ? (
          <p className={`${OverlayUi.caption} text-red-600`}>
            {safeT("support_enter_missing_context", {
              fallbackKo: "문의 정보를 불러올 수 없습니다. 다시 시도해 주세요.",
              fallbackEn: "Could not load inquiry context. Please try again.",
            })}{" "}
            ({startError})
          </p>
        ) : null}
      </div>
      {context ? (
        <div className="shrink-0 pt-3">
          <DibayOverlayButton
            roleTone="primary"
            className="w-full !min-h-11"
            loading={openingCase}
            disabled={openingCase}
            onClick={onStart}
          >
            {safeT("support_enter_cta", {
              fallbackKo: "문의하기",
              fallbackEn: "Contact us",
            })}
          </DibayOverlayButton>
        </div>
      ) : null}
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
  const [keyboardInset, setKeyboardInset] = useState(0);
  const historyPushed = useRef(false);
  const closingFromPop = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (getSupportModalState().phase === "open") return;
    const restoreId = consumeSupportModalRestoreCaseId();
    if (restoreId) {
      openSupportModal({ caseId: restoreId });
      return;
    }
    const pending = readPendingSupportContext();
    if (pending) {
      openSupportModal({ context: pending });
      clearPendingSupportContext();
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setOpeningCase(false);
      setStartError(null);
      setActiveDismissible(false);
      setKeyboardInset(0);
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

  const handleStartInquiry = useCallback(async () => {
    if (openingCase) return;
    const ctx = modal.context;
    if (!isSupportContextEnabled(ctx)) {
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
        body: JSON.stringify({ context: ctx }),
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
  }, [modal.context, openingCase]);

  const handleNewInquiry = useCallback(() => {
    resetSupportModalToStart();
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
  const startDismissible = true;

  return (
    <>
      <DibayBottomSheet
        open={showStart}
        onClose={handleClose}
        dismissible={startDismissible}
        anchor="device-bottom"
        showHandle={false}
        heightRatio={SUPPORT_SHEET_HEIGHT_RATIO}
        ariaLabel={title}
        panelClassName="mx-auto w-full max-w-[560px]"
      >
        <SupportStartBody
          titleId={titleId}
          title={title}
          closeLabel={closeLabel}
          context={modal.context}
          openingCase={openingCase}
          startError={startError}
          onClose={handleClose}
          onStart={() => void handleStartInquiry()}
        />
      </DibayBottomSheet>

      <DibayBottomSheet
        open={showActive}
        onClose={handleClose}
        dismissible={activeDismissible}
        anchor="device-bottom"
        showHandle={false}
        heightRatio={SUPPORT_SHEET_HEIGHT_RATIO}
        ariaLabel={title}
        panelClassName="mx-auto w-full max-w-[560px]"
        contentPaddingBottomPx={keyboardInset > 0 ? keyboardInset : undefined}
      >
        {modal.caseId ? (
          <SupportActiveConversation
            caseId={modal.caseId}
            titleId={activeTitleId}
            title={title}
            closeLabel={closeLabel}
            onClose={handleClose}
            onRequestNewInquiry={handleNewInquiry}
            onDismissibleChange={setActiveDismissible}
            onKeyboardInset={setKeyboardInset}
          />
        ) : null}
      </DibayBottomSheet>
    </>
  );
}
