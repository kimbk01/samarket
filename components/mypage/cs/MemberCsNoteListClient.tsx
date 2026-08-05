"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import type { MessageKey } from "@/lib/i18n/messages";
import type { MemberAdminNoteKind } from "@/lib/notifications/member-admin-notes";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";

type Thread = {
  id: string;
  subject: string;
  status: string;
  last_message_at: string;
  member_unread_count: number;
};

const KIND_META: Record<
  MemberAdminNoteKind,
  {
    listHref: string;
    titleKey: MessageKey;
    subtitleKey: MessageKey;
    allowCreate: boolean;
  }
> = {
  inquiry: {
    listHref: "/mypage/inquiries",
    titleKey: "mypage_cs_inquiries_title",
    subtitleKey: "mypage_cs_inquiries_subtitle",
    allowCreate: true,
  },
  inbox: {
    listHref: "/mypage/inbox",
    titleKey: "mypage_cs_inbox_title",
    subtitleKey: "mypage_cs_inbox_subtitle",
    allowCreate: false,
  },
};

export function MemberCsNoteListClient({ kind }: { kind: MemberAdminNoteKind }) {
  const { t, language, safeT } = useI18n();
  const meta = KIND_META[kind];
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const title = safeT(meta.titleKey, {
    fallbackKo: kind === "inquiry" ? "1:1 문의" : "받은 쪽지",
    fallbackEn: kind === "inquiry" ? "1:1 Inquiry" : "Inbox",
  });
  const subtitle = safeT(meta.subtitleKey, {
    fallbackKo:
      kind === "inquiry"
        ? "관리자에게 1:1로 문의합니다"
        : "관리자가 보낸 쪽지를 확인합니다",
    fallbackEn:
      kind === "inquiry"
        ? "Send a one-to-one inquiry to admin"
        : "Messages sent to you by admin",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/me/admin-notes?kind=${encodeURIComponent(kind)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        threads?: Thread[];
        error?: string;
      };
      if (!res.ok || !j.ok) {
        setError(j.error ?? t("common_content_unavailable"));
        setThreads([]);
        return;
      }
      setThreads(Array.isArray(j.threads) ? j.threads : []);
      setError(null);
    } catch {
      setError(t("common_content_unavailable"));
    } finally {
      setLoading(false);
    }
  }, [kind, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    if (busy || !meta.allowCreate) return;
    setBusy(true);
    try {
      const res = await fetch("/api/me/admin-notes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setError(j.error ?? t("common_content_unavailable"));
        return;
      }
      setSubject("");
      setBody("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const archive = async (threadId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/me/admin-notes/${encodeURIComponent(threadId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archive: true }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setError(j.error ?? t("common_content_unavailable"));
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <MySubpageHeader title={title} subtitle={subtitle} backHref="/mypage" hideCtaStrip />
      <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS}>
        <div className="mx-auto flex w-full max-w-lg min-w-0 flex-col gap-4 px-3 py-3">
          {meta.allowCreate ? (
            <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
              <h2 className="text-[13px] font-semibold text-sam-fg">
                {safeT("mypage_cs_inquiry_new", {
                  fallbackKo: "새 문의",
                  fallbackEn: "New inquiry",
                })}
              </h2>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={t("notif_admin_notes_subject_ph")}
                className="mt-2 w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 text-[14px]"
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t("notif_admin_notes_body_ph")}
                rows={4}
                className="mt-2 w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 text-[14px]"
              />
              <button
                type="button"
                disabled={busy || !subject.trim() || !body.trim()}
                onClick={() => void submit()}
                className="mt-2 w-full rounded-ui-rect bg-signature px-3 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
              >
                {t("notif_admin_notes_send")}
              </button>
            </section>
          ) : null}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {loading ? (
            <p className="text-sm text-sam-muted">{t("common_loading")}</p>
          ) : threads.length === 0 ? (
            <p className="text-sm text-sam-muted">
              {safeT("mypage_cs_notes_empty", {
                fallbackKo: "내역이 없습니다",
                fallbackEn: "No messages yet",
              })}
            </p>
          ) : (
            <ul className="space-y-2">
              {threads.map((th) => (
                <li key={th.id} className="flex items-stretch gap-2">
                  <Link
                    href={`${meta.listHref}/${encodeURIComponent(th.id)}`}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-sam-fg">
                        {th.subject}
                      </span>
                      <span className="block text-[11px] text-sam-meta">
                        {new Date(th.last_message_at).toLocaleString(
                          language === "ko" ? "ko-KR" : "en-US"
                        )}
                      </span>
                    </span>
                    {th.member_unread_count > 0 ? (
                      <span className="inline-flex min-w-[1.25rem] justify-center rounded-full bg-sam-danger px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {th.member_unread_count > 99 ? "99+" : th.member_unread_count}
                      </span>
                    ) : null}
                  </Link>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void archive(th.id)}
                    className="rounded-ui-rect border border-sam-border px-2 text-[11px] text-sam-muted disabled:opacity-50"
                  >
                    {safeT("mypage_cs_archive", {
                      fallbackKo: "보관",
                      fallbackEn: "Archive",
                    })}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
