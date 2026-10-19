"use client";

import { dibayConfirm, dibayAlert } from "@/components/ui/dibay-overlay";
import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminChatRoom } from "@/lib/types/admin-chat";
import { ADMIN_REASON_MIN_LENGTH, confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
// C-10: 「신고 보기」 = 채팅 신고 단일 큐, 큐가 읽는 `target`(방·회원 ID) 파라미터.
import { ADMIN_CHAT_REPORT_QUEUE_PATH } from "@/lib/admin/chat-admin/admin-chat-links";

type PanelAction =
  | "warn"
  | "block_room"
  | "unblock_room"
  | "archive_room"
  | "unarchive_room"
  | "readonly_on"
  | "readonly_off";

type BulkMsgAction = "bulk_hide" | "bulk_unhide";

interface AdminChatActionPanelProps {
  room: AdminChatRoom;
  onActionSuccess: () => void;
  /** R1-B C-1: 사용자 방(CM)이 없는 레거시 전용 기록 — 조치가 사용자에게 반영되지 않으므로 읽기 전용 */
  legacyOnly?: boolean;
}

export function AdminChatActionPanel({
  room,
  onActionSuccess,
  legacyOnly = false,
}: AdminChatActionPanelProps) {
  const { t, language } = useI18n();
  const [loading, setLoading] = useState<PanelAction | BulkMsgAction | null>(null);
  const [note, setNote] = useState("");

  const runBulkMessages = async (kind: BulkMsgAction) => {
    const isHide = kind === "bulk_hide";
    if (
      !(await dibayConfirm({
        title: isHide ? t("admin_chat_bulk_hide_confirm") : t("admin_chat_bulk_unhide_confirm"),
        confirmTone: "destructive",
      }))
    ) {
      return;
    }
    setLoading(kind);
    try {
      const path = isHide ? "bulk-hide" : "bulk-unhide";
      const res = await fetch(
        `/api/admin/chat/rooms/${encodeURIComponent(room.id)}/messages/${path}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: isHide ? t("admin_chat_bulk_hide_reason") : t("admin_chat_bulk_unhide_reason"),
          }),
          credentials: "same-origin",
        },
      );
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        hidden_count?: number;
        unhidden_count?: number;
      };
      if (!res.ok || !j.ok) {
        await dibayAlert({ title: j.error ?? t("admin_chat_action_failed") });
        return;
      }
      const n = isHide ? j.hidden_count : j.unhidden_count;
      if (typeof n === "number") {
        await dibayAlert({ title: isHide ? t("admin_chat_hide_done_count", { count: n }) : t("admin_chat_unhide_done_count", { count: n }) });
      }
      onActionSuccess();
    } finally {
      setLoading(null);
    }
  };

  const run = async (action: PanelAction) => {
    // R1-A C-5: 사유 2자 이상 필수 (메모 입력값 사용, 없으면 L2 사유 입력) — 서버 상태 조건 갱신·감사.
    let reason = note.trim();
    if (reason.length < ADMIN_REASON_MIN_LENGTH) {
      const c = await confirmAdminAction({
        level: "L2",
        ko: language !== "en",
        title: t("admin_chat_r1_action_confirm_title"),
        confirmLabel: t("admin_chat_r1_action_confirm_cta"),
        destructive: action === "block_room" || action === "archive_room",
      });
      if (!c.ok || !c.reason) return;
      reason = c.reason;
    }
    setLoading(action);
    try {
      const res = await fetch(`/api/admin/chat/rooms/${encodeURIComponent(room.id)}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
        credentials: "same-origin",
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        await dibayAlert({
          title: j.error === "stale_state" ? t("admin_chat_r1_stale_state") : (j.error ?? t("admin_chat_action_failed")),
        });
        if (j.error === "stale_state") onActionSuccess();
        return;
      }
      setNote("");
      onActionSuccess();
    } finally {
      setLoading(null);
    }
  };

  const readonly = room.isReadonly === true;

  if (legacyOnly) {
    return (
      <div className="space-y-3" data-admin-trade-actions="legacy-read-only">
        <p className="sam-text-body-secondary text-sam-muted">{t("admin_chat_r1b_legacy_action_blocked")}</p>
        <a
          href={`${ADMIN_CHAT_REPORT_QUEUE_PATH}?status=all&target=${encodeURIComponent(room.id)}`}
          className="inline-block rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg hover:bg-sam-app"
        >
          {t("admin_chat_go_reports")}
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block sam-text-helper font-medium text-sam-muted">{t("admin_chat_action_note")}</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder={t("admin_chat_action_note_placeholder")}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body-secondary text-sam-fg placeholder:text-sam-meta"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={loading !== null}
          onClick={() => run("warn")}
          className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg hover:bg-sam-app disabled:opacity-50"
        >
          {loading === "warn" ? t("admin_chat_processing") : t("admin_chat_warn_log")}
        </button>
        {room.roomStatus !== "blocked" ? (
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => run("block_room")}
            className="rounded border border-red-100 bg-red-50 px-3 py-2 sam-text-body-secondary font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            {loading === "block_room" ? t("admin_chat_processing") : t("admin_chat_close_ops")}
          </button>
        ) : (
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => run("unblock_room")}
            className="rounded border border-emerald-100 bg-emerald-50 px-3 py-2 sam-text-body-secondary font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          >
            {loading === "unblock_room" ? t("admin_chat_processing") : t("admin_chat_reopen_ops")}
          </button>
        )}
        {room.roomStatus !== "archived" ? (
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => run("archive_room")}
            className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg hover:bg-sam-app disabled:opacity-50"
          >
            {loading === "archive_room" ? t("admin_chat_processing") : t("admin_chat_archive")}
          </button>
        ) : (
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => run("unarchive_room")}
            className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg hover:bg-sam-app disabled:opacity-50"
          >
            {loading === "unarchive_room" ? t("admin_chat_processing") : t("admin_chat_unarchive")}
          </button>
        )}
        {!readonly ? (
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => run("readonly_on")}
            className="rounded border border-amber-100 bg-amber-50 px-3 py-2 sam-text-body-secondary font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            {loading === "readonly_on" ? t("admin_chat_processing") : t("admin_chat_readonly")}
          </button>
        ) : (
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => run("readonly_off")}
            className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg hover:bg-sam-app disabled:opacity-50"
          >
            {loading === "readonly_off" ? t("admin_chat_processing") : t("admin_chat_readonly_off")}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-sam-border-soft pt-3">
        <span className="w-full sam-text-helper font-medium text-sam-muted">{t("admin_chat_bulk_actions")}</span>
        <button
          type="button"
          disabled={loading !== null}
          onClick={() => runBulkMessages("bulk_hide")}
          className="rounded border border-orange-100 bg-orange-50 px-3 py-2 sam-text-body-secondary font-medium text-orange-900 hover:bg-orange-100 disabled:opacity-50"
        >
          {loading === "bulk_hide" ? t("admin_chat_processing") : t("admin_chat_bulk_hide")}
        </button>
        <button
          type="button"
          disabled={loading !== null}
          onClick={() => runBulkMessages("bulk_unhide")}
          className="rounded border border-lime-200 bg-lime-50 px-3 py-2 sam-text-body-secondary font-medium text-lime-900 hover:bg-lime-100 disabled:opacity-50"
        >
          {loading === "bulk_unhide" ? t("admin_chat_processing") : t("admin_chat_bulk_unhide")}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <a
          href={`${ADMIN_CHAT_REPORT_QUEUE_PATH}?status=all&target=${encodeURIComponent(room.id)}`}
          className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg hover:bg-sam-app"
        >
          {t("admin_chat_go_reports")}
        </a>
      </div>
    </div>
  );
}
