"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import type { MessageKey } from "@/lib/i18n/messages";
import type { MemberAdminNoteKind } from "@/lib/notifications/member-admin-notes";
import { withCustomerCenterFrom } from "@/lib/mypage/customer-center-paths";
import {
  CUSTOMER_CENTER_FORM_COLUMN_CLASS,
  CUSTOMER_CENTER_PAGE_SHELL_CLASS,
  CUSTOMER_CENTER_SCROLL_BODY_CLASS,
} from "@/lib/mypage/customer-center-layout";

type Message = {
  id: string;
  sender_role: "member" | "admin";
  body: string;
  created_at: string;
};

type Thread = {
  id: string;
  subject: string;
};

export function MemberCsNoteThreadClient({ kind }: { kind: MemberAdminNoteKind }) {
  const { t, language, safeT } = useI18n();
  const params = useParams();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const threadId = String(params?.threadId ?? "").trim();
  const listHref = withCustomerCenterFrom(
    kind === "inbox" ? "/mypage/inbox" : "/mypage/inquiries",
    from,
  );
  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!threadId) return;
    try {
      const res = await fetch(`/api/me/admin-notes/${encodeURIComponent(threadId)}`, {
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
        setError(j.error ?? t("common_content_unavailable"));
        return;
      }
      setThread(j.thread ?? null);
      setMessages(Array.isArray(j.messages) ? j.messages : []);
      setError(null);
    } catch {
      setError(t("common_content_unavailable"));
    }
  }, [t, threadId]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async () => {
    if (busy || !body.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/me/admin-notes/${encodeURIComponent(threadId)}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim() }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setError(j.error ?? t("common_content_unavailable"));
        return;
      }
      setBody("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={CUSTOMER_CENTER_PAGE_SHELL_CLASS}>
      <MySubpageHeader
        title={
          thread?.subject ??
          safeT(
            (kind === "inbox" ? "mypage_cs_inbox_title" : "mypage_cs_inquiries_title") as MessageKey,
            {
              fallbackKo: kind === "inbox" ? "받은 쪽지" : "1:1 문의",
              fallbackEn: kind === "inbox" ? "Inbox" : "1:1 Inquiry",
            },
          )
        }
        backHref={listHref}
        preferHistoryBack={false}
        hideCtaStrip
      />
      <div className={CUSTOMER_CENTER_SCROLL_BODY_CLASS}>
        <div className={`${CUSTOMER_CENTER_FORM_COLUMN_CLASS} flex flex-col gap-3 py-3`}>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <ul className="space-y-2">
            {messages.map((m) => (
              <li
                key={m.id}
                className={`rounded-ui-rect border px-3 py-2 ${
                  m.sender_role === "admin"
                    ? "border-signature/30 bg-signature/5"
                    : "border-sam-border bg-sam-surface"
                }`}
              >
                <p className="text-[11px] font-semibold text-sam-muted">
                  {m.sender_role === "admin"
                    ? t("notif_admin_notes_from_admin")
                    : t("notif_admin_notes_from_me")}
                  {" · "}
                  {new Date(m.created_at).toLocaleString(language === "ko" ? "ko-KR" : "en-US")}
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-[14px] text-sam-fg">{m.body}</p>
              </li>
            ))}
          </ul>
          <div className="sticky bottom-0 border-t border-sam-border bg-sam-app pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder={t("notif_admin_notes_reply_ph")}
              className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[14px]"
            />
            <button
              type="button"
              disabled={busy || !body.trim()}
              onClick={() => void send()}
              className="mt-2 min-h-11 w-full rounded-ui-rect bg-signature px-3 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
            >
              {t("notif_admin_notes_send")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
