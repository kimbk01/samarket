"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { formatAdminShortIdEllipsis } from "@/components/admin/ui/AdminTechId";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { MemberOpsListBody } from "@/components/admin/member-ops/MemberOpsListBody";
import { useMemberOpsPagedFetch } from "@/lib/admin/member-ops-list/use-member-ops-paged-fetch";
import { ADMIN_LIST_QUERY_DEFAULT_SIZE, type AdminListPageSize } from "@/lib/admin/list-query/admin-list-query";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { translateBy } from "@/lib/i18n/translate-by";

type ArchiveTab = "notes" | "platform";

type NoteThread = {
  id: string;
  subject: string;
  status: string;
  last_message_at: string;
  started_by?: string;
};

type PlatformRow = {
  id: string;
  subject: string;
  status: string;
  created_at: string;
  store_id?: string | null;
  content?: string | null;
  answer?: string | null;
  answered_at?: string | null;
};

type NoteMessage = {
  id: string;
  sender_role: "member" | "admin";
  body: string;
  created_at: string;
};

/** B8 — legacy status/role wording (archive rows never print raw enums). */
function legacyStatusLabel(status: string, ko: boolean): string {
  switch (String(status ?? "").trim()) {
    case "open":
      return translateBy(ko ? "ko" : "en", "admin_support_awaiting_reply");
    case "answered":
      return translateBy(ko ? "ko" : "en", "admin_support_answered");
    case "closed":
      return translateBy(ko ? "ko" : "en", "admin_support_closed");
    default:
      return translateBy(ko ? "ko" : "en", "admin_support_unknown");
  }
}

function startedByLabel(startedBy: string | undefined, ko: boolean): string {
  if (startedBy === "admin") return translateBy(ko ? "ko" : "en", "admin_support_admin_started");
  if (startedBy === "member") return translateBy(ko ? "ko" : "en", "admin_support_member_started");
  return "—";
}

