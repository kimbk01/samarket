"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type Thread = {
  id: string;
  member_user_id: string;
  subject: string;
  status: string;
  last_message_at: string;
  admin_unread_count: number;
};

type Message = {
  id: string;
  sender_role: "member" | "admin";
  body: string;
  created_at: string;
};

export function AdminMemberNotesPage() {
  const { t, language } = useI18n();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [subject, setSubject] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadThreads = useCallback(async () => {
    const res = await fetch("/api/admin/member-notes", { credentials: "include", cache: "no-store" });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; threads?: Thread[]; error?: string };
    if (!res.ok || !j.ok) {
      setError(j.error ?? "load_failed");
      setThreads([]);
      return;
    }
    setThreads(Array.isArray(j.threads) ? j.threads : []);
    setError(null);
  }, []);

  const loadThread = useCallback(async (id: string) => {
    setActiveId(id);
    const res = await fetch(`/api/admin/member-notes/${encodeURIComponent(id)}`, {
      credentials: "include",
      cache: "no-store",
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      thread?: Thread;
      messages?: Message[];
      error?: string;
    };
    if (!res.ok || !j.ok) {
      setError(j.error ?? "load_failed");
      return;
    }
    setSubject(j.thread?.subject ?? "");
    setMessages(Array.isArray(j.messages) ? j.messages : []);
    await loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  const sendReply = async () => {
    if (!activeId || busy || !reply.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/member-notes/${encodeURIComponent(activeId)}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: reply }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setError(j.error ?? "send_failed");
        return;
      }
      setReply("");
      await loadThread(activeId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
      <h1 className="text-lg font-semibold text-sam-fg">{t("notif_admin_notes_title")}</h1>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <ul className="max-h-[70vh] space-y-2 overflow-y-auto rounded-ui-rect border border-sam-border bg-sam-surface p-2">
          {threads.length === 0 ? (
            <li className="p-3 text-sm text-sam-muted">{t("notif_admin_notes_empty")}</li>
          ) : (
            threads.map((th) => (
              <li key={th.id}>
                <button
                  type="button"
                  onClick={() => void loadThread(th.id)}
                  className={`flex w-full items-center gap-2 rounded-ui-rect px-3 py-2 text-left ${
                    activeId === th.id ? "bg-signature/10" : "hover:bg-sam-muted/10"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-sam-fg">
                      {th.subject}
                    </span>
                    <span className="block truncate text-[11px] text-sam-meta">
                      {th.member_user_id.slice(0, 8)} ·{" "}
                      {new Date(th.last_message_at).toLocaleString(
                        language === "ko" ? "ko-KR" : "en-US"
                      )}
                    </span>
                  </span>
                  {th.admin_unread_count > 0 ? (
                    <span className="rounded-full bg-sam-danger px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {th.admin_unread_count}
                    </span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="flex min-h-[50vh] flex-col rounded-ui-rect border border-sam-border bg-sam-surface p-3">
          {activeId ? (
            <>
              <h2 className="text-[14px] font-semibold text-sam-fg">{subject}</h2>
              <ul className="mt-3 flex-1 space-y-2 overflow-y-auto">
                {messages.map((m) => (
                  <li
                    key={m.id}
                    className={`rounded-ui-rect border px-3 py-2 text-[13px] ${
                      m.sender_role === "admin"
                        ? "border-signature/30 bg-signature/5"
                        : "border-sam-border"
                    }`}
                  >
                    <p className="text-[10px] text-sam-meta">
                      {m.sender_role === "admin"
                        ? t("notif_admin_notes_from_admin")
                        : t("notif_admin_notes_from_me")}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sam-fg">{m.body}</p>
                  </li>
                ))}
              </ul>
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={3}
                className="mt-3 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[13px]"
                placeholder={t("notif_admin_notes_reply_ph")}
              />
              <button
                type="button"
                disabled={busy || !reply.trim()}
                onClick={() => void sendReply()}
                className="mt-2 rounded-ui-rect bg-signature px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {t("notif_admin_notes_send")}
              </button>
            </>
          ) : (
            <p className="text-sm text-sam-muted">{t("notif_admin_notes_empty")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
