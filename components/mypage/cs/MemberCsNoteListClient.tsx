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
  CUSTOMER_CENTER_LIST_COLUMN_CLASS,
  CUSTOMER_CENTER_PAGE_SHELL_CLASS,
  CUSTOMER_CENTER_SCROLL_BODY_CLASS,
} from "@/lib/mypage/customer-center-layout";
import {
  CC_BODY_CLASS,
  CC_CARD_CLASS,
  CC_HEADER_CLASS,
  CC_NOTE_CLASS,
  CC_SURFACE_PAGE_CLASS,
} from "@/lib/mypage/customer-center-ui";
import { MobileConfirmBottomSheet } from "@/components/ui/MobileConfirmBottomSheet";

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
  }
> = {
  inquiry: {
    listHref: "/mypage/inquiries",
    titleKey: "support_legacy_archive_title",
    subtitleKey: "support_legacy_archive_hint",
  },
  inbox: {
    listHref: "/mypage/inbox",
    titleKey: "support_legacy_archive_title",
    subtitleKey: "support_legacy_archive_hint",
  },
};

/** A2-1: legacy list = read-only archive (no compose). */
export function MemberCsNoteListClient({
  kind,
  listBasePath,
  hideChrome = false,
}: {
  kind: MemberAdminNoteKind;
  /** Owner Care embed — e.g. `/stores/owner/customer-care/messages` */
  listBasePath?: string;
  hideChrome?: boolean;
}) {
  const { t, language, safeT } = useI18n();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? (listBasePath ? "owner-care" : null);
  const storeId = searchParams.get("storeId");
  const backHref = resolveCustomerCenterBackHref(from, "/mypage", storeId);
  const meta = KIND_META[kind];
  const listHref = listBasePath?.trim() || meta.listHref;
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [archiveId, setArchiveId] = useState<string | null>(null);

  const title = safeT(meta.titleKey, {
    fallbackKo: "이전 문의 기록",
    fallbackEn: "Previous inquiry archive",
  });
  const subtitle = safeT(meta.subtitleKey, {
    fallbackKo:
      "이전 쪽지·1:1 문의 기록입니다. 새 문의는 고객센터 문의하기를 이용해 주세요.",
    fallbackEn:
      "Archive of past notes and 1:1 inquiries. For new help, use Contact us in Customer support.",
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

  return (
    <div className={`${CUSTOMER_CENTER_PAGE_SHELL_CLASS} ${CC_SURFACE_PAGE_CLASS}`}>
      {hideChrome ? null : (
        <MySubpageHeader title={title} subtitle={subtitle} backHref={backHref} preferHistoryBack={false} hideCtaStrip />
      )}
      <div className={CUSTOMER_CENTER_SCROLL_BODY_CLASS}>
        <div className={`${CUSTOMER_CENTER_LIST_COLUMN_CLASS} gap-4 px-3 sm:px-4`}>
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
                      `${listHref}/${encodeURIComponent(th.id)}`,
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
                        {" · "}
                        {th.status === "open"
                          ? safeT("mypage_cs_status_awaiting", {
                              fallbackKo: "답변 대기",
                              fallbackEn: "Awaiting reply",
                            })
                          : th.status === "answered"
                            ? safeT("mypage_cs_status_answered", {
                                fallbackKo: "답변 완료",
                                fallbackEn: "Answered",
                              })
                            : th.status === "closed"
                              ? safeT("mypage_cs_status_closed", {
                                  fallbackKo: "종료",
                                  fallbackEn: "Closed",
                                })
                              : th.status}
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
    </div>
  );
}