/** B8 — read-only thread body, loaded on expand via the existing admin GET. */
function ArchiveNoteThread({ threadId, ko }: { threadId: string; ko: boolean }) {
  const [messages, setMessages] = useState<NoteMessage[] | null>(null);
  const [failed, setFailed] = useState<{ code: string; httpStatus?: number } | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setFailed(null);
      try {
        const res = await fetch(`/api/admin/member-notes/${encodeURIComponent(threadId)}`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; messages?: NoteMessage[] };
        if (cancelled) return;
        if (!res.ok || !json.ok) setFailed({ code: json.error || "load_failed", httpStatus: res.status });
        else setMessages(Array.isArray(json.messages) ? json.messages : []);
      } catch {
        if (!cancelled) setFailed({ code: "network_error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [threadId, nonce]);
  if (failed) {
    return (
      <div className="mt-2">
        <AdminErrorState ko={ko} code={failed.code} httpStatus={failed.httpStatus} onRetry={() => setNonce((n) => n + 1)} />
      </div>
    );
  }
  if (!messages) {
    return (
      <div className="mt-2">
        <AdminLoadingState ko={ko} />
      </div>
    );
  }
  return (
    <div className="mt-2 space-y-2" data-admin-archive-thread={threadId}>
      {messages.map((m) => (
        <div
          key={m.id}
          className={`rounded-ui-rect px-3 py-2 text-sm ${
            m.sender_role === "admin" ? "bg-sam-primary/10" : "bg-sam-surface-muted"
          }`}
        >
          <p className="text-xs text-sam-muted">
            {m.sender_role === "admin" ? (translateBy(ko ? "ko" : "en", "admin_support_admin")) : translateBy(ko ? "ko" : "en", "admin_support_member")} ·{" "}
            {formatAdminManilaDateTime(m.created_at)}
          </p>
          <p className="whitespace-pre-wrap">{m.body}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * A2-2 legacy Care + platform inbox — read-only archive (no reply/compose).
 */
export function AdminSupportArchivePage() {
  const { t, safeT, language } = useI18n();
  const [tab, setTab] = useState<ArchiveTab>("notes");
  const ko = language !== "en";
  const [openId, setOpenId] = useState<string | null>(null);
  /** R7 — 탭별 서버 페이지(20/50/100 + 총 건수). 예전 쪽지 200건·플랫폼 문의 300건 고정 상한 제거. 필터가 없어 쪽·크기만 화면 상태. */
  const [page, setPage] = useState(1);
  const [size, setSize] = useState<AdminListPageSize>(ADMIN_LIST_QUERY_DEFAULT_SIZE);
  const pageQs = `limit=${size}&offset=${(page - 1) * size}`;
  const notesList = useMemberOpsPagedFetch<NoteThread>(tab === "notes" ? `/api/admin/member-notes?${pageQs}` : null, "threads");
  const platformList = useMemberOpsPagedFetch<PlatformRow>(
    tab === "platform" ? `/api/admin/platform-inquiries?${pageQs}` : null,
    "inquiries"
  );
  const list = tab === "notes" ? notesList : platformList;
  const notes = notesList.rows;
  const platform = platformList.rows;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4" data-admin-support-archive="1">
      <AdminPageHeader
        title={safeT("admin_menu_cp_support_archive")}
        description={safeT("admin_support_archive_desc")}
      />
      <p className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-3 py-2 text-sm text-sam-fg">
        {safeT("admin_support_archive_readonly_hint")}
      </p>
      <div className="flex items-center gap-2">
        <AdminTabs
          className="flex-1"
          ariaLabel={safeT("admin_menu_cp_support_archive")}
          tabs={[
            { id: "notes", label: t("admin_support_notes_1_1") },
            { id: "platform", label: t("admin_support_platform_inquiries") },
          ]}
          value={tab}
          syncUrl={false}
          onChange={(id) => {
            setTab(id as ArchiveTab);
            setPage(1);
            setOpenId(null);
          }}
        />
        <Link href="/admin/support" className="ml-auto text-sm text-sam-primary underline">
          {safeT("admin_support_title")}
        </Link>
      </div>
      <MemberOpsListBody
        ko={ko}
        loading={list.loading}
        loaded={list.loaded}
        error={list.error}
        onRetry={list.reload}
        rowCount={list.rows.length}
        total={list.total}
        page={page}
        size={size}
        onPageChange={setPage}
        onSizeChange={(n) => {
          setSize(n);
          setPage(1);
        }}
      >
      {/* 표준 표 — 행의 「상세」로 아래 행에 본문(읽기 전용)을 펼친다. */}
      {tab === "notes" ? (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface px-3">
          <table className="w-full min-w-[40rem] border-collapse text-left sam-text-body-secondary">
            <thead>
              <tr className="border-b border-sam-border text-left sam-text-xxs text-sam-muted">
                <th className="py-2 pr-2 font-medium">{t("admin_support_subject")}</th>
                <th className="py-2 pr-2 font-medium">{t("admin_support_started_by")}</th>
                <th className="py-2 pr-2 font-medium">{t("admin_support_status")}</th>
                <th className="py-2 pr-2 font-medium">{t("admin_support_last_message")}</th>
                <th className="py-2 pr-2 font-medium">{adminCta("detail", ko)}</th>
              </tr>
            </thead>
            <tbody>
              {notes.map((n) => (
                <Fragment key={n.id}>
                  <tr className="border-b border-sam-border/70 align-top">
                    <td className="py-2 pr-2 font-medium text-sam-fg">{n.subject}</td>
                    <td className="py-2 pr-2 text-sam-muted">{startedByLabel(n.started_by, ko)}</td>
                    <td className="py-2 pr-2">{legacyStatusLabel(n.status, ko)}</td>
                    <td className="whitespace-nowrap py-2 pr-2 text-sam-muted">
                      {n.last_message_at ? formatAdminManilaDateTime(n.last_message_at) : ""}
                    </td>
                    <td className="py-2 pr-2">
                      <AdminActionButton
                        variant="ghost"
                        size="sm"
                        aria-expanded={openId === n.id}
                        onClick={() => setOpenId((cur) => (cur === n.id ? null : n.id))}
                      >
                        {openId === n.id ? adminCta("close", ko) : adminCta("detail", ko)}
                      </AdminActionButton>
                    </td>
                  </tr>
                  {openId === n.id ? (
                    <tr className="border-b border-sam-border/70">
                      <td colSpan={5} className="pb-3 pr-2">
                        <ArchiveNoteThread threadId={n.id} ko={ko} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface px-3">
          <table className="w-full min-w-[40rem] border-collapse text-left sam-text-body-secondary">
            <thead>
              <tr className="border-b border-sam-border text-left sam-text-xxs text-sam-muted">
                <th className="py-2 pr-2 font-medium">{t("admin_support_subject")}</th>
                <th className="py-2 pr-2 font-medium">{t("admin_support_status")}</th>
                <th className="py-2 pr-2 font-medium">{t("common_store")}</th>
                <th className="py-2 pr-2 font-medium">{t("admin_support_created")}</th>
                <th className="py-2 pr-2 font-medium">{adminCta("detail", ko)}</th>
              </tr>
            </thead>
            <tbody>
              {platform.map((r) => (
                <Fragment key={r.id}>
                  <tr className="border-b border-sam-border/70 align-top">
                    <td className="py-2 pr-2 font-medium text-sam-fg">{r.subject}</td>
                    <td className="py-2 pr-2">{legacyStatusLabel(r.status, ko)}</td>
                    <td className="py-2 pr-2 text-sam-muted">
                      {r.store_id ? formatAdminShortIdEllipsis(r.store_id) : "—"}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-2 text-sam-muted">
                      {r.created_at ? formatAdminManilaDateTime(r.created_at) : ""}
                    </td>
                    <td className="py-2 pr-2">
                      <AdminActionButton
                        variant="ghost"
                        size="sm"
                        aria-expanded={openId === r.id}
                        onClick={() => setOpenId((cur) => (cur === r.id ? null : r.id))}
                      >
                        {openId === r.id ? adminCta("close", ko) : adminCta("detail", ko)}
                      </AdminActionButton>
                    </td>
                  </tr>
                  {openId === r.id ? (
                    <tr className="border-b border-sam-border/70">
                      <td colSpan={5} className="pb-3 pr-2">
                        <div className="mt-2 space-y-2" data-admin-archive-platform={r.id}>
                          <p className="whitespace-pre-wrap rounded-ui-rect bg-sam-surface-muted px-3 py-2 text-sm">
                            {r.content || "—"}
                          </p>
                          {r.answer ? (
                            <p className="whitespace-pre-wrap rounded-ui-rect bg-sam-primary/10 px-3 py-2 text-sm">
                              {r.answer}
                            </p>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </MemberOpsListBody>
    </div>
  );
}
