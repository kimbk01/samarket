"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { SupportCaseRow, SupportMessageRow } from "@/lib/support/support-case-types";

export function SupportCaseConversationClient({ caseId }: { caseId: string }) {
  const { safeT } = useI18n();
  const [supportCase, setSupportCase] = useState<SupportCaseRow | null>(null);
  const [messages, setMessages] = useState<SupportMessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/support/cases/${encodeURIComponent(caseId)}`, {
        credentials: "include",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        case?: SupportCaseRow;
        messages?: SupportMessageRow[];
        error?: string;
      };
      if (!res.ok || !json.ok || !json.case) {
        setError(json.error ?? "load_failed");
        return;
      }
      setSupportCase(json.case);
      setMessages(json.messages ?? []);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return;
    const channel = sb
      .channel(`support-case-${caseId}`)
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
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [caseId, load]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
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
    } finally {
      setSending(false);
    }
  };

  const resolveCase = async () => {
    if (sending) return;
    setSending(true);
    try {
      await fetch(`/api/support/cases/${encodeURIComponent(caseId)}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reopen" }),
      });
      await load();
    } finally {
      setSending(false);
    }
  };

  const title =
    supportCase?.public_case_no ??
    safeT("support_enter_title", {
      fallbackKo: "고객센터",
      fallbackEn: "Customer support",
    });

  const closed =
    supportCase?.status === "RESOLVED" || supportCase?.status === "ARCHIVED";

  return (
    <div className="flex min-h-screen flex-col bg-sam-app">
      <MySubpageHeader
        title={title}
        subtitle={supportCase?.subject}
        backHref="/mypage"
        preferHistoryBack
        hideCtaStrip
      />
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-[calc(var(--safe-bottom)+12px)] pt-3">
        {loading ? (
          <p className="text-sm text-sam-muted">
            {safeT("common_loading", { fallbackKo: "불러오는 중…", fallbackEn: "Loading…" })}
          </p>
        ) : error ? (
          <div className="rounded-ui-rect border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
            <button
              type="button"
              className="mt-3 block underline"
              onClick={() => void load()}
            >
              {safeT("common_retry", { fallbackKo: "다시 시도", fallbackEn: "Retry" })}
            </button>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-ui-rect border border-sam-border bg-sam-surface p-3">
              {messages.map((m) => {
                const mine = m.sender_type === "MEMBER" || m.sender_type === "OWNER";
                return (
                  <div
                    key={m.id}
                    className={`flex ${mine ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-ui-rect px-3 py-2 text-[14px] leading-relaxed ${
                        mine
                          ? "bg-sam-primary text-white"
                          : "bg-sam-surface-muted text-sam-fg"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p className={`mt-1 text-[11px] ${mine ? "text-white/80" : "text-sam-muted"}`}>
                        {new Date(m.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {closed ? (
              <div className="mt-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
                <p className="text-sm text-sam-muted">
                  {safeT("support_case_closed_hint", {
                    fallbackKo: "이 문의는 종료되었습니다.",
                    fallbackEn: "This case is closed.",
                  })}
                </p>
                <button
                  type="button"
                  disabled={sending}
                  className="mt-3 min-h-11 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-4 text-[14px] font-semibold text-sam-fg disabled:opacity-50"
                  onClick={() => void resolveCase()}
                >
                  {safeT("support_case_reopen_cta", {
                    fallbackKo: "추가 문의",
                    fallbackEn: "Follow up",
                  })}
                </button>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[14px] text-sam-fg"
                  placeholder={safeT("support_message_placeholder", {
                    fallbackKo: "메시지를 입력하세요",
                    fallbackEn: "Type your message",
                  })}
                />
                <button
                  type="button"
                  disabled={sending || !draft.trim()}
                  className="min-h-11 w-full rounded-ui-rect bg-sam-primary px-4 text-[14px] font-semibold text-white disabled:opacity-50"
                  onClick={() => void send()}
                >
                  {sending
                    ? safeT("common_loading", { fallbackKo: "전송 중…", fallbackEn: "Sending…" })
                    : safeT("support_send_message_cta", {
                        fallbackKo: "메시지 보내기",
                        fallbackEn: "Send message",
                      })}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
