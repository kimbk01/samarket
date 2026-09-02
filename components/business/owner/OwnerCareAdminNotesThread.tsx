"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OWNER_ADMIN_LIST_CARD_CLASS } from "@/lib/business/owner-admin-list-ui";
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

/** A2-1: legacy Care thread = read-only archive (no reply composer). */
export function OwnerCareAdminNotesThread({ kind }: { kind: MemberAdminNoteKind }) {
  const { safeT, language } = useI18n();
  const params = useParams();
  const threadId = String(params?.threadId ?? "").trim();
  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
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

  const locale = language === "ko" ? "ko-KR" : "en-US";

  return (
    <div className="flex min-h-[60vh] flex-col pb-4" data-owner-care-notes-thread={kind}>
      <div className="mb-3 min-w-0">
        <p className="truncate text-base font-semibold text-sam-fg" data-owner-care-thread-subject>
          {thread?.subject ||
            safeT("support_legacy_archive_title", {
              fallbackKo: "이전 문의 기록",
              fallbackEn: "Previous inquiry archive",
            })}
        </p>
        <p className="mt-0.5 text-xs text-sam-muted">
          {safeT("support_legacy_archive_hint", {
            fallbackKo:
              "이전 쪽지·1:1 문의 기록입니다. 새 문의는 고객센터 문의하기를 이용해 주세요.",
            fallbackEn:
              "Archive of past notes and 1:1 inquiries. For new help, use Contact us.",
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
    </div>
  );
}
