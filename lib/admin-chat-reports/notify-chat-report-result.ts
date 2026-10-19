/**
 * 채팅 신고 처리 결과 알림 (설계 A-7) — 서버 전용.
 * - 신고자: 처리 완료·기각·제재로 종결되면 「신고가 처리되었습니다」 1회.
 * - 피신고자: 방 정지 제재일 때 「운영 정책에 따라 조치되었습니다」 1회 (메시지 숨김은 앱 미반영이라 알리지 않음).
 * 관리자 공지 형식(`system` · push `notice` · 채팅 도메인 없음) — 채팅 배지·방 unread 에 섞이지 않는다.
 * 실패해도 조치 결과에 영향 없음 (best-effort, 로그만).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";
import type { ChatReportSource } from "@/lib/admin/chat-admin/admin-chat-report-queue-model";

export type ChatReportResultAction =
  | "reviewing"
  | "resolved"
  | "rejected"
  | "sanction_message_hide"
  | "sanction_room_block";

const SOURCE_TABLE: Record<ChatReportSource, { table: string; reporter: string; reported: string | null }> = {
  messenger: { table: "community_messenger_reports", reporter: "reporter_user_id", reported: "reported_user_id" },
  trade_chat: { table: "chat_reports", reporter: "reporter_user_id", reported: "reported_user_id" },
  trade_report: { table: "reports", reporter: "reporter_id", reported: null },
};

export async function safeNotifyChatReportResult(
  sb: SupabaseClient,
  input: { source: ChatReportSource; reportId: string; action: ChatReportResultAction }
): Promise<void> {
  if (input.action === "reviewing") return;
  try {
    const meta = SOURCE_TABLE[input.source];
    const cols = [meta.reporter, meta.reported].filter(Boolean).join(", ");
    const { data } = await sb.from(meta.table).select(cols).eq("id", input.reportId).maybeSingle();
    const row = (data ?? {}) as Record<string, unknown>;
    const reporterId = String(row[meta.reporter] ?? "").trim();
    const reportedId = meta.reported ? String(row[meta.reported] ?? "").trim() : "";

    if (reporterId) {
      const lang = await loadNotificationUserLanguage(sb, reporterId);
      await appendUserNotification(sb, {
        user_id: reporterId,
        notification_type: "system",
        push_kind: "notice",
        ref_id: input.reportId,
        title: notifySafeT(lang, "notify_chat_report_result_title"),
        body: notifySafeT(
          lang,
          input.action === "rejected" ? "notify_chat_report_result_body_rejected" : "notify_chat_report_result_body_actioned"
        ),
        dedupe_key: `chat_report_result:${input.source}:${input.reportId}:reporter`,
        meta: { kind: "chat_report_result", source: input.source, report_id: input.reportId, action: input.action },
      });
    }
    // 메시지 숨김은 아직 사용자 대화창에 반영되지 않으므로(설계 S3) 피신고자 알림은 방 정지만.
    if (input.action === "sanction_room_block" && reportedId) {
      const lang = await loadNotificationUserLanguage(sb, reportedId);
      await appendUserNotification(sb, {
        user_id: reportedId,
        notification_type: "system",
        push_kind: "notice",
        ref_id: input.reportId,
        title: notifySafeT(lang, "notify_chat_report_sanction_title"),
        body: notifySafeT(lang, "notify_chat_report_sanction_body_room"),
        dedupe_key: `chat_report_result:${input.source}:${input.reportId}:reported`,
        meta: { kind: "chat_report_sanction", source: input.source, report_id: input.reportId, action: input.action },
      });
    }
  } catch (err) {
    console.error("[safeNotifyChatReportResult]", input.source, input.reportId, err);
  }
}
