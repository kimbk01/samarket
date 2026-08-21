"use client";

import { dibayConfirm, dibayAlert, dibayPrompt } from "@/components/ui/dibay-overlay";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useAdminMe } from "@/hooks/useAdminMe";
import {
  memberInquiryAdminHref,
  memberMessengerAdminHref,
} from "@/lib/admin-users/member-deep-links";
import { memberModerationActionsForStatus, type MemberModerationAction } from "@/lib/admin-users/member-moderation-cta";
import type { MemberOpsHistoryItem, MemberOpsHistoryPayload } from "@/lib/admin-users/member-ops-history";
import { ADMIN_USERS_LITE_CARD } from "@/lib/ui/admin-users-lite-styles";

const ACTION_LABEL: Record<MemberModerationAction, { ko: string; en: string }> = {
  warn: { ko: "경고", en: "Warn" },
  suspend: { ko: "정지", en: "Suspend" },
  ban: { ko: "차단", en: "Ban" },
  restore: { ko: "복구", en: "Restore" },
};

type DeletionRequestItem = {
  id: string;
  userId: string;
  status: string;
  reason: string | null;
  requestedAt: string;
  processedAt: string | null;
  processedBy: string | null;
  adminNote: string | null;
};

function formatExactTime(iso: string, locale: string): { local: string; utc: string } {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return { local: iso, utc: iso };
  const d = new Date(t);
  return {
    local: d.toLocaleString(locale, { hour12: false }),
    utc: d.toISOString(),
  };
}

