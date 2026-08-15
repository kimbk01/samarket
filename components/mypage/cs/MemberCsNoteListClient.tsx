"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import type { MessageKey } from "@/lib/i18n/messages";
import type { MemberAdminNoteKind } from "@/lib/notifications/member-admin-notes";
import { resolveCustomerCenterBackHref, withCustomerCenterFrom } from "@/lib/mypage/customer-center-paths";
import {
  CUSTOMER_CENTER_FORM_COLUMN_CLASS,
  CUSTOMER_CENTER_LIST_COLUMN_CLASS,
  CUSTOMER_CENTER_PAGE_SHELL_CLASS,
  CUSTOMER_CENTER_SCROLL_BODY_CLASS,
} from "@/lib/mypage/customer-center-layout";
import {
  CC_BODY_CLASS,
  CC_CARD_CLASS,
  CC_HEADER_CLASS,
  CC_NOTE_CLASS,
  CC_PRIMARY_BTN_CLASS,
  CC_SURFACE_PAGE_CLASS,
} from "@/lib/mypage/customer-center-ui";
import { MobileConfirmBottomSheet } from "@/components/ui/MobileConfirmBottomSheet";
import { DibayActionSheet } from "@/components/ui/dibay-overlay";

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
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const backHref = resolveCustomerCenterBackHref(from);
  const meta = KIND_META[kind];
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [typeSheetOpen, setTypeSheetOpen] = useState(false);

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
    if (busy || !meta.allowCreate || !subject.trim() || !body.trim()) return;
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
        setError(j.error ?? t("common_content_unavailable"));
        return;
      }
      const createdId = String(j.thread?.id ?? "").trim();
      setSubject("");
      setBody("");
      if (createdId) {
        window.location.assign(
          withCustomerCenterFrom(`${meta.listHref}/${encodeURIComponent(createdId)}`, from),
        );
        return;
      }
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
      setArchiveId(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const inquiryTypes = [
    {
      label: safeT("mypage_cs_inquiry_type_account", {
        fallbackKo: "계정/로그인",
        fallbackEn: "Account / login",
      }),
    },
    {
      label: safeT("mypage_cs_inquiry_type_points", {
        fallbackKo: "D-Point/충전",
        fallbackEn: "D-Point / charge",
      }),
    },
    {
      label: safeT("mypage_cs_inquiry_type_trade", {
        fallbackKo: "거래/주문",
        fallbackEn: "Trade / order",
      }),
    },
    {
      label: safeT("mypage_cs_inquiry_type_other", {
        fallbackKo: "기타",
        fallbackEn: "Other",
      }),
    },
  ];

  const fieldClass =
    "mt-2 min-h-11 w-full rounded-xl border border-[rgba(14,92,58,0.14)] bg-[#F5F7F6] px-3.5 py-2.5 text-[14px] text-[#1A2E24] outline-none ring-[#0E5C3A]/25 focus:ring-2";

  return (
    <div className={`${CUSTOMER_CENTER_PAGE_SHELL_CLASS} ${CC_SURFACE_PAGE_CLASS}`}>
      <MySubpageHeader title={title} subtitle={subtitle} backHref={backHref} preferHistoryBack={false} hideCtaStrip />
      <div className={CUSTOMER_CENTER_SCROLL_BODY_CLASS}>
        <div className={`${CUSTOMER_CENTER_LIST_COLUMN_CLASS} gap-4 px-3 sm:px-4`}>
          {meta.allowCreate ? (
            <section className={`${CUSTOMER_CENTER_FORM_COLUMN_CLASS} ${CC_CARD_CLASS} space-y-1 p-4 !px-4`}>
              <h2 className={CC_HEADER_CLASS}>
                {safeT("mypage_cs_inquiry_new", {
                  fallbackKo: "1:1 문의 작성",
                  fallbackEn: "Write 1:1 inquiry",
                })}
              </h2>
              <button
                type="button"
                onClick={() => setTypeSheetOpen(true)}
                className={`${fieldClass} text-left ${subject.trim() ? "text-[#1A2E24]" : "text-[#8F9D95]"}`}
              >
                {subject.trim()
                  ? subject
                  : safeT("mypage_cs_inquiry_pick_type", {
                      fallbackKo: "문의 유형 선택",
                      fallbackEn: "Choose inquiry type",
                    })}
              </button>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={safeT("notif_admin_notes_subject_ph", {
                  fallbackKo: "제목",
                  fallbackEn: "Title",
                })}
                className={fieldClass}
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={safeT("notif_admin_notes_body_ph", {
                  fallbackKo: "문의 내용을 입력하세요",
                  fallbackEn: "Enter your inquiry",
                })}
                rows={6}
                className={`${fieldClass} min-h-[9rem] resize-y`}
              />
              <button
                type="button"
                disabled={busy || !subject.trim() || !body.trim()}
                onClick={() => void submit()}
                className={`mt-3 ${CC_PRIMARY_BTN_CLASS}`}
              >
                {safeT("notif_admin_notes_send", {
                  fallbackKo: "보내기",
                  fallbackEn: "Send",
                })}
              </button>
            </section>
          ) : null}

          {error ? <p className={`${CC_BODY_CLASS} text-red-600`}>{error}</p> : null}
          {loading ? (
            <p className={CC_NOTE_CLASS}>{t("common_loading")}</p>
          ) : threads.length === 0 ? (
            <p className={CC_NOTE_CLASS}>
              {safeT("mypage_cs_notes_empty", {
                fallbackKo: "내역이 없습니다",
                fallbackEn: "No messages yet",
              })}
            </p>
          ) : (
            <ul className={CC_CARD_CLASS}>
              {threads.map((th, index) => (
                <li
                  key={th.id}
                  className={`flex items-stretch gap-2 px-3 py-2 ${
                    index === 0 ? "" : "border-t border-[rgba(14,92,58,0.08)]"
                  }`}
                >
                  <Link
                    href={withCustomerCenterFrom(
                      `${meta.listHref}/${encodeURIComponent(th.id)}`,
                      from,
                    )}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-2 py-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate ${CC_HEADER_CLASS}`}>{th.subject}</span>
                      <span className={`mt-0.5 block ${CC_NOTE_CLASS}`}>
                        {new Date(th.last_message_at).toLocaleString(
                          language === "ko" ? "ko-KR" : "en-US",
                        )}
                        {th.status ? ` · ${th.status}` : ""}
                      </span>
                    </span>
                    {th.member_unread_count > 0 ? (
                      <span className="inline-flex min-w-[1.25rem] justify-center rounded-full bg-[#F57F76] px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {th.member_unread_count > 99 ? "99+" : th.member_unread_count}
                      </span>
                    ) : null}
                  </Link>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setArchiveId(th.id)}
                    className="min-h-11 shrink-0 rounded-xl border border-[rgba(14,92,58,0.14)] px-2.5 text-[11px] text-[#8F9D95] disabled:opacity-50"
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

      <MobileConfirmBottomSheet
        open={!!archiveId}
        onCancel={() => setArchiveId(null)}
        title={safeT("mypage_cs_archive_confirm_title", {
          fallbackKo: "쪽지를 보관할까요?",
          fallbackEn: "Archive this thread?",
        })}
        description={safeT("mypage_cs_archive_confirm_body", {
          fallbackKo: "목록에서 숨겨집니다.",
          fallbackEn: "It will be hidden from the list.",
        })}
        cancelLabel={t("common_cancel")}
        confirmLabel={safeT("mypage_cs_archive", {
          fallbackKo: "보관",
          fallbackEn: "Archive",
        })}
        onConfirm={() => {
          if (archiveId) void archive(archiveId);
        }}
      />

      {meta.allowCreate ? (
        <DibayActionSheet
          open={typeSheetOpen}
          onClose={() => setTypeSheetOpen(false)}
          title={safeT("mypage_cs_inquiry_pick_type", {
            fallbackKo: "문의 유형 선택",
            fallbackEn: "Choose inquiry type",
          })}
          cancelLabel={t("common_close")}
          anchor="above-bottom-nav"
          items={inquiryTypes.map((item) => ({
            key: item.label,
            label: item.label,
            onClick: () => {
              setSubject(item.label);
            },
          }))}
        />
      ) : null}
    </div>
  );
}
