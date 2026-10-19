"use client";

/**
 * 채팅 Admin 조치 시트 S1~S6 (설계 §5) — 방 상세·신고 큐·통화·레거시 기록·도메인 화면이 같은 시트를 쓴다.
 * 서버 규칙(권한·사유 길이·CAS·감사)은 API 가 최종 판정한다. 시트는 입력·2단계 확인·실패 표시만 한다.
 */
import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { formatAdminDateTime } from "@/components/admin/i18n/admin-date-locale";
import {
  AdminChatActionSheet,
  adminChatSheetFetch,
  type AdminChatSheetSettle,
} from "@/components/admin/chats/AdminChatActionSheet";
import {
  CHAT_ADMIN_ACTION_REASON_MIN_LENGTH,
  CHAT_ADMIN_GHOST_REASON_MIN_LENGTH,
  CHAT_ROOM_HARD_DELETE_CONFIRM_TEXT,
  CHAT_ROOM_HARD_DELETE_REASON_MIN_LENGTH,
} from "@/lib/admin/chat-admin/chat-content-access-policy";
import { adminChatLabel } from "@/lib/admin/status-labels/chat-status-labels";
import {
  COMMUNITY_MESSENGER_CALL_FORCE_END_REASONS,
  type CommunityMessengerCallForceEndReasonCode,
} from "@/lib/admin-community-messenger/call-force-end-reasons";
import type { MessageKey } from "@/lib/i18n/messages";
import type { ChatReportSource } from "@/lib/admin/chat-admin/admin-chat-report-queue-model";

type SettleProps = { onClose: () => void; onSettled: (kind: AdminChatSheetSettle) => void };

/* ───────────── S1 본문 열람 (고스트) ───────────── */