export function AdminMemberOpsPanel({
  userId,
  nickname,
  moderationStatus,
  onUpdated,
}: {
  userId: string;
  nickname: string;
  moderationStatus: string | null | undefined;
  onUpdated?: () => void;
}) {
  const { t, safeT, language } = useI18n();
  const { snapshot, isSuperAdmin, hasPermission } = useAdminMe();
  const canManageMember = isSuperAdmin || hasPermission("users");
  const actorId = snapshot?.userId ?? "";
  const locale = language === "en" ? "en-US" : "ko-KR";
  const actions = useMemo(() => memberModerationActionsForStatus(moderationStatus), [moderationStatus]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [modBusy, setModBusy] = useState<string | null>(null);
  const [delBusy, setDelBusy] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [stack, setStack] = useState<string[]>([]);
  const [sourceFilter, setSourceFilter] = useState<"all" | MemberOpsHistoryItem["source"]>("all");
  const [history, setHistory] = useState<{ kind: "loading" } | { kind: "error" } | { kind: "ok"; data: MemberOpsHistoryPayload }>({
    kind: "loading",
  });
  const [deletion, setDeletion] = useState<
    { kind: "loading" } | { kind: "error"; message: string } | { kind: "ok"; open: DeletionRequestItem | null; items: DeletionRequestItem[] }
  >({ kind: "loading" });

  const reloadDeletion = useCallback(async () => {
    setDeletion({ kind: "loading" });
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/deletion-request`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        openRequest?: DeletionRequestItem | null;
        items?: DeletionRequestItem[];
        error?: string;
      };
      if (!res.ok || data.ok === false) {
        setDeletion({ kind: "error", message: data.error ?? t("admin_users_action_failed") });
        return;
      }
      setDeletion({
        kind: "ok",
        open: data.openRequest ?? null,
        items: Array.isArray(data.items) ? data.items : [],
      });
    } catch {
      setDeletion({ kind: "error", message: t("admin_users_action_failed") });
    }
  }, [t, userId]);

  useEffect(() => {
    void reloadDeletion();
  }, [reloadDeletion]);

  useEffect(() => {
    let cancelled = false;
    setHistory({ kind: "loading" });
    (async () => {
      try {
        const qs = new URLSearchParams({ pageSize: "20" });
        if (cursor) qs.set("cursor", cursor);
        const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/ops-history?${qs}`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as MemberOpsHistoryPayload & { ok?: boolean };
        if (cancelled) return;
        if (!res.ok || data.ok === false) {
          setHistory({ kind: "error" });
          return;
        }
        setHistory({ kind: "ok", data });
      } catch {
        if (!cancelled) setHistory({ kind: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, cursor]);

  const sendNote = async () => {
    if (!subject.trim() || !body.trim()) return;
    setNoteBusy(true);
    try {
      const res = await fetch("/api/admin/member-notes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberUserId: userId, subject: subject.trim(), body: body.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || data.ok === false) {
        await dibayAlert({ title: data.error ?? t("admin_users_action_failed") });
        return;
      }
      setSubject("");
      setBody("");
      setCursor(null);
      setStack([]);
    } finally {
      setNoteBusy(false);
    }
  };

  const runModeration = async (action: MemberModerationAction) => {
    const stamp = new Date().toISOString();
    const confirmed = await dibayConfirm({
      title: [
        safeT("admin_users_cc_moderation_confirm", {
          fallbackKo: "이 조치를 실행할까요?",
          fallbackEn: "Run this moderation action?",
        }),
        `action=${action}`,
        `target=${userId}`,
        `actor=${actorId || "—"}`,
        `time=${stamp}`,
      ].join("\n"),
      confirmTone: "destructive",
    });
    if (!confirmed) return;
    const reason = await dibayPrompt({
      title: safeT("admin_users_moderation_reason_prompt", {
        fallbackKo: "처리 사유를 입력해 주세요.",
        fallbackEn: "Enter a reason for this action.",
      }),
      required: true,
    });
    if (!reason?.trim()) return;
    setModBusy(action);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/moderation`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: reason.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || data.ok === false) {
        await dibayAlert({ title: data.message ?? data.error ?? t("admin_users_action_failed") });
        return;
      }
      setCursor(null);
      setStack([]);
      onUpdated?.();
    } finally {
      setModBusy(null);
    }
  };

  const runMemberDelete = async (mode: "withdraw" | "purge") => {
    if (!canManageMember) return;
    const title =
      mode === "purge"
        ? safeT("admin_users_purge_confirm", {
            fallbackKo: "이 회원을 영구 삭제하시겠습니까? 되돌릴 수 없습니다.",
            fallbackEn: "Permanently delete this member? This cannot be undone.",
          })
        : safeT("admin_users_lite_delete_confirm", {
            fallbackKo: "이 회원을 탈퇴 처리(개인정보 익명화)하시겠습니까?",
            fallbackEn: "Withdraw this member and anonymize their personal data?",
          });
    if (!(await dibayConfirm({ title, confirmTone: "destructive" }))) return;
    setDelBusy(mode);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/delete`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          reason: mode === "purge" ? "admin_permanent_delete" : "admin_withdraw",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
        blockers?: string[];
      };
      if (!res.ok || data.ok === false) {
        const blockerText =
          Array.isArray(data.blockers) && data.blockers.length > 0 ? `\n${data.blockers.join(", ")}` : "";
        await dibayAlert({
          title: `${data.message ?? data.error ?? t("admin_users_action_failed")}${blockerText}`,
        });
        return;
      }
      window.location.href = "/admin/users";
    } finally {
      setDelBusy(null);
    }
  };

  const rejectDeletionRequest = async (requestId: string) => {
    if (
      !(await dibayConfirm({
        title: safeT("admin_users_deletion_reject_confirm", {
          fallbackKo: "이 삭제 요청을 거절하시겠습니까?",
          fallbackEn: "Reject this deletion request?",
        }),
      }))
    ) {
      return;
    }
    const note = await dibayPrompt({
      title: safeT("admin_users_deletion_reject_note", {
        fallbackKo: "거절 사유(선택)를 입력하세요.",
        fallbackEn: "Optional reject note.",
      }),
      required: false,
    });
    setDelBusy("reject");
    try {
      const res = await fetch("/api/admin/account-deletion-requests", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          action: "reject",
          adminNote: note?.trim() || "admin_rejected",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || data.ok === false) {
        await dibayAlert({ title: data.message ?? data.error ?? t("admin_users_action_failed") });
        return;
      }
      await reloadDeletion();
      setCursor(null);
      setStack([]);
      onUpdated?.();
    } finally {
      setDelBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className={`${ADMIN_USERS_LITE_CARD} space-y-3 p-4`}>
        <h3 className="text-xs font-bold uppercase tracking-wide text-[#667085]">
          {safeT("admin_users_cc_contact_title", { fallbackKo: "연락", fallbackEn: "Contact" })}
        </h3>
        <p className="text-xs text-[#667085]">{nickname}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={safeT("admin_users_cc_note_subject", { fallbackKo: "쪽지 제목", fallbackEn: "Note subject" })}
            className="rounded-md border border-[#e4e7ec] px-3 py-2 text-sm"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={safeT("admin_users_cc_note_body", { fallbackKo: "쪽지 내용", fallbackEn: "Note body" })}
            className="rounded-md border border-[#e4e7ec] px-3 py-2 text-sm sm:col-span-2"
            rows={3}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={noteBusy}
            onClick={() => void sendNote()}
            className="rounded-md bg-[#2563eb] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {safeT("admin_users_cc_cta_send_note", { fallbackKo: "쪽지 보내기", fallbackEn: "Send note" })}
          </button>
          <Link href={memberInquiryAdminHref(userId)} className="rounded-md border border-[#e4e7ec] px-3 py-2 text-xs font-semibold text-[#344054]">
            {safeT("admin_users_cc_cta_inquiry", { fallbackKo: "문의", fallbackEn: "Inquiry" })}
          </Link>
          <Link href={memberMessengerAdminHref(userId)} className="rounded-md border border-[#e4e7ec] px-3 py-2 text-xs font-semibold text-[#344054]">
            {safeT("admin_users_cc_cta_messenger_view", { fallbackKo: "메신저 보기", fallbackEn: "View messenger" })}
          </Link>
        </div>
      </div>

      <div className={`${ADMIN_USERS_LITE_CARD} space-y-3 p-4`}>
        <h3 className="text-xs font-bold uppercase tracking-wide text-[#667085]">
          {safeT("admin_users_deletion_section_title", {
            fallbackKo: "삭제·탈퇴",
            fallbackEn: "Deletion",
          })}
        </h3>
        {deletion.kind === "loading" ? (
          <p className="text-sm text-[#667085]">{t("admin_users_detail_loading")}</p>
        ) : deletion.kind === "error" ? (
          <p className="text-sm font-semibold text-[#b42318]">{deletion.message}</p>
        ) : (
          <>
            {deletion.open ? (
              <div className="rounded-md border border-[#fecdca] bg-[#fef3f2] px-3 py-2 text-[13px] text-[#912018]">
                <p className="font-semibold">
                  {safeT("admin_users_deletion_open_banner", {
                    fallbackKo: "회원 삭제 요청이 대기 중입니다.",
                    fallbackEn: "Member deletion request is pending.",
                  })}
                </p>
                <p className="mt-1 font-mono text-[11px]">
                  requestId={deletion.open.id}
                  {" · "}
                  status={deletion.open.status}
                  {" · "}
                  requestedAt={deletion.open.requestedAt}
                </p>
                {deletion.open.reason ? <p className="mt-1">reason: {deletion.open.reason}</p> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={delBusy !== null}
                    onClick={() => void rejectDeletionRequest(deletion.open!.id)}
                    className="rounded-md border border-[#d0d5dd] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#344054] disabled:opacity-50"
                  >
                    {safeT("admin_users_deletion_reject", { fallbackKo: "요청 거절", fallbackEn: "Reject request" })}
                  </button>
                  <button
                    type="button"
                    disabled={delBusy !== null || !canManageMember}
                    onClick={() => void runMemberDelete("withdraw")}
                    className="rounded-md border border-[#fecdca] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#b42318] disabled:opacity-50"
                  >
                    {safeT("admin_users_lite_withdraw_account", {
                      fallbackKo: "탈퇴 처리(익명화)",
                      fallbackEn: "Withdraw (anonymize)",
                    })}
                  </button>
                  <button
                    type="button"
                    disabled={delBusy !== null || !canManageMember}
                    onClick={() => void runMemberDelete("purge")}
                    className="rounded-md bg-[#b42318] px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {safeT("admin_users_purge_account", {
                      fallbackKo: "영구 삭제",
                      fallbackEn: "Permanent delete",
                    })}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[#667085]">
                {safeT("admin_users_deletion_no_open", {
                  fallbackKo: "대기 중인 회원 삭제 요청이 없습니다. 관리자가 직접 탈퇴·영구삭제를 실행할 수 있습니다.",
                  fallbackEn: "No pending deletion request. Admin can still withdraw or permanently delete.",
                })}
              </p>
            )}
            {!deletion.open && canManageMember ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={delBusy !== null}
                  onClick={() => void runMemberDelete("withdraw")}
                  className="rounded-md border border-[#fecdca] px-3 py-2 text-xs font-semibold text-[#b42318] disabled:opacity-50"
                >
                  {safeT("admin_users_lite_withdraw_account", {
                    fallbackKo: "탈퇴 처리(익명화)",
                    fallbackEn: "Withdraw (anonymize)",
                  })}
                </button>
                <button
                  type="button"
                  disabled={delBusy !== null}
                  onClick={() => void runMemberDelete("purge")}
                  className="rounded-md bg-[#b42318] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {safeT("admin_users_purge_account", {
                    fallbackKo: "영구 삭제",
                    fallbackEn: "Permanent delete",
                  })}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className={`${ADMIN_USERS_LITE_CARD} space-y-3 p-4`}>
        <h3 className="text-xs font-bold uppercase tracking-wide text-[#667085]">
          {safeT("admin_users_cc_moderation_title", { fallbackKo: "제재", fallbackEn: "Moderation" })}
        </h3>
        <p className="text-sm font-semibold text-[#101828]">{String(moderationStatus ?? "normal").toUpperCase()}</p>
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => (
            <button
              key={action}
              type="button"
              disabled={modBusy !== null}
              onClick={() => void runModeration(action)}
              className="rounded-md border border-[#e4e7ec] px-3 py-2 text-xs font-semibold text-[#344054] disabled:opacity-50"
            >
              {language === "en" ? ACTION_LABEL[action].en : ACTION_LABEL[action].ko}
            </button>
          ))}
        </div>
      </div>

      <div className={`${ADMIN_USERS_LITE_CARD} space-y-3 p-4`}>
        <h3 className="text-xs font-bold uppercase tracking-wide text-[#667085]">
          {safeT("admin_users_cc_ops_title", { fallbackKo: "운영 기록", fallbackEn: "Operations history" })}
        </h3>
        <p className="text-[12px] text-[#667085]">
          {safeT("admin_users_cc_ops_legend", {
            fallbackKo: "각 행: 정확한 시각(로컬·UTC) · 행동 · 관리자 로그인 아이디(UUID)",
            fallbackEn: "Each row: exact time (local + UTC) · action · admin login ID (UUID)",
          })}
        </p>
        {history.kind === "loading" ? (
          <p className="text-sm text-[#667085]">{t("admin_users_detail_loading")}</p>
        ) : history.kind === "error" ? (
          <p className="text-sm font-semibold text-[#b42318]">
            {safeT("admin_users_cc_load_failed", { fallbackKo: "불러오기 실패", fallbackEn: "Load failed" })}
          </p>
        ) : (
          <>
            {history.data.sources.moderation.ok === false ||
            history.data.sources.audit.ok === false ||
            history.data.sources.trust.ok === false ||
            history.data.sources.deletionRequests.ok === false ? (
              <p className="text-xs text-[#b42318]">
                {safeT("admin_users_cc_load_failed", { fallbackKo: "불러오기 실패", fallbackEn: "Load failed" })}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-1">
              {(
                [
                  "all",
                  "user_moderation_events",
                  "audit_logs",
                  "account_deletion_requests",
                  "trust_events",
                ] as const
              ).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSourceFilter(id)}
                  className={
                    sourceFilter === id
                      ? "rounded-md bg-[#eff6ff] px-2 py-1 text-[11px] font-semibold text-[#2563eb]"
                      : "rounded-md px-2 py-1 text-[11px] font-semibold text-[#667085]"
                  }
                >
                  {id === "all"
                    ? t("admin_users_tab_all")
                    : id === "user_moderation_events"
                      ? t("admin_users_cc_moderation_title")
                      : id === "trust_events"
                        ? t("admin_users_cc_tab_trust")
                        : id === "account_deletion_requests"
                          ? safeT("admin_users_deletion_section_title", {
                              fallbackKo: "삭제·탈퇴",
                              fallbackEn: "Deletion",
                            })
                          : t("admin_users_cc_overview_account")}
                </button>
              ))}
            </div>
            <ul className="divide-y divide-[#eaecf0]">
              {history.data.items
                .filter((item) => sourceFilter === "all" || item.source === sourceFilter)
                .map((item: MemberOpsHistoryItem) => {
                  const time = formatExactTime(item.createdAt, locale);
                  const actorLogin = item.actorLoginId || "—";
                  const actorUuid = item.actorId || "—";
                  return (
                    <li key={item.id} className="space-y-1 py-2.5 text-[13px]">
                      <p className="font-semibold tabular-nums text-[#101828]">
                        {time.local}
                        <span className="ml-2 font-normal text-[11px] text-[#98a2b3]">UTC {time.utc}</span>
                      </p>
                      <p className="font-semibold text-[#101828]">
                        {item.actionLabel}
                        <span className="ml-2 font-mono text-[11px] font-normal text-[#667085]">{item.action}</span>
                      </p>
                      <p className="text-[12px] text-[#344054]">
                        {safeT("admin_users_cc_ops_actor", {
                          fallbackKo: "관리자",
                          fallbackEn: "Admin",
                        })}
                        :{" "}
                        <span className="font-semibold">{actorLogin}</span>
                        {item.actorDisplayName && item.actorDisplayName !== actorLogin ? (
                          <span className="text-[#667085]"> ({item.actorDisplayName})</span>
                        ) : null}
                        <span className="ml-2 font-mono text-[11px] text-[#98a2b3]">{actorUuid}</span>
                      </p>
                      <p className="text-[11px] text-[#98a2b3]">{item.source}</p>
                      {item.reason ? <p className="text-[12px] text-[#667085]">reason: {item.reason}</p> : null}
                    </li>
                  );
                })}
            </ul>
            {history.data.items.length === 0 ? (
              <p className="text-sm text-[#667085]">
                {safeT("admin_users_cc_empty", { fallbackKo: "항목이 없습니다.", fallbackEn: "No items." })}
              </p>
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={stack.length === 0}
                onClick={() => {
                  const prev = stack[stack.length - 1] ?? null;
                  setStack((cur) => cur.slice(0, -1));
                  setCursor(prev);
                }}
                className="rounded-md border border-[#e4e7ec] px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
              >
                {safeT("admin_users_cc_page_prev", { fallbackKo: "이전", fallbackEn: "Prev" })}
              </button>
              <button
                type="button"
                disabled={!history.data.nextCursor}
                onClick={() => {
                  setStack((cur) => [...cur, cursor ?? ""]);
                  setCursor(history.data.nextCursor);
                }}
                className="rounded-md border border-[#e4e7ec] px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
              >
                {safeT("admin_users_cc_page_next", { fallbackKo: "다음", fallbackEn: "Next" })}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
