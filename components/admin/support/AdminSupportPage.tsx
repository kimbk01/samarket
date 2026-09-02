"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type {
  SupportCasePriority,
  SupportCaseRow,
  SupportMessageRow,
} from "@/lib/support/support-case-types";
import type { AdminSupportListFilter } from "@/lib/support/support-case-service";

const FILTERS: { id: AdminSupportListFilter; labelKo: string; labelEn: string }[] = [
  { id: "ALL", labelKo: "전체", labelEn: "All" },
  { id: "MEMBER", labelKo: "회원", labelEn: "Member" },
  { id: "OWNER", labelKo: "매장 Owner", labelEn: "Owner" },
  { id: "UNASSIGNED", labelKo: "미배정", labelEn: "Unassigned" },
  { id: "WAITING_ADMIN", labelKo: "답변 대기", labelEn: "Waiting admin" },
  { id: "WAITING_USER", labelKo: "사용자 답변 대기", labelEn: "Waiting user" },
  { id: "RESOLVED", labelKo: "종료", labelEn: "Resolved" },
];

const PRIORITIES: { id: SupportCasePriority; labelKo: string; labelEn: string }[] = [
  { id: "NORMAL", labelKo: "일반", labelEn: "Normal" },
  { id: "HIGH", labelKo: "높음", labelEn: "High" },
  { id: "URGENT", labelKo: "긴급", labelEn: "Urgent" },
];

