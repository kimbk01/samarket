"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  OWNER_ADMIN_PRIMARY_BTN_CLASS,
  OWNER_ADMIN_LIST_CARD_CLASS,
} from "@/lib/business/owner-admin-list-ui";
import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";
import type { MemberAdminNoteKind } from "@/lib/notifications/member-admin-notes";

type Message = {
  id: string;
  sender_role: "member" | "admin";
  body: string;
  created_at: string;
};

type Thread = {
  id: string;
  subject: string;
  status?: string;
};

export function OwnerCareAdminNotesThread({ kind }: { kind: MemberAdminNoteKind }) {
  const { safeT, language } = useI18n();
  const params = useParams();
  const threadId = String(params?.threadId ?? "").trim();
  const { effectiveBottomInset, keyboardOpen } = useFormKeyboardViewport();
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
        setError(j.error ?? "load_failed");
        return;
      }
      setThread(j.thread ?? null);
      setMessages(Array.isArray(j.messages) ? j.messages : []);
      setError(null);
    } catch {
      setError("load_failed");
    }
  }, [threadId]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async () => {
    if (busy || !body.trim() || !threadId) return;
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
        setError(j.error ?? "send_failed");
        return;
      }
      setBody("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const locale = language === "ko" ? "ko-KR" : "en-US";

  return (
    <div className="flex min-h-[60vh] flex-col pb-4" data-owner-care-notes-thread={kind}>
      <div className="mb-3 min-w-0">
        <p className="truncate text-base font-semibold text-sam-fg" data-owner-care-thread-subject>
          {thread?.subject ||
            safeT("biz_care_thread_fallback", {
              fallbackKo: "관리자 대화",
              fallbackEn: "Admin conversation",
            })}
        </p>
        <p className="mt-0.5 text-xs text-sam-muted">
          {kind === "inbox"
            ? safeT("biz_care_tab_admin_messages", {
                fallbackKo: "관리자 쪽지",
                fallbackEn: "Admin messages",
              })
            : safeT("biz_care_tab_1on1", {
                fallbackKo: "1:1 문의",
                fallbackEn: "1:1 Inquiry",
              })}
          {" · "}
          {safeT("biz_care_thread_hint", {
            fallbackKo: "같은 대화에서 계속 답장합니다",
            fallbackEn: "Keep replying in this same thread",
          })}
        </p>
      </div>

      {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}

      <ul className="flex-1 space-y-2" data-owner-care-thread-history="1">
        {messages.length === 0 ? (
          <li className="text-sm text-sam-muted">…</li>
        ) : (
          messages.map((m) => (
            <li
              key={m.id}
              className={`${OWNER_ADMIN_LIST_CARD_CLASS} ${
                m.sender_role === "admin" ? "border-signature/40 bg-signature/5" : ""
              }`}
              data-owner-care-msg-role={m.sender_role}
            >
              <p className="text-[11px] font-semibold text-sam-muted">
                {m.sender_role === "admin"
                  ? safeT("biz_care_sender_admin", {
                      fallbackKo: "DIBAY 관리자",
                      fallbackEn: "DIBAY Admin",
                    })
                  : safeT("biz_care_sender_me", {
                      fallbackKo: "나 (매장 오너)",
                      fallbackEn: "Me (Store owner)",
                    })}
                {" · "}
                {new Date(m.created_at).toLocaleString(locale)}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-sam-fg">{m.body}</p>
            </li>
          ))
        )}
      </ul>

      <div
        className="sticky bottom-0 mt-3 border-t border-sam-border bg-sam-app pt-2"
        data-form-keyboard-footer="1"
        data-form-keyboard-open={keyboardOpen ? "true" : "false"}
        style={{ paddingBottom: `${Math.max(8, effectiveBottomInset)}px` }}
      >
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder={safeT("biz_care_reply_ph", {
            fallbackKo: "답장 입력",
            fallbackEn: "Write a reply",
          })}
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm"
          data-owner-care-reply-body
        />
        <button
          type="button"
          disabled={busy || !body.trim()}
          onClick={() => void send()}
          className={`mt-2 w-full ${OWNER_ADMIN_PRIMARY_BTN_CLASS}`}
          data-owner-care-reply-send
        >
          {safeT("biz_care_reply_send", {
            fallbackKo: "답장 보내기",
            fallbackEn: "Send reply",
          })}
        </button>
      </div>
    </div>
  );
}
