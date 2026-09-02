"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  OWNER_ADMIN_LIST_CARD_CLASS,
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
  readOnly = true,
}: {
  kind: MemberAdminNoteKind;
  /** e.g. /stores/owner/customer-care/messages */
  threadBasePath: string;
  /** A2-1: compose disabled — legacy archive only. */
  readOnly?: boolean;
}) {
  const { safeT, language } = useI18n();
  const sp = useSearchParams();
  const storeId = sp.get("storeId");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const locale = language === "ko" ? "ko-KR" : "en-US";
  const isInquiry = kind === "inquiry";

  return (
    <div className="space-y-4" data-owner-care-notes-list={kind} data-owner-care-readonly={readOnly ? "1" : "0"}>
      <OwnerStoreAdminDashSection
        title={
          isInquiry
            ? safeT("biz_care_inquiry_list_title", {
                fallbackKo: "이전 1:1 문의",
                fallbackEn: "Past inquiries",
              })
            : safeT("biz_care_admin_message_list_title", {
                fallbackKo: "이전 관리자 쪽지",
                fallbackEn: "Past admin messages",
              })
        }
      >
        {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
        {loading ? (
          <p className="text-sm text-sam-muted">…</p>
        ) : threads.length === 0 ? (
          <p className="text-sm text-sam-muted" data-owner-care-notes-empty="1">
            {safeT("support_legacy_archive_empty", {
              fallbackKo: "이전 기록이 없습니다.",
              fallbackEn: "No archived items.",
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
