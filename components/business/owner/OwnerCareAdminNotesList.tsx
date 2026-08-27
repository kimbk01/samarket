"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  OWNER_ADMIN_LIST_CARD_CLASS,
  OWNER_ADMIN_PRIMARY_BTN_CLASS,
  OWNER_ADMIN_OUTLINE_BTN_CLASS,
} from "@/lib/business/owner-admin-list-ui";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import type { MemberAdminNoteKind } from "@/lib/notifications/member-admin-notes";

type Thread = {
  id: string;
  subject: string;
  status: string;
  last_message_at: string;
  member_unread_count: number;
};

function statusLabel(
  status: string,
  safeT: ReturnType<typeof useI18n>["safeT"]
) {
  if (status === "open") {
    return safeT("mypage_cs_status_awaiting", {
      fallbackKo: "답변 대기",
      fallbackEn: "Awaiting reply",
    });
  }
  if (status === "answered") {
    return safeT("mypage_cs_status_answered", {
      fallbackKo: "답변 완료",
      fallbackEn: "Answered",
    });
  }
  if (status === "closed") {
    return safeT("mypage_cs_status_closed", {
      fallbackKo: "종료",
      fallbackEn: "Closed",
    });
  }
  return status || "—";
}

function withQuery(path: string, storeId: string | null, from: string) {
  const u = new URL(path, "https://local.invalid");
  if (storeId) u.searchParams.set("storeId", storeId);
  if (from) u.searchParams.set("from", from);
  const q = u.searchParams.toString();
  return q ? `${u.pathname}?${q}` : u.pathname;
}

export function OwnerCareAdminNotesList({
  kind,
  threadBasePath,
}: {
  kind: MemberAdminNoteKind;
  /** e.g. /stores/owner/customer-care/messages */
  threadBasePath: string;
}) {
  const { safeT, language } = useI18n();
  const sp = useSearchParams();
  const storeId = sp.get("storeId");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

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
        setError(j.error ?? "load_failed");
        setThreads([]);
        return;
      }
      setThreads(Array.isArray(j.threads) ? j.threads : []);
      setError(null);
    } catch {
      setError("load_failed");
      setThreads([]);
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    if (kind !== "inquiry" || busy || !subject.trim() || !body.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/me/admin-notes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), body: body.trim() }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        thread?: { id?: string };
      };
      if (!res.ok || !j.ok) {
        setError(j.error ?? "send_failed");
        return;
      }
      setSubject("");
      setBody("");
      setSuccess(true);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const locale = language === "ko" ? "ko-KR" : "en-US";
  const isInquiry = kind === "inquiry";

  return (
    <div className="space-y-4" data-owner-care-notes-list={kind}>
      {isInquiry ? (
        <OwnerStoreAdminDashSection
          title={safeT("biz_care_inquiry_compose_title", {
            fallbackKo: "1:1 문의하기",
            fallbackEn: "Write 1:1 inquiry",
          })}
        >
          {success ? (
            <div className="space-y-3" data-owner-care-inquiry-success="1">
              <p className="text-sm font-semibold text-sam-fg">
                {safeT("mypage_cs_inquiry_submitted", {
                  fallbackKo: "문의가 접수되었습니다.",
                  fallbackEn: "Your inquiry was submitted.",
                })}
              </p>
              <button
                type="button"
                className={OWNER_ADMIN_OUTLINE_BTN_CLASS}
                onClick={() => setSuccess(false)}
              >
                {safeT("mypage_cs_inquiry_view_list", {
                  fallbackKo: "문의 내역 보기",
                  fallbackEn: "View inquiries",
                })}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-sam-muted">
                {safeT("biz_care_inquiry_compose_hint", {
                  fallbackKo: "DIBAY 관리자에게 직접 문의합니다. 같은 대화에서 답장을 이어갑니다.",
                  fallbackEn: "Message DIBAY admin. Replies stay on the same thread.",
                })}
              </p>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={safeT("notif_admin_notes_subject_ph", {
                  fallbackKo: "문의 제목",
                  fallbackEn: "Subject",
                })}
                className="min-h-11 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 text-sm"
                data-owner-care-inquiry-subject
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={safeT("notif_admin_notes_body_ph", {
                  fallbackKo: "문의 내용",
                  fallbackEn: "Message",
                })}
                rows={5}
                className="w-full resize-y rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm"
                data-owner-care-inquiry-body
              />
              <button
                type="button"
                disabled={busy || !subject.trim() || !body.trim()}
                onClick={() => void submit()}
                className={OWNER_ADMIN_PRIMARY_BTN_CLASS}
                data-owner-care-inquiry-submit
              >
                {safeT("biz_care_inquiry_submit", {
                  fallbackKo: "1:1 문의하기",
                  fallbackEn: "Submit inquiry",
                })}
              </button>
            </div>
          )}
        </OwnerStoreAdminDashSection>
      ) : null}

      <OwnerStoreAdminDashSection
        title={
          isInquiry
            ? safeT("biz_care_inquiry_list_title", {
                fallbackKo: "내 1:1 문의",
                fallbackEn: "My inquiries",
              })
            : safeT("biz_care_admin_message_list_title", {
                fallbackKo: "관리자 쪽지",
                fallbackEn: "Admin messages",
              })
        }
      >
        {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
        {loading ? (
          <p className="text-sm text-sam-muted">…</p>
        ) : threads.length === 0 ? (
          <p className="text-sm text-sam-muted" data-owner-care-notes-empty="1">
            {isInquiry
              ? safeT("biz_care_inquiry_empty", {
                  fallbackKo: "아직 문의가 없습니다. 위에서 관리자에게 문의하세요.",
                  fallbackEn: "No inquiries yet. Write to admin above.",
                })
              : safeT("biz_care_admin_message_empty", {
                  fallbackKo: "아직 받은 관리자 쪽지가 없습니다.",
                  fallbackEn: "No admin messages yet.",
                })}
          </p>
        ) : (
          <ul className="space-y-2">
            {threads.map((th) => {
              const href = withQuery(`${threadBasePath}/${encodeURIComponent(th.id)}`, storeId, "owner-care");
              return (
                <li key={th.id}>
                  <Link
                    href={href}
                    className={`${OWNER_ADMIN_LIST_CARD_CLASS} flex items-center gap-2`}
                    data-owner-care-note-row={th.id}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-sam-fg">{th.subject}</span>
                      <span className="mt-0.5 block text-xs text-sam-muted">
                        {th.last_message_at ? new Date(th.last_message_at).toLocaleString(locale) : "—"}
                        {" · "}
                        {statusLabel(th.status, safeT)}
                      </span>
                    </span>
                    {th.member_unread_count > 0 ? (
                      <span className="inline-flex min-w-[1.25rem] justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {th.member_unread_count > 99 ? "99+" : th.member_unread_count}
                      </span>
                    ) : null}
                    <ChevronRight className="h-4 w-4 shrink-0 text-sam-muted" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </OwnerStoreAdminDashSection>
    </div>
  );
}
