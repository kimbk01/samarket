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
import { getSupportCategoryDefinition } from "@/lib/support/support-category-registry";

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

function humanizeToken(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "—";
  return s
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

function roleLabel(audience: "MEMBER" | "OWNER", ko: boolean): string {
  if (audience === "OWNER") return ko ? "사장님" : "Owner";
  return ko ? "회원" : "Member";
}

function statusLabel(status: string, ko: boolean): string {
  switch (status) {
    case "WAITING_ADMIN":
      return ko ? "답변 대기" : "Waiting admin";
    case "WAITING_USER":
      return ko ? "사용자 답변 대기" : "Waiting user";
    case "RESOLVED":
      return ko ? "종료" : "Resolved";
    case "ARCHIVED":
      return ko ? "보관" : "Archived";
    case "OPEN":
      return ko ? "접수" : "Open";
    default:
      return humanizeToken(status);
  }
}

function AdminSupportPageInner({ initialCaseId }: { initialCaseId?: string }) {
  const { safeT, language } = useI18n();
  const ko = language !== "en";
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
  const [composerMode, setComposerMode] = useState<"public" | "internal">("public");
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

  const categoryLabel = (c: SupportCaseRow) => {
    const def = getSupportCategoryDefinition(c.category);
    if (def?.labelKey) {
      return safeT(def.labelKey as "support_enter_category_label", {
        fallbackKo: humanizeToken(c.category),
        fallbackEn: humanizeToken(c.category),
      });
    }
    return humanizeToken(c.category);
  };

  const issueLabel = (c: SupportCaseRow) => humanizeToken(c.issue_type);

  const whoLine = (c: SupportCaseRow) => {
    const role = roleLabel(c.audience, ko);
    const idShort = c.requester_user_id.slice(0, 8);
    if (c.audience === "OWNER" && c.owner_store_id) {
      return `${idShort} · ${role} · Store ${c.owner_store_id.slice(0, 8)}`;
    }
    return `${idShort} · ${role}`;
  };

  const lastPublicPreview = (caseId: string) => {
    if (activeId === caseId) {
      const last = [...messages].reverse().find((m) => m.message_type === "PUBLIC");
      return last?.body?.slice(0, 80) ?? "";
    }
    return "";
  };

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-3 p-4"
      data-admin-support-ssot="1"
      data-admin-support-console="3col"
    >
      <AdminPageHeader
        title={safeT("admin_support_title", {
          fallbackKo: "고객센터",
          fallbackEn: "Support Center",
        })}
        description={safeT("admin_support_desc", {
          fallbackKo: "회원·매장 Owner 문의 상담 콘솔",
          fallbackEn: "Member and owner support console",
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

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[300px_minmax(0,1fr)_280px]">
        {/* LEFT — queue */}
        <div
          className="flex min-h-[28rem] flex-col overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface lg:min-h-0"
          data-admin-support-queue="1"
        >
          <div className="shrink-0 border-b border-sam-border px-3 py-2 text-xs font-semibold text-sam-muted">
            {ko ? "문의 목록" : "Queue"}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
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
                          {roleLabel(c.audience, ko)}
                        </span>
                        {Number(c.admin_unread_count) > 0 ? (
                          <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            {c.admin_unread_count}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-[11px] text-sam-muted">{whoLine(c)}</p>
                      <p className="mt-0.5 line-clamp-1 text-sm font-medium">
                        {categoryLabel(c)}
                        {c.issue_type ? ` · ${issueLabel(c)}` : ""}
                      </p>
                      {c.initial_summary ? (
                        <p className="mt-0.5 line-clamp-2 text-[12px] text-sam-fg">
                          {c.initial_summary}
                        </p>
                      ) : (
                        <p className="mt-0.5 line-clamp-1 text-[12px] text-sam-muted">
                          {c.subject}
                        </p>
                      )}
                      {lastPublicPreview(c.id) ? (
                        <p className="mt-0.5 line-clamp-1 text-[11px] text-sam-muted">
                          {lastPublicPreview(c.id)}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[10px] text-sam-muted">
                        {statusLabel(c.status, ko)}
                        {" · "}
                        {PRIORITIES.find((p) => p.id === c.priority)?.[ko ? "labelKo" : "labelEn"] ??
                          c.priority}
                        {!c.assigned_admin_id ? (ko ? " · 미배정" : " · Unassigned") : ""}
                        {" · "}
                        {c.last_message_at ? new Date(c.last_message_at).toLocaleString() : ""}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* CENTER — conversation */}
        <div
          className="flex min-h-[28rem] min-w-0 flex-col overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface lg:min-h-0"
          data-admin-support-center="1"
        >
          {!activeId ? (
            <p className="p-4 text-sm text-sam-muted">← {ko ? "문의를 선택하세요" : "Select a case"}</p>
          ) : detailLoading ? (
            <p className="p-4 text-sm text-sam-muted">…</p>
          ) : !activeCase ? (
            <p className="p-4 text-sm text-red-600">{error}</p>
          ) : (
            <>
              <div
                className="shrink-0 space-y-2 border-b border-sam-border p-3"
                data-admin-support-chat-header="1"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold">
                      {whoLine(activeCase)} · {activeCase.public_case_no}
                    </h2>
                    <p className="text-xs text-sam-muted">
                      {categoryLabel(activeCase)}
                      {activeCase.issue_type ? ` · ${issueLabel(activeCase)}` : ""}
                      {" · "}
                      {statusLabel(activeCase.status, ko)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    className="min-h-9 shrink-0 rounded-ui-rect border border-sam-border px-3 text-sm"
                    data-admin-support-resolve="1"
                    onClick={() => void patchCase({ action: "status", status: "RESOLVED" })}
                  >
                    {safeT("admin_support_resolve", {
                      fallbackKo: "상담 종료",
                      fallbackEn: "End consultation",
                    })}
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
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
                          {ko ? p.labelKo : p.labelEn}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
              </div>

              <div
                className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3"
                data-admin-support-timeline="1"
              >
                {messages.map((m) => {
                  const isInternal = m.message_type === "INTERNAL_NOTE";
                  const isAdmin = m.sender_type === "ADMIN";
                  const isSystem = m.sender_type === "SYSTEM";
                  const isOwner = m.sender_type === "OWNER";
                  const senderLine = isInternal
                    ? ko
                      ? "관리자 내부 메모"
                      : "Internal note"
                    : isSystem
                      ? ko
                        ? "시스템"
                        : "System"
                      : isAdmin
                        ? ko
                          ? "관리자"
                          : "Admin"
                        : isOwner
                          ? ko
                            ? "사장님"
                            : "Owner"
                          : ko
                            ? "회원"
                            : "Member";
                  return (
                    <div
                      key={m.id}
                      className={`max-w-[92%] rounded-ui-rect px-3 py-2 text-sm ${
                        isInternal
                          ? "ml-0 border border-dashed border-amber-300 bg-amber-50"
                          : isSystem
                            ? "mx-auto bg-sam-surface-muted text-center text-xs text-sam-muted"
                            : isAdmin
                              ? "ml-0 bg-sam-primary/10"
                              : "ml-auto bg-sam-surface-muted"
                      }`}
                      data-admin-support-msg-type={m.message_type}
                      data-admin-support-msg-sender={m.sender_type}
                    >
                      <p className="text-[11px] font-semibold text-sam-muted">
                        {senderLine}
                        {" · "}
                        {new Date(m.created_at).toLocaleString()}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
                    </div>
                  );
                })}
              </div>

              <div
                className="shrink-0 space-y-2 border-t border-sam-border p-3"
                data-admin-support-composer="1"
              >
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1 ${
                      composerMode === "public"
                        ? "bg-sam-primary text-white"
                        : "border border-sam-border"
                    }`}
                    onClick={() => setComposerMode("public")}
                  >
                    {ko ? "공개 답변" : "Public reply"}
                  </button>
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1 ${
                      composerMode === "internal"
                        ? "bg-amber-600 text-white"
                        : "border border-sam-border"
                    }`}
                    onClick={() => setComposerMode("internal")}
                  >
                    {safeT("admin_support_internal_note", {
                      fallbackKo: "내부 메모",
                      fallbackEn: "Internal note",
                    })}
                  </button>
                </div>
                {composerMode === "public" ? (
                  <>
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
                  </>
                ) : (
                  <>
                    <textarea
                      value={internalNote}
                      onChange={(e) => setInternalNote(e.target.value)}
                      rows={3}
                      className="w-full resize-none rounded-ui-rect border border-dashed border-sam-border px-3 py-2 text-sm"
                      placeholder={safeT("admin_support_internal_note", {
                        fallbackKo: "내부 메모 (회원 비노출)",
                        fallbackEn: "Internal note (hidden from user)",
                      })}
                    />
                    <button
                      type="button"
                      disabled={busy || !internalNote.trim()}
                      className="min-h-9 rounded-ui-rect border border-sam-border px-3 text-sm disabled:opacity-50"
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
            </>
          )}
        </div>

        {/* RIGHT — context */}
        <div
          className="flex min-h-[20rem] flex-col overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface lg:min-h-0"
          data-admin-support-context="1"
        >
          <div className="shrink-0 border-b border-sam-border px-3 py-2 text-xs font-semibold text-sam-muted">
            {ko ? "문의 맥락" : "Context"}
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-sm">
            {!activeCase ? (
              <p className="text-sam-muted">—</p>
            ) : (
              <>
                <section>
                  <h3 className="text-xs font-semibold text-sam-muted">{ko ? "고객" : "Customer"}</h3>
                  <p className="mt-1 font-medium">{whoLine(activeCase)}</p>
                  <p className="text-xs text-sam-muted break-all">{activeCase.requester_user_id}</p>
                </section>
                {activeCase.owner_store_id ? (
                  <section>
                    <h3 className="text-xs font-semibold text-sam-muted">{ko ? "매장" : "Store"}</h3>
                    <p className="mt-1 break-all text-xs">{activeCase.owner_store_id}</p>
                    <Link
                      href={`/admin/stores/orders/by-store/${encodeURIComponent(activeCase.owner_store_id)}`}
                      className="text-xs text-sam-primary underline"
                    >
                      {safeT("admin_support_open_store", {
                        fallbackKo: "매장 관리 열기",
                        fallbackEn: "Open store",
                      })}
                    </Link>
                  </section>
                ) : null}
                <section>
                  <h3 className="text-xs font-semibold text-sam-muted">{ko ? "문의" : "Inquiry"}</h3>
                  <p className="mt-1">{categoryLabel(activeCase)}</p>
                  {activeCase.issue_type ? (
                    <p className="text-xs text-sam-muted">{issueLabel(activeCase)}</p>
                  ) : null}
                  {activeCase.initial_summary ? (
                    <p className="mt-2 whitespace-pre-wrap rounded-ui-rect bg-sam-surface-muted p-2 text-[13px]">
                      {activeCase.initial_summary}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-sam-muted">
                    {statusLabel(activeCase.status, ko)} · {activeCase.priority}
                  </p>
                  <p className="text-xs text-sam-muted">
                    {ko ? "생성" : "Created"}: {new Date(activeCase.created_at).toLocaleString()}
                  </p>
                  <p className="text-xs text-sam-muted">
                    {ko ? "갱신" : "Updated"}: {new Date(activeCase.updated_at).toLocaleString()}
                  </p>
                  <p className="text-xs text-sam-muted">
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
                </section>
                <section>
                  <h3 className="text-xs font-semibold text-sam-muted">
                    {ko ? "비즈니스 참조" : "Business reference"}
                  </h3>
                  {activeCase.reference_type ? (
                    <p className="mt-1 text-xs">
                      {humanizeToken(activeCase.reference_type)}
                      {activeCase.reference_id
                        ? ` · ${String(activeCase.reference_id).slice(0, 12)}…`
                        : ""}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-sam-muted">—</p>
                  )}
                  <p className="mt-1 text-[11px] text-sam-muted">
                    {ko
                      ? "도메인 관리는 해당 업무 화면에서 처리합니다."
                      : "Manage domain objects in their canonical screens."}
                  </p>
                </section>
              </>
            )}
          </div>
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