export function AdminChatContentUnlockSheet({
  roomLabel,
  onUnlock,
  onClose,
}: {
  roomLabel: string;
  /** 사유를 받아 상세를 다시 불러온다 (서버 GET 이 검증·감사). */
  onUnlock: (reason: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <AdminChatActionSheet
      title={t("admin_chat_s1_title")}
      rows={[{ label: t("admin_chat_sheet_target"), value: roomLabel }]}
      notice={t("admin_chat_s1_notice", { min: CHAT_ADMIN_GHOST_REASON_MIN_LENGTH })}
      reason={{ minLength: CHAT_ADMIN_GHOST_REASON_MIN_LENGTH, placeholder: t("admin_chat_r1_content_reason_placeholder") }}
      confirmLabel={t("admin_chat_r1_content_unlock_cta")}
      onSubmit={async (reason) =>
        (await onUnlock(reason)) ? { ok: true } : { ok: false, status: 403, code: "forbidden_permission" }
      }
      onClose={onClose}
      onSettled={() => onClose()}
    />
  );
}

/* ───────────── S2 방 조치 ───────────── */

export type AdminChatRoomAction =
  | "block_room"
  | "unblock_room"
  | "archive_room"
  | "unarchive_room"
  | "readonly_on"
  | "readonly_off";

const ROOM_ACTION_KEYS: Record<AdminChatRoomAction, { label: MessageKey; app: MessageKey; after: string }> = {
  block_room: { label: "admin_cm_action_block_chat", app: "admin_chat_s2_app_blocked", after: "blocked" },
  unblock_room: { label: "admin_cm_action_unblock_chat", app: "admin_chat_s2_app_restored", after: "active" },
  archive_room: { label: "admin_cm_action_archive", app: "admin_chat_s2_app_archived", after: "archived" },
  unarchive_room: { label: "admin_cm_action_unarchive", app: "admin_chat_s2_app_restored", after: "active" },
  readonly_on: { label: "admin_cm_action_readonly_on", app: "admin_chat_s2_app_readonly", after: "readonly" },
  readonly_off: { label: "admin_cm_action_readonly_off", app: "admin_chat_s2_app_restored", after: "active" },
};

export function adminChatRoomActionIsDestructive(action: AdminChatRoomAction): boolean {
  return action === "block_room" || action === "archive_room" || action === "readonly_on";
}

export function AdminChatRoomActionSheet({
  roomId,
  roomLabel,
  currentStatus,
  isReadonly,
  action,
  onClose,
  onSettled,
}: SettleProps & {
  roomId: string;
  roomLabel: string;
  currentStatus: string;
  isReadonly: boolean;
  action: AdminChatRoomAction;
}) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const meta = ROOM_ACTION_KEYS[action];
  const before = isReadonly && action.startsWith("readonly") ? "readonly" : currentStatus;
  return (
    <AdminChatActionSheet
      title={t(meta.label)}
      rows={[
        { label: t("admin_chat_sheet_target"), value: roomLabel },
        {
          label: t("admin_chat_sheet_state_change"),
          value: `${adminChatLabel("room_status", before, ko).label} → ${adminChatLabel("room_status", meta.after, ko).label}`,
        },
      ]}
      notice={t(meta.app)}
      reason={{ minLength: CHAT_ADMIN_ACTION_REASON_MIN_LENGTH }}
      destructive={adminChatRoomActionIsDestructive(action)}
      confirmLabel={t(meta.label)}
      onSubmit={(reason) =>
        adminChatSheetFetch(`/api/admin/community-messenger/rooms/${encodeURIComponent(roomId)}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, reason }),
        })
      }
      onClose={onClose}
      onSettled={onSettled}
    />
  );
}

/* ───────────── S3 메시지 숨김·해제 ───────────── */

export function AdminChatMessageHideSheet({
  roomId,
  messageId,
  senderLabel,
  createdAt,
  preview,
  hidden,
  onClose,
  onSettled,
}: SettleProps & {
  roomId: string;
  messageId: string;
  senderLabel: string;
  createdAt: string;
  preview: string;
  /** true = 숨김, false = 해제 */
  hidden: boolean;
}) {
  const { t, language } = useI18n();
  const label = hidden ? t("admin_cm_action_hide_message") : t("admin_cm_action_unhide_message");
  return (
    <AdminChatActionSheet
      title={label}
      rows={[
        { label: t("admin_chat_sheet_sender"), value: senderLabel || "—" },
        { label: t("admin_chat_sheet_sent_at"), value: createdAt ? formatAdminDateTime(createdAt, language) : "—" },
        { label: t("admin_chat_sheet_message"), value: preview.slice(0, 200) || "—" },
      ]}
      notice={hidden ? t("admin_chat_s3_notice_hide") : t("admin_chat_s3_notice_unhide")}
      reason={{ minLength: CHAT_ADMIN_ACTION_REASON_MIN_LENGTH }}
      destructive={hidden}
      confirmLabel={label}
      onSubmit={(reason) =>
        adminChatSheetFetch(
          `/api/admin/community-messenger/rooms/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(messageId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hidden, reason }),
          }
        )
      }
      onClose={onClose}
      onSettled={onSettled}
    />
  );
}

/* ───────────── S4 통화 강제 종료 ───────────── */

const FORCE_END_REASON_KEYS: Record<CommunityMessengerCallForceEndReasonCode, MessageKey> = {
  policy_violation: "admin_cm_force_end_reason_policy_violation",
  abuse_report: "admin_cm_force_end_reason_abuse_report",
  spam_or_ad: "admin_cm_force_end_reason_spam_or_ad",
  safety_risk: "admin_cm_force_end_reason_safety_risk",
  user_request: "admin_cm_force_end_reason_user_request",
  other: "admin_cm_force_end_reason_other",
};

