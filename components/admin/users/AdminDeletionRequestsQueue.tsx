"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayAlert, dibayConfirm, dibayPrompt } from "@/components/ui/dibay-overlay";
import { ADMIN_USERS_LITE_CARD } from "@/lib/ui/admin-users-lite-styles";

type QueueItem = {
  id: string;
  userId: string;
  status: string;
  reason: string | null;
  requestedAt: string;
  memberLoginId: string;
  memberNickname: string | null;
};

export function AdminDeletionRequestsQueue() {
  const { t, safeT, language } = useI18n();
  const locale = language === "en" ? "en-US" : "ko-KR";
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "error"; message: string } | { kind: "ok"; items: QueueItem[] }
  >({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/admin/account-deletion-requests?status=open&limit=30", {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        items?: QueueItem[];
        error?: string;
      };
      if (!res.ok || data.ok === false) {
        setState({ kind: "error", message: data.error ?? t("admin_users_action_failed") });
        return;
      }
      setState({ kind: "ok", items: Array.isArray(data.items) ? data.items : [] });
    } catch {
      setState({ kind: "error", message: t("admin_users_action_failed") });
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const reject = async (item: QueueItem) => {
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
    const res = await fetch("/api/admin/account-deletion-requests", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: item.id,
        action: "reject",
        adminNote: note?.trim() || "admin_rejected",
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
    if (!res.ok || data.ok === false) {
      await dibayAlert({ title: data.message ?? data.error ?? t("admin_users_action_failed") });
      return;
    }
    await load();
  };

  const fmt = (iso: string) => {
    const ms = new Date(iso).getTime();
    if (!Number.isFinite(ms)) return iso;
    return new Date(ms).toLocaleString(locale, { hour12: false });
  };

  return (
    <section className={`${ADMIN_USERS_LITE_CARD} space-y-2 p-4`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[#101828]">
          {safeT("admin_users_deletion_queue_title", {
            fallbackKo: "회원 삭제 요청 대기",
            fallbackEn: "Pending deletion requests",
          })}
        </h2>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border border-[#e4e7ec] px-2 py-1 text-[11px] font-semibold text-[#344054]"
        >
          {t("admin_users_retry")}
        </button>
      </div>
      {state.kind === "loading" ? (
        <p className="text-sm text-[#667085]">{t("admin_users_detail_loading")}</p>
      ) : state.kind === "error" ? (
        <p className="text-sm font-semibold text-[#b42318]">{state.message}</p>
      ) : state.items.length === 0 ? (
        <p className="text-sm text-[#667085]">
          {safeT("admin_users_deletion_queue_empty", {
            fallbackKo: "대기 중인 삭제 요청이 없습니다.",
            fallbackEn: "No pending deletion requests.",
          })}
        </p>
      ) : (
        <ul className="divide-y divide-[#eaecf0]">
          {state.items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]">
              <div className="min-w-0">
                <p className="font-semibold text-[#101828]">
                  {item.memberNickname || item.memberLoginId}
                  <span className="ml-2 font-mono text-[11px] font-normal text-[#667085]">
                    {item.memberLoginId}
                  </span>
                </p>
                <p className="tabular-nums text-[12px] text-[#667085]">
                  {fmt(item.requestedAt)}
                  <span className="ml-2 font-mono text-[11px]">UTC {item.requestedAt}</span>
                  {" · "}
                  {item.status}
                </p>
                {item.reason ? <p className="text-[12px] text-[#667085]">reason: {item.reason}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/admin/users/${encodeURIComponent(item.userId)}?tab=ops`}
                  className="rounded-md border border-[#e4e7ec] px-2.5 py-1.5 text-xs font-semibold text-[#2563eb]"
                >
                  {safeT("admin_users_deletion_open_detail", {
                    fallbackKo: "상세에서 처리",
                    fallbackEn: "Process in detail",
                  })}
                </Link>
                <button
                  type="button"
                  onClick={() => void reject(item)}
                  className="rounded-md border border-[#d0d5dd] px-2.5 py-1.5 text-xs font-semibold text-[#344054]"
                >
                  {safeT("admin_users_deletion_reject", { fallbackKo: "요청 거절", fallbackEn: "Reject" })}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
