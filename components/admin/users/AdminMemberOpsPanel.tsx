"use client";

import { dibayConfirm, dibayAlert, dibayPrompt } from "@/components/ui/dibay-overlay";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  const { snapshot } = useAdminMe();
  const actorId = snapshot?.userId ?? "";
  const locale = language === "en" ? "en-US" : "ko-KR";
  const actions = useMemo(() => memberModerationActionsForStatus(moderationStatus), [moderationStatus]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [modBusy, setModBusy] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [stack, setStack] = useState<string[]>([]);
  const [sourceFilter, setSourceFilter] = useState<"all" | MemberOpsHistoryItem["source"]>("all");
  const [history, setHistory] = useState<{ kind: "loading" } | { kind: "error" } | { kind: "ok"; data: MemberOpsHistoryPayload }>({
    kind: "loading",
  });

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
      onUpdated?.();
    } finally {
      setModBusy(null);
    }
  };

  const fmt = (value: string) => {
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? new Date(time).toLocaleString(locale) : value;
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
        <p className="text-xs text-[#98a2b3]">
          {safeT("admin_users_cc_cta_notify_unsupported", {
            fallbackKo: "알림 보내기 — 지원되지 않음",
            fallbackEn: "Send notification — not supported",
          })}
        </p>
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
        {history.kind === "loading" ? (
          <p className="text-sm text-[#667085]">{t("admin_users_detail_loading")}</p>
        ) : history.kind === "error" ? (
          <p className="text-sm font-semibold text-[#b42318]">
            {safeT("admin_users_cc_load_failed", { fallbackKo: "불러오기 실패", fallbackEn: "Load failed" })}
          </p>
        ) : (
          <>
            {history.data.sources.moderation.ok === false || history.data.sources.audit.ok === false || history.data.sources.trust.ok === false ? (
              <p className="text-xs text-[#b42318]">
                {safeT("admin_users_cc_load_failed", { fallbackKo: "불러오기 실패", fallbackEn: "Load failed" })}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-1">
              {(["all", "user_moderation_events", "audit_logs", "trust_events"] as const).map((id) => (
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
                        : t("admin_users_cc_overview_account")}
                </button>
              ))}
            </div>
            <ul className="divide-y divide-[#eaecf0]">
              {history.data.items
                .filter((item) => sourceFilter === "all" || item.source === sourceFilter)
                .map((item: MemberOpsHistoryItem) => (
                <li key={item.id} className="py-2 text-[13px]">
                  <p className="tabular-nums text-[#667085]">{fmt(item.createdAt)}</p>
                  <p className="font-semibold text-[#101828]">{item.action}</p>
                  <p className="text-[12px] text-[#667085]">
                    {item.source} · {item.actorId || "—"}
                  </p>
                  {item.reason ? <p className="text-[12px] text-[#667085]">{item.reason}</p> : null}
                </li>
              ))}
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
