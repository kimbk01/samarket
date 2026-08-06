"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MemberAdminNoteKind } from "@/lib/notifications/member-admin-notes";
import { kindFromStartedBy } from "@/lib/notifications/member-admin-notes";

type Thread = {
  id: string;
  member_user_id: string;
  subject: string;
  status: string;
  last_message_at: string;
  admin_unread_count: number;
  started_by?: string;
};

type Message = {
  id: string;
  sender_role: "member" | "admin";
  body: string;
  created_at: string;
};

function parseKind(raw: string | null): MemberAdminNoteKind | null {
  if (raw === "inquiry" || raw === "inbox") return raw;
  return null;
}

function AdminMemberNotesPageInner() {
  const { t, language, safeT } = useI18n();
  const searchParams = useSearchParams();
  const kind = parseKind(searchParams.get("kind"));
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [subject, setSubject] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [createMemberId, setCreateMemberId] = useState("");
  const [createSubject, setCreateSubject] = useState("");
  const [createBody, setCreateBody] = useState("");

  const pageTitle = useMemo(() => {
    if (kind === "inquiry") {
      return safeT("admin_menu_cp_member_inquiry", {
        fallbackKo: "회원 문의",
        fallbackEn: "Member inquiry",
      });
    }
    if (kind === "inbox") {
      return safeT("admin_menu_cp_member_inbox", {
        fallbackKo: "회원 쪽지",
        fallbackEn: "Member inbox",
      });
    }
    return t("notif_admin_notes_title");
  }, [kind, safeT, t]);

  const loadThreads = useCallback(async () => {
    const qs = kind ? `?kind=${encodeURIComponent(kind)}` : "";
    const res = await fetch(`/api/admin/member-notes${qs}`, {
      credentials: "include",
      cache: "no-store",
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      threads?: Thread[];
      error?: string;
    };
    if (!res.ok || !j.ok) {
      setError(j.error ?? "load_failed");
      setThreads([]);
      return;
    }
    setThreads(Array.isArray(j.threads) ? j.threads : []);
    setError(null);
  }, [kind]);

  const loadThread = useCallback(
    async (id: string) => {
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
    },
    [loadThreads]
  );

  useEffect(() => {
    setActiveId(null);
    setMessages([]);
    setSubject("");
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

  const createInbox = async () => {
    if (busy || !createMemberId.trim() || !createSubject.trim() || !createBody.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/member-notes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberUserId: createMemberId.trim(),
          subject: createSubject,
          body: createBody,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        thread?: Thread;
        error?: string;
      };
      if (!res.ok || !j.ok) {
        setError(j.error ?? "create_failed");
        return;
      }
      setCreateMemberId("");
      setCreateSubject("");
      setCreateBody("");
      await loadThreads();
      if (j.thread?.id) await loadThread(j.thread.id);
    } finally {
      setBusy(false);
    }
  };

  const showCreate = kind !== "inquiry";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
      <h1 className="text-lg font-semibold text-sam-fg">{pageTitle}</h1>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {showCreate ? (
        <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
          <h2 className="text-[14px] font-semibold text-sam-fg">
            {safeT("admin_member_notes_inbox_create_title", {
              fallbackKo: "받은 쪽지 발송 (회원 1명)",
              fallbackEn: "Send Inbox (1 member)",
            })}
          </h2>
          <p className="mt-1 text-[12px] text-sam-muted">
            {safeT("admin_member_notes_inbox_create_hint", {
              fallbackKo: "세그먼트·대량 발송은 지원하지 않습니다. 회원 UUID 1명만 입력하세요.",
              fallbackEn: "Segment/bulk send is not supported. Enter exactly one member UUID.",
            })}
          </p>
          <input
            value={createMemberId}
            onChange={(e) => setCreateMemberId(e.target.value)}
            placeholder={safeT("admin_member_notes_member_id_ph", {
              fallbackKo: "회원 user id (UUID)",
              fallbackEn: "Member user id (UUID)",
            })}
            className="mt-2 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[13px]"
          />
          <input
            value={createSubject}
            onChange={(e) => setCreateSubject(e.target.value)}
            placeholder={t("notif_admin_notes_subject_ph")}
            className="mt-2 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[13px]"
          />
          <textarea
            value={createBody}
            onChange={(e) => setCreateBody(e.target.value)}
            rows={3}
            placeholder={t("notif_admin_notes_body_ph")}
            className="mt-2 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[13px]"
          />
          <button
            type="button"
            disabled={
              busy || !createMemberId.trim() || !createSubject.trim() || !createBody.trim()
            }
            onClick={() => void createInbox()}
            className="mt-2 rounded-ui-rect bg-signature px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {safeT("admin_member_notes_inbox_send", {
              fallbackKo: "쪽지 보내기",
              fallbackEn: "Send Inbox",
            })}
          </button>
        </section>
      ) : null}

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
                    <span className="mt-0.5 block truncate text-[11px] text-sam-muted">
                      {kindFromStartedBy(th.started_by) === "inbox"
                        ? safeT("admin_menu_cp_member_inbox", {
                            fallbackKo: "쪽지",
                            fallbackEn: "Inbox",
                          })
                        : safeT("admin_menu_cp_member_inquiry", {
                            fallbackKo: "문의",
                            fallbackEn: "Inquiry",
                          })}
                      {" · "}
                      {th.status}
                      {" · "}
                      {new Date(th.last_message_at).toLocaleString(
                        language === "ko" ? "ko-KR" : "en-US"
                      )}
                    </span>
                  </span>
                  {th.admin_unread_count > 0 ? (
                    <span className="shrink-0 rounded-full bg-signature px-2 py-0.5 text-[11px] font-semibold text-white">
                      {th.admin_unread_count}
                    </span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>

        <div className="flex min-h-[320px] flex-col rounded-ui-rect border border-sam-border bg-sam-surface p-3">
          {activeId ? (
            <>
              <h2 className="text-[14px] font-semibold text-sam-fg">{subject}</h2>
              <div className="mt-2 flex-1 space-y-2 overflow-y-auto">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-ui-rect px-3 py-2 text-[13px] ${
                      m.sender_role === "admin"
                        ? "bg-signature/10 text-sam-fg"
                        : "bg-sam-app text-sam-fg"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className="mt-1 text-[11px] text-sam-muted">
                      {m.sender_role} ·{" "}
                      {new Date(m.created_at).toLocaleString(language === "ko" ? "ko-KR" : "en-US")}
                    </p>
                  </div>
                ))}
              </div>
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={3}
                placeholder={t("notif_admin_notes_reply_ph")}
                className="mt-2 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[13px]"
              />
              <button
                type="button"
                disabled={busy || !reply.trim()}
                onClick={() => void sendReply()}
                className="mt-2 self-end rounded-ui-rect bg-signature px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {t("notif_admin_notes_send")}
              </button>
            </>
          ) : (
            <p className="m-auto text-sm text-sam-muted">{t("notif_admin_notes_empty")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function AdminMemberNotesPage() {
  return (
    <Suspense fallback={<div className="p-4 sam-text-body text-sam-muted">…</div>}>
      <AdminMemberNotesPageInner />
    </Suspense>
  );
}