function AdminSupportPageInner({ initialCaseId }: { initialCaseId?: string }) {
  const { safeT } = useI18n();
  const searchParams = useSearchParams();
  const filterParam = (searchParams.get("filter")?.trim().toUpperCase() ??
    "ALL") as AdminSupportListFilter;
  const [filter, setFilter] = useState<AdminSupportListFilter>(
    FILTERS.some((f) => f.id === filterParam) ? filterParam : "ALL"
  );
  const [search, setSearch] = useState("");
  const [cases, setCases] = useState<SupportCaseRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(initialCaseId ?? null);
  const [messages, setMessages] = useState<SupportMessageRow[]>([]);
  const [activeCase, setActiveCase] = useState<SupportCaseRow | null>(null);
  const [reply, setReply] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selfAdminId = getCurrentUser()?.id?.trim() || "";

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filter !== "ALL") qs.set("filter", filter);
      if (search.trim()) qs.set("search", search.trim());
      const res = await fetch(`/api/admin/support/cases?${qs.toString()}`, {
        credentials: "include",
      });
      const json = (await res.json()) as { ok?: boolean; cases?: SupportCaseRow[] };
      setCases(json.cases ?? []);
    } finally {
      setListLoading(false);
    }
  }, [filter, search]);

  const loadDetail = useCallback(async (caseId: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/support/cases/${encodeURIComponent(caseId)}`, {
        credentials: "include",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        case?: SupportCaseRow;
        messages?: SupportMessageRow[];
        error?: string;
      };
      if (!res.ok || !json.ok || !json.case) {
        setError(json.error ?? "load_failed");
        return;
      }
      setActiveCase(json.case);
      setMessages(json.messages ?? []);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (initialCaseId) setActiveId(initialCaseId);
  }, [initialCaseId]);

  useEffect(() => {
    const next = (searchParams.get("filter")?.trim().toUpperCase() ??
      "ALL") as AdminSupportListFilter;
    if (FILTERS.some((f) => f.id === next)) setFilter(next);
  }, [searchParams]);

  useEffect(() => {
    if (!activeId) {
      setActiveCase(null);
      setMessages([]);
      return;
    }
    void loadDetail(activeId);
  }, [activeId, loadDetail]);

  useEffect(() => {
    if (!activeId) return;
    const sb = getSupabaseClient();
    if (!sb) return;
    const channel = sb
      .channel(`admin-support-${activeId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `case_id=eq.${activeId}`,
        },
        () => {
          void loadDetail(activeId);
          void loadList();
        }
      )
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [activeId, loadDetail, loadList]);

  const patchCase = async (payload: Record<string, unknown>) => {
    if (!activeId || busy) return false;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/support/cases/${encodeURIComponent(activeId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "action_failed");
        return false;
      }
      await loadDetail(activeId);
      await loadList();
      return true;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4" data-admin-support-ssot="1">
      <AdminPageHeader
        title={safeT("admin_support_title", {
          fallbackKo: "고객센터",
          fallbackEn: "Support Center",
        })}
        description={safeT("admin_support_desc", {
          fallbackKo: "회원·매장 Owner 문의 SSOT",
          fallbackEn: "Canonical member and owner support inbox",
        })}
      />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filter === f.id
                ? "bg-sam-primary text-white"
                : "border border-sam-border bg-sam-surface text-sam-fg"
            }`}
          >
            {safeT(`admin_support_filter_${f.id.toLowerCase()}` as "admin_support_filter_all", {
              fallbackKo: f.labelKo,
              fallbackEn: f.labelEn,
            })}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={safeT("admin_support_search_placeholder", {
            fallbackKo: "케이스 번호·제목 검색",
            fallbackEn: "Search case no or subject",
          })}
          className="min-h-9 flex-1 rounded-ui-rect border border-sam-border bg-sam-surface px-3 text-sm"
        />
        <button
          type="button"
          className="min-h-9 rounded-ui-rect border border-sam-border bg-sam-surface px-3 text-sm font-medium"
          onClick={() => void loadList()}
        >
          {safeT("common_search", { fallbackKo: "검색", fallbackEn: "Search" })}
        </button>
      </div>

      <div className="grid min-h-[32rem] flex-1 gap-3 lg:grid-cols-[340px_1fr]">
        <div className="overflow-y-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          {listLoading ? (
            <p className="p-4 text-sm text-sam-muted">…</p>
          ) : cases.length === 0 ? (
            <p className="p-4 text-sm text-sam-muted">—</p>
          ) : (
            <ul className="divide-y divide-sam-border">
              {cases.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(c.id)}
                    className={`w-full px-3 py-3 text-left hover:bg-sam-surface-muted ${
                      activeId === c.id ? "bg-sam-surface-muted" : ""
                    }`}
                    data-admin-support-row={c.id}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-sam-primary">
                        {c.public_case_no}
                      </span>
                      <span className="rounded-full bg-sam-surface-muted px-2 py-0.5 text-[10px] font-bold">
                        {c.audience}
                      </span>
                      {Number(c.admin_unread_count) > 0 ? (
                        <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {c.admin_unread_count}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm font-medium">{c.subject}</p>
                    <p className="text-[11px] text-sam-muted">
                      {c.category}
                      {c.audience === "OWNER" && c.owner_store_id
                        ? ` · Store ${c.owner_store_id.slice(0, 8)}…`
                        : ""}
                      {" · "}
                      {c.priority}
                      {" · "}
                      {c.status}
                      {!c.assigned_admin_id ? " · 미배정" : ""}
                    </p>
                    <p className="text-[10px] text-sam-muted">
                      {c.last_message_at ? new Date(c.last_message_at).toLocaleString() : ""}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex min-h-0 flex-col rounded-ui-rect border border-sam-border bg-sam-surface p-3">
          {!activeId ? (
            <p className="text-sm text-sam-muted">← select a case</p>
          ) : detailLoading ? (
            <p className="text-sm text-sam-muted">…</p>
          ) : !activeCase ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : (
            <>
              <div className="border-b border-sam-border pb-3">
                <h2 className="text-lg font-semibold">
                  {activeCase.public_case_no} · {activeCase.subject}
                </h2>
                <p className="text-xs text-sam-muted">
                  {activeCase.audience} · {activeCase.category} · {activeCase.status} ·{" "}
                  {activeCase.priority}
                  {activeCase.reference_type
                    ? ` · ${activeCase.reference_type}${
                        activeCase.reference_id
                          ? `:${String(activeCase.reference_id).slice(0, 8)}`
                          : ""
                      }`
                    : ""}
                </p>
                <p className="mt-1 text-xs text-sam-muted">
                  {safeT("admin_support_assignee_label", {
                    fallbackKo: "담당자",
                    fallbackEn: "Assignee",
                  })}
                  {": "}
                  {activeCase.assigned_admin_id
                    ? activeCase.assigned_admin_id === selfAdminId
                      ? safeT("admin_support_assignee_self", {
                          fallbackKo: "나",
                          fallbackEn: "Me",
                        })
                      : `${activeCase.assigned_admin_id.slice(0, 8)}…`
                    : safeT("admin_support_unassigned", {
                        fallbackKo: "미배정",
                        fallbackEn: "Unassigned",
                      })}
                </p>
                {activeCase.owner_store_id ? (
                  <Link
                    href={`/admin/stores/orders/by-store/${encodeURIComponent(activeCase.owner_store_id)}`}
                    className="text-xs text-sam-primary underline"
                  >
                    {safeT("admin_support_open_store", {
                      fallbackKo: "매장 관리 열기",
                      fallbackEn: "Open store",
                    })}
                  </Link>
                ) : null}
                {error ? <p className="mt-1 text-sm text-red-600">{error}</p> : null}
              </div>

              <div className="my-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy || !selfAdminId}
                  className="min-h-9 rounded-ui-rect border border-sam-border px-3 text-sm disabled:opacity-50"
                  data-admin-support-assign-self="1"
                  onClick={() =>
                    void patchCase({ action: "assign", assigneeAdminId: selfAdminId })
                  }
                >
                  {safeT("admin_support_assign_self", {
                    fallbackKo: "나에게 배정",
                    fallbackEn: "Assign to me",
                  })}
                </button>
                <button
                  type="button"
                  disabled={busy || !activeCase.assigned_admin_id}
                  className="min-h-9 rounded-ui-rect border border-sam-border px-3 text-sm disabled:opacity-50"
                  onClick={() => void patchCase({ action: "assign", assigneeAdminId: null })}
                >
                  {safeT("admin_support_unassign", {
                    fallbackKo: "배정 해제",
                    fallbackEn: "Unassign",
                  })}
                </button>
                <label className="flex items-center gap-1 text-xs text-sam-muted">
                  {safeT("admin_support_priority_label", {
                    fallbackKo: "우선순위",
                    fallbackEn: "Priority",
                  })}
                  <select
                    className="min-h-9 rounded-ui-rect border border-sam-border bg-sam-surface px-2 text-sm text-sam-fg"
                    value={activeCase.priority}
                    disabled={busy}
                    data-admin-support-priority="1"
                    onChange={(e) => {
                      void patchCase({
                        action: "priority",
                        priority: e.target.value,
                      });
                    }}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.labelKo}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="my-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-ui-rect p-2 text-sm ${
                      m.message_type === "INTERNAL_NOTE"
                        ? "border border-dashed border-amber-300 bg-amber-50"
                        : "bg-sam-surface-muted"
                    }`}
                    data-admin-support-msg-type={m.message_type}
                  >
                    <p className="text-[11px] text-sam-muted">
                      {m.message_type === "INTERNAL_NOTE"
                        ? safeT("admin_support_internal_note", {
                            fallbackKo: "내부 메모",
                            fallbackEn: "Internal note",
                          })
                        : m.sender_type}{" "}
                      · {new Date(m.created_at).toLocaleString()}
                    </p>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                  </div>
                ))}
              </div>

              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
                placeholder={safeT("admin_support_reply_placeholder", {
                  fallbackKo: "답변 입력",
                  fallbackEn: "Reply",
                })}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || !reply.trim()}
                  className="min-h-9 rounded-ui-rect bg-sam-primary px-4 text-sm font-semibold text-white disabled:opacity-50"
                  onClick={async () => {
                    const ok = await patchCase({ action: "reply", body: reply });
                    if (ok) setReply("");
                  }}
                >
                  {safeT("admin_support_reply", { fallbackKo: "답변", fallbackEn: "Reply" })}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="min-h-9 rounded-ui-rect border border-sam-border px-3 text-sm"
                  data-admin-support-resolve="1"
                  onClick={() => void patchCase({ action: "status", status: "RESOLVED" })}
                >
                  {safeT("admin_support_resolve", {
                    fallbackKo: "상담 종료",
                    fallbackEn: "End consultation",
                  })}
                </button>
              </div>
              <textarea
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
                rows={2}
                className="mt-2 w-full resize-none rounded-ui-rect border border-dashed border-sam-border px-3 py-2 text-sm"
                placeholder={safeT("admin_support_internal_note", {
                  fallbackKo: "내부 메모 (회원 비노출)",
                  fallbackEn: "Internal note (hidden from user)",
                })}
              />
              <button
                type="button"
                disabled={busy || !internalNote.trim()}
                className="mt-2 min-h-9 self-start rounded-ui-rect border border-sam-border px-3 text-sm disabled:opacity-50"
                onClick={async () => {
                  const ok = await patchCase({
                    action: "reply",
                    body: internalNote,
                    internalNote: true,
                  });
                  if (ok) setInternalNote("");
                }}
              >
                {safeT("admin_support_save_note", {
                  fallbackKo: "메모 저장",
                  fallbackEn: "Save note",
                })}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function AdminSupportPage({ initialCaseId }: { initialCaseId?: string }) {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-sam-muted">…</p>}>
      <AdminSupportPageInner initialCaseId={initialCaseId} />
    </Suspense>
  );
}
