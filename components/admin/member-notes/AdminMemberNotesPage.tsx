"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MemberAdminNoteKind } from "@/lib/notifications/member-admin-notes";
import { kindFromStartedBy } from "@/lib/notifications/member-admin-notes";
import { AdminConsoleSplitView } from "@/components/admin/console/AdminConsoleSplitView";
import { AdminConsoleListPane } from "@/components/admin/console/AdminConsoleListPane";
import { AdminConsoleDetailPane } from "@/components/admin/console/AdminConsoleDetailPane";
import { AdminConsoleToolbar } from "@/components/admin/console/AdminConsoleToolbar";
import { AdminConsoleState } from "@/components/admin/console/AdminConsoleState";

type Thread = {
  id: string;
  member_user_id: string;
  subject: string;
  status: string;
  last_message_at: string;
  admin_unread_count: number;
  started_by?: string;
  member_display_name?: string | null;
  member_email?: string | null;
  is_store_owner?: boolean;
  store_names?: string[];
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
  const memberUserId = searchParams.get("memberUserId")?.trim() ?? "";
  const focusThreadId = String(searchParams.get("thread") ?? "").trim();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [subject, setSubject] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [createMemberId, setCreateMemberId] = useState("");
  const [createSubject, setCreateSubject] = useState("");
  const [createBody, setCreateBody] = useState("");

  const pageTitle = useMemo(() => {
    if (kind === "inquiry") {
      return safeT("admin_menu_cp_member_inquiry", {
        fallbackKo: "Owner/회원 1:1 문의",
        fallbackEn: "Owner/Member 1:1 inquiry",
      });
    }
    if (kind === "inbox") {
      return safeT("admin_menu_cp_member_inbox", {
        fallbackKo: "Owner/회원 쪽지 발송",
        fallbackEn: "Owner/Member inbox notes",
      });
    }
    return t("notif_admin_notes_title");
  }, [kind, safeT, t]);

  const loadThreads = useCallback(async () => {
    setListLoading(true);
    const qs = new URLSearchParams();
    if (kind) qs.set("kind", kind);
    if (memberUserId) qs.set("memberUserId", memberUserId);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    const res = await fetch(`/api/admin/member-notes${suffix}`, {
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
      setListLoading(false);
      return;
    }
    setThreads(Array.isArray(j.threads) ? j.threads : []);
    setError(null);
    setListLoading(false);
  }, [kind, memberUserId]);

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

  useEffect(() => {
    if (!focusThreadId || listLoading) return;
    if (activeId === focusThreadId) return;
    void loadThread(focusThreadId);
  }, [focusThreadId, listLoading, activeId, loadThread]);

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
  const locale = language === "ko" ? "ko-KR" : "en-US";

  const threadListItems = (
    <>
      {threads.map((th) => (
        <li key={th.id}>
          <button
            type="button"
            onClick={() => void loadThread(th.id)}
            className={`flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left ${
              activeId === th.id
                ? "bg-[var(--admin-console-active-bg,rgba(99,102,241,0.1))]"
                : "hover:bg-[var(--admin-console-hover,rgba(0,0,0,0.04))]"
            }`}
            data-admin-console-row={activeId === th.id ? "active" : "idle"}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-sam-fg">
                {th.subject}
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-sam-muted">
                {th.member_display_name || th.member_email || th.member_user_id.slice(0, 8)}
                {th.is_store_owner && th.store_names && th.store_names.length > 0
                  ? ` · Store: ${th.store_names.slice(0, 2).join(", ")}`
                  : th.is_store_owner
                    ? " · Store Owner"
                    : ""}
                {" · "}
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
                {new Date(th.last_message_at).toLocaleString(locale)}
              </span>
            </span>
            {th.admin_unread_count > 0 ? (
              <span className="shrink-0 rounded-full bg-signature px-2 py-0.5 text-[11px] font-semibold text-white">
                {th.admin_unread_count}
              </span>
            ) : null}
          </button>
        </li>
      ))}
    </>
  );

  /** Inquiry-only console layout — inbox / default keep legacy surface below. */
  if (kind === "inquiry") {
    const narrowDetail = Boolean(activeId);
    return (
      <div
        className="admin-member-inquiry-console flex h-[calc(100dvh-8.5rem)] min-h-[24rem] w-full min-w-0 max-w-none flex-col overflow-hidden"
        data-admin-member-notes-console="inquiry"
      >
        <AdminConsoleSplitView
          toolbar={
            <AdminConsoleToolbar
              title={pageTitle}
              meta={
                listLoading
                  ? "…"
                  : safeT("admin_console_thread_count", {
                      fallbackKo: `스레드 ${threads.length}`,
                      fallbackEn: `${threads.length} threads`,
                      vars: { count: threads.length },
                    })
              }
            />
          }
          list={
            <AdminConsoleListPane hiddenOnNarrowWhenDetail={narrowDetail}>
              {error && !activeId ? (
                <div className="p-3">
                  <AdminConsoleState
                    kind="error"
                    action={
                      <button
                        type="button"
                        className="sam-btn sam-btn--outline sam-btn--sm"
                        onClick={() => void loadThreads()}
                      >
                        {safeT("admin_dashboard_retry", {
                          fallbackKo: "다시 시도",
                          fallbackEn: "Retry",
                        })}
                      </button>
                    }
                  >
                    {error}
                  </AdminConsoleState>
                </div>
              ) : listLoading ? (
                <div className="p-3">
                  <AdminConsoleState kind="loading">…</AdminConsoleState>
                </div>
              ) : threads.length === 0 ? (
                <div className="p-3">
                  <AdminConsoleState kind="empty">{t("notif_admin_notes_empty")}</AdminConsoleState>
                </div>
              ) : (
                <ul className="space-y-0.5 p-1.5">{threadListItems}</ul>
              )}
            </AdminConsoleListPane>
          }
          detail={
            <AdminConsoleDetailPane
              hiddenOnNarrowWhenList={!narrowDetail}
              header={
                activeId ? (
                  <div className="flex min-w-0 items-center gap-2">
                    <button
                      type="button"
                      className="inline-flex shrink-0 items-center rounded-sm border border-sam-border px-2 py-1 text-[12px] font-semibold text-sam-fg lg:hidden"
                      onClick={() => {
                        setActiveId(null);
                        setMessages([]);
                        setSubject("");
                        setReply("");
                      }}
                    >
                      {safeT("admin_console_back_to_list", {
                        fallbackKo: "목록",
                        fallbackEn: "List",
                      })}
                    </button>
                    <h2 className="min-w-0 truncate text-[14px] font-semibold text-sam-fg">
                      {subject}
                    </h2>
                  </div>
                ) : null
              }
              footer={
                activeId ? (
                  <div className="flex flex-col gap-2">
                    {error ? <p className="text-sm text-red-600">{error}</p> : null}
                    <textarea
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      rows={3}
                      placeholder={t("notif_admin_notes_reply_ph")}
                      className="w-full rounded-sm border border-sam-border px-3 py-2 text-[13px]"
                      data-admin-console-reply
                    />
                    <button
                      type="button"
                      disabled={busy || !reply.trim()}
                      onClick={() => void sendReply()}
                      className="self-end rounded-sm bg-signature px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                      data-admin-console-reply-send
                    >
                      {t("notif_admin_notes_send")}
                    </button>
                  </div>
                ) : null
              }
            >
              {activeId ? (
                <div className="flex flex-col gap-2">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`rounded-sm px-3 py-2 text-[13px] ${
                        m.sender_role === "admin"
                          ? "bg-signature/10 text-sam-fg"
                          : "bg-sam-app text-sam-fg"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p className="mt-1 text-[11px] text-sam-muted">
                        {m.sender_role} · {new Date(m.created_at).toLocaleString(locale)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <AdminConsoleState kind="empty">
                  {safeT("admin_console_select_thread", {
                    fallbackKo: "왼쪽에서 문의 스레드를 선택하세요.",
                    fallbackEn: "Select an inquiry thread from the list.",
                  })}
                </AdminConsoleState>
              )}
            </AdminConsoleDetailPane>
          }
        />
      </div>
    );
  }

  // ── Inbox / default: preserve prior layout & create form (DO NOT change). ──
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4" data-admin-member-notes-console="legacy">
      <h1 className="text-lg font-semibold text-sam-fg">{pageTitle}</h1>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {showCreate ? (
        <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
          <h2 className="text-[14px] font-semibold text-sam-fg">
            {safeT("admin_member_notes_inbox_create_title", {
              fallbackKo: "Owner/회원에게 쪽지 발송",
              fallbackEn: "Send note to Owner/member",
            })}
          </h2>
          <p className="mt-1 text-[12px] text-sam-muted">
            {safeT("admin_member_notes_inbox_create_hint", {
              fallbackKo:
                "Store Owner user id 1명을 입력하세요. Owner 고객센터 → 관리자 쪽지에 바로 표시됩니다.",
              fallbackEn:
                "Enter one Store Owner user id. It appears in Owner Customer Center → Admin messages.",
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
                      {new Date(th.last_message_at).toLocaleString(locale)}
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
                      {m.sender_role} · {new Date(m.created_at).toLocaleString(locale)}
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
