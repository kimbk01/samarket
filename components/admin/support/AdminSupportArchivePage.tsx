"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { formatAdminShortIdEllipsis } from "@/components/admin/ui/AdminTechId";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

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
      return ko ? "답변 대기" : "Awaiting reply";
    case "answered":
      return ko ? "답변 완료" : "Answered";
    case "closed":
      return ko ? "종료" : "Closed";
    default:
      return ko ? "확인 필요" : "Unknown";
  }
}

function startedByLabel(startedBy: string | undefined, ko: boolean): string {
  if (startedBy === "admin") return ko ? "관리자 발신" : "Admin-started";
  if (startedBy === "member") return ko ? "회원·사장님 문의" : "Member-started";
  return "—";
}

/** 행 펼침 토글 — 버튼 부품(높이 고정·한 줄)으로는 여러 줄 행을 그릴 수 없어 키보드 지원 role=button 으로 그린다. */
function ArchiveRowToggle({
  expanded,
  onToggle,
  children,
}: {
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className="w-full cursor-pointer text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sam-primary"
      aria-expanded={expanded}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      {children}
    </div>
  );
}

/** B8 — read-only thread body, loaded on expand via the existing admin GET. */
function ArchiveNoteThread({ threadId, ko }: { threadId: string; ko: boolean }) {
  const [messages, setMessages] = useState<NoteMessage[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/member-notes/${encodeURIComponent(threadId)}`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; messages?: NoteMessage[] };
        if (cancelled) return;
        if (!res.ok || !json.ok) setFailed(true);
        else setMessages(Array.isArray(json.messages) ? json.messages : []);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [threadId]);
  if (failed) {
    return <p className="mt-2 text-xs text-sam-danger" role="alert">{ko ? "대화를 불러오지 못했습니다" : "Could not load"}</p>;
  }
  if (!messages) return <p className="mt-2 text-xs text-sam-muted">…</p>;
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
            {m.sender_role === "admin" ? (ko ? "관리자" : "Admin") : ko ? "회원·사장님" : "Member"} ·{" "}
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
  const { safeT, language } = useI18n();
  const [tab, setTab] = useState<ArchiveTab>("notes");
  const [notes, setNotes] = useState<NoteThread[]>([]);
  const [platform, setPlatform] = useState<PlatformRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ko = language !== "en";
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [notesRes, platRes] = await Promise.all([
        fetch("/api/admin/member-notes", { credentials: "include", cache: "no-store" }),
        fetch("/api/admin/platform-inquiries", { credentials: "include", cache: "no-store" }),
      ]);
      const notesJson = (await notesRes.json().catch(() => ({}))) as {
        ok?: boolean;
        threads?: NoteThread[];
        error?: string;
      };
      const platJson = (await platRes.json().catch(() => ({}))) as {
        ok?: boolean;
        rows?: PlatformRow[];
        inquiries?: PlatformRow[];
        error?: string;
      };
      if (!notesRes.ok || !notesJson.ok) {
        setError(notesJson.error ?? "notes_load_failed");
      } else {
        setNotes(Array.isArray(notesJson.threads) ? notesJson.threads : []);
      }
      if (platRes.ok && platJson.ok) {
        const rows = platJson.rows ?? platJson.inquiries ?? [];
        setPlatform(Array.isArray(rows) ? rows : []);
      } else {
        // DEF-07: platform archive failure must not look like an empty archive.
        setError((prev) => prev ?? platJson.error ?? "platform_load_failed");
      }
    } catch {
      setError("network_error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4" data-admin-support-archive="1">
      <AdminPageHeader
        title={safeT("admin_menu_cp_support_archive", {
          fallbackKo: "이전 문의 기록",
          fallbackEn: "Previous inquiry archive",
        })}
        description={safeT("admin_support_archive_desc", {
          fallbackKo: "레거시 쪽지·1:1·플랫폼 문의 보관. 읽기 전용입니다.",
          fallbackEn: "Legacy notes and platform inquiries. Read-only archive.",
        })}
      />
      <p className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-3 py-2 text-sm text-sam-fg">
        {safeT("admin_support_archive_readonly_hint", {
          fallbackKo: "신규 문의는 「고객센터」에서 처리합니다. 여기에서는 답변·작성할 수 없습니다.",
          fallbackEn: "New support is handled in Support Center. This archive cannot reply or compose.",
        })}
      </p>
      <div className="flex items-center gap-2">
        <AdminTabs
          className="flex-1"
          ariaLabel={safeT("admin_menu_cp_support_archive", {
            fallbackKo: "이전 문의 기록",
            fallbackEn: "Previous inquiry archive",
          })}
          tabs={[
            { id: "notes", label: ko ? "쪽지·1:1" : "Notes / 1:1" },
            { id: "platform", label: ko ? "플랫폼 문의" : "Platform inquiries" },
          ]}
          value={tab}
          syncUrl={false}
          onChange={(id) => setTab(id as ArchiveTab)}
        />
        <Link href="/admin/support" className="ml-auto text-sm text-sam-primary underline">
          {safeT("admin_support_title", { fallbackKo: "고객센터", fallbackEn: "Support Center" })}
        </Link>
      </div>
      {!loading && error ? <AdminErrorState ko={ko} code={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <AdminLoadingState ko={ko} />
      ) : tab === "notes" ? (
        notes.length === 0 ? (
          error ? null : <AdminEmptyState ko={ko} />
        ) : (
        <ul className="divide-y divide-sam-border rounded-ui-rect border border-sam-border bg-sam-surface">
          {notes.map((n) => (
              <li key={n.id} className="px-3 py-3">
                <ArchiveRowToggle
                  expanded={openId === n.id}
                  onToggle={() => setOpenId((cur) => (cur === n.id ? null : n.id))}
                >
                  <p className="text-sm font-medium">{n.subject}</p>
                  <p className="text-xs text-sam-muted">
                    {startedByLabel(n.started_by, ko)} · {legacyStatusLabel(n.status, ko)} ·{" "}
                    {n.last_message_at ? formatAdminManilaDateTime(n.last_message_at) : ""}
                  </p>
                </ArchiveRowToggle>
                {openId === n.id ? <ArchiveNoteThread threadId={n.id} ko={ko} /> : null}
              </li>
            ))}
        </ul>
        )
      ) : platform.length === 0 ? (
        error ? null : <AdminEmptyState ko={ko} />
      ) : (
        <ul className="divide-y divide-sam-border rounded-ui-rect border border-sam-border bg-sam-surface">
          {platform.map((r) => (
              <li key={r.id} className="px-3 py-3">
                <ArchiveRowToggle
                  expanded={openId === r.id}
                  onToggle={() => setOpenId((cur) => (cur === r.id ? null : r.id))}
                >
                  <p className="text-sm font-medium">{r.subject}</p>
                  <p className="text-xs text-sam-muted">
                    {legacyStatusLabel(r.status, ko)}
                    {r.store_id ? ` · ${ko ? "매장" : "Store"} ${formatAdminShortIdEllipsis(r.store_id)}` : ""} ·{" "}
                    {r.created_at ? formatAdminManilaDateTime(r.created_at) : ""}
                  </p>
                </ArchiveRowToggle>
                {openId === r.id ? (
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
                ) : null}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