export function AdminChatForceEndSheet({
  sessionId,
  callLabel,
  initiatorLabel,
  participantsLabel,
  startedAt,
  onClose,
  onSettled,
}: SettleProps & {
  sessionId: string;
  callLabel: string;
  initiatorLabel: string;
  participantsLabel: string;
  startedAt: string;
}) {
  const { t, language } = useI18n();
  const [reasonCode, setReasonCode] = useState<CommunityMessengerCallForceEndReasonCode | "">("");
  return (
    <AdminChatActionSheet
      title={t("admin_cm_modal_force_end_title")}
      rows={[
        { label: t("admin_cm_modal_target_call"), value: callLabel },
        { label: t("admin_cm_modal_initiator"), value: initiatorLabel || "—" },
        { label: t("admin_cm_modal_participants"), value: participantsLabel },
        { label: t("admin_chat_sheet_started_at"), value: startedAt ? formatAdminDateTime(startedAt, language) : "—" },
        ...(reasonCode ? [{ label: t("admin_cm_modal_reason_code"), value: t(FORCE_END_REASON_KEYS[reasonCode]) }] : []),
      ]}
      notice={t("admin_cm_modal_force_end_warning")}
      reason={{ minLength: CHAT_ADMIN_ACTION_REASON_MIN_LENGTH, placeholder: t("admin_cm_placeholder_ops_note") }}
      ready={reasonCode !== ""}
      destructive
      confirmLabel={t("admin_cm_action_force_end_confirm")}
      onSubmit={(adminNote) =>
        adminChatSheetFetch(`/api/admin/community-messenger/calls/${encodeURIComponent(sessionId)}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "force_end", reasonCode, adminNote }),
        })
      }
      onClose={onClose}
      onSettled={onSettled}
    >
      <label className="block">
        <span className="sam-text-helper font-medium text-sam-fg">{t("admin_cm_modal_reason_code")}</span>
        <select
          value={reasonCode}
          onChange={(e) => setReasonCode(e.target.value as CommunityMessengerCallForceEndReasonCode | "")}
          className={`mt-1 w-full ${OverlayUi.input}`}
        >
          <option value="">{t("admin_cm_select_force_end_reason")}</option>
          {COMMUNITY_MESSENGER_CALL_FORCE_END_REASONS.map(({ code }) => (
            <option key={code} value={code}>
              {t(FORCE_END_REASON_KEYS[code])}
            </option>
          ))}
        </select>
      </label>
    </AdminChatActionSheet>
  );
}

/* ───────────── S5 신고 처리 ───────────── */

export type AdminChatReportSheetAction =
  | "reviewing"
  | "resolved"
  | "rejected"
  | "sanction_message_hide"
  | "sanction_room_block";

export type AdminChatReportSheetInput = {
  source: ChatReportSource;
  id: string;
  /** 정규화 상태 묶음 */
  bucket: "received" | "reviewing" | "resolved" | "dismissed";
  reasonLabel: string;
  detail: string;
  reporterLabel: string;
  reportedLabel: string;
  createdAt: string;
  /** CM 메시지 id (메시지 숨김 제재 가능) */
  cmMessageId: string | null;
  /** CM 방 id (방 정지 제재 가능) */
  cmRoomId: string | null;
  reportedUserHref: string | null;
};

const REPORT_ACTION_KEYS: Record<AdminChatReportSheetAction, MessageKey> = {
  reviewing: "admin_cm_action_reviewing",
  resolved: "admin_cm_action_resolve",
  rejected: "admin_cm_action_dismiss",
  sanction_message_hide: "admin_cm_action_sanction_hide",
  sanction_room_block: "admin_cm_action_sanction_block_room",
};

const SOURCE_KEYS: Record<ChatReportSource, MessageKey> = {
  messenger: "admin_chat_report_source_messenger",
  trade_chat: "admin_chat_report_source_trade_chat",
  trade_report: "admin_chat_report_source_trade_report",
};

/** 원천·상태별 가능한 처리 (서버 `report-queue/action` 과 같은 규칙). */
export function adminChatReportActionsFor(input: AdminChatReportSheetInput): AdminChatReportSheetAction[] {
  if (input.bucket !== "received" && input.bucket !== "reviewing") return [];
  const out: AdminChatReportSheetAction[] = [];
  if (input.bucket === "received") out.push("reviewing");
  out.push("resolved", "rejected");
  if (input.cmMessageId) out.push("sanction_message_hide");
  if (input.cmRoomId) out.push("sanction_room_block");
  return out;
}

export function AdminChatReportSheet({
  report,
  onClose,
  onSettled,
}: SettleProps & { report: AdminChatReportSheetInput }) {
  const { t, language } = useI18n();
  const actions = adminChatReportActionsFor(report);
  const [action, setAction] = useState<AdminChatReportSheetAction | "">(actions.length === 1 ? actions[0] : "");
  const destructive = action === "sanction_message_hide" || action === "sanction_room_block" || action === "rejected";
  return (
    <AdminChatActionSheet
      title={t("admin_chat_s5_title")}
      rows={[
        { label: t("admin_chat_sheet_source"), value: t(SOURCE_KEYS[report.source]) },
        { label: t("admin_chat_sheet_report_reason"), value: [report.reasonLabel, report.detail].filter(Boolean).join(" · ") || "—" },
        { label: t("admin_chat_sheet_reporter"), value: `${report.reporterLabel || "—"} → ${report.reportedLabel || "—"}` },
        { label: t("admin_chat_sheet_received_at"), value: report.createdAt ? formatAdminDateTime(report.createdAt, language) : "—" },
        ...(action ? [{ label: t("admin_chat_sheet_action"), value: t(REPORT_ACTION_KEYS[action]) }] : []),
      ]}
      notice={
        action === "sanction_room_block"
          ? t("admin_chat_s2_app_blocked")
          : action === "sanction_message_hide"
            ? t("admin_chat_s3_notice_hide")
            : undefined
      }
      reason={{ minLength: CHAT_ADMIN_ACTION_REASON_MIN_LENGTH }}
      ready={action !== ""}
      destructive={destructive}
      confirmLabel={action ? t(REPORT_ACTION_KEYS[action]) : t("admin_chat_sheet_next")}
      onSubmit={(reason) =>
        adminChatSheetFetch("/api/admin/chat/report-queue/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: report.source, id: report.id, action, reason }),
        })
      }
      onClose={onClose}
      onSettled={onSettled}
    >
      <fieldset className="space-y-1">
        <legend className="sam-text-helper font-medium text-sam-fg">{t("admin_chat_sheet_action")}</legend>
        {actions.map((a) => (
          <label key={a} className="flex min-h-10 items-center gap-2 rounded-ui-rect border border-sam-border px-3 sam-text-body">
            <input type="radio" name="admin-chat-report-action" checked={action === a} onChange={() => setAction(a)} />
            {t(REPORT_ACTION_KEYS[a])}
          </label>
        ))}
      </fieldset>
      {report.reportedUserHref ? (
        <a href={report.reportedUserHref} className="block sam-text-helper font-medium text-signature underline">
          {t("admin_chat_s5_member_sanction_link")}
        </a>
      ) : null}
    </AdminChatActionSheet>
  );
}

/* ───────────── S6 영구 삭제 (레거시 전용 방 · super_admin) ───────────── */

export function AdminChatHardDeleteSheet({
  items,
  evidenceNote,
  onClose,
  onSettled,
}: SettleProps & {
  items: Array<{ id: string; storage: "chat_rooms" | "product_chats"; label: string }>;
  evidenceNote?: string;
}) {
  const { t } = useI18n();
  return (
    <AdminChatActionSheet
      title={t("admin_chat_s6_title")}
      rows={[
        { label: t("admin_chat_sheet_target"), value: items.map((i) => i.label).join(", ") },
        { label: t("admin_chat_s6_count"), value: String(items.length) },
      ]}
      notice={evidenceNote ?? t("admin_chat_s6_notice")}
      reason={{ minLength: CHAT_ROOM_HARD_DELETE_REASON_MIN_LENGTH }}
      retypeValue={CHAT_ROOM_HARD_DELETE_CONFIRM_TEXT}
      ready={items.length > 0}
      destructive
      confirmLabel={t("admin_chat_s6_confirm")}
      onSubmit={async (reason) => {
        // 200 이면 성공 — 증거 연결로 제외된 방(evidence_preserved)은 서버가 건너뛰고 감사에 남긴다.
        const res = await fetch("/api/admin/chat/rooms/bulk-delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: items.map(({ id, storage }) => ({ id, storage })),
            reason,
            confirmText: CHAT_ROOM_HARD_DELETE_CONFIRM_TEXT,
          }),
        }).catch(() => null);
        if (!res) return { ok: false, status: 0, code: "network_error" };
        if (res.ok) return { ok: true };
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        return { ok: false, status: res.status, code: json.error || `http_${res.status}` };
      }}
      onClose={onClose}
      onSettled={onSettled}
    />
  );
}
