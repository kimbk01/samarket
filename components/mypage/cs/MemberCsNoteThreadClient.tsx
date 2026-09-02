"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
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

/** A2-1: legacy note thread = read-only archive (no reply composer). */
export function MemberCsNoteThreadClient({
  kind,
  listBasePath,
  hideChrome = false,
}: {
  kind: MemberAdminNoteKind;
  listBasePath?: string;
  hideChrome?: boolean;
}) {
  const { t, language, safeT } = useI18n();
  const params = useParams();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? (listBasePath ? "owner-care" : null);
  const threadId = String(params?.threadId ?? "").trim();
  const defaultList = kind === "inbox" ? "/mypage/inbox" : "/mypage/inquiries";
  const listHref = withCustomerCenterFrom(listBasePath?.trim() || defaultList, from);
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

  return (
    <div className={CUSTOMER_CENTER_PAGE_SHELL_CLASS}>
      {hideChrome ? null : (
        <MySubpageHeader
          title={
            thread?.subject ??
            safeT("support_legacy_archive_title", {
              fallbackKo: "이전 문의 기록",
              fallbackEn: "Previous inquiry archive",
            })
          }
          backHref={listHref}
          preferHistoryBack={false}
          hideCtaStrip
        />
      )}
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
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface-muted px-3 py-3 text-sm text-sam-muted">
            {safeT("support_legacy_archive_hint", {
              fallbackKo:
                "이전 쪽지·1:1 문의 기록입니다. 새 문의는 고객센터 문의하기를 이용해 주세요.",
              fallbackEn:
                "Archive of past notes and 1:1 inquiries. For new help, use Contact us in Customer support.",
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
