"use client";

import { memo } from "react";
import { AlertCircle, Check, CheckCheck, Clock3 } from "lucide-react";
import type { MessageKey } from "@/lib/i18n/messages";
import type { MessengerOutboundStatus } from "@/lib/community-messenger/room/messenger-outbound-read-state";

/**
 * P1 전송 상태 SSOT (docs/audit/messenger-chat-audit-2026-11-18/appendix-P1-send-status-design.md B-1·B-2 #1).
 * 내 메시지 상태를 글자 대신 아이콘으로 — 전송 중(시계) · 실패(경고) · 저장됨(체크 1) · 읽음(체크 2).
 * 상자 폭은 상태와 무관하게 `w-4` 고정 → 상태가 바뀌어도 말풍선 폭·줄바꿈·높이가 바뀌지 않는다.
 */
export type MessengerOutboundStatusIconTone = "bubble-mine" | "on-photo" | "plain";

export const MESSENGER_OUTBOUND_STATUS_ICON_BOX_CLASS =
  "inline-flex h-[14px] w-4 shrink-0 items-center justify-center";

function toneClass(status: MessengerOutboundStatus, tone: MessengerOutboundStatusIconTone): string {
  if (status === "failed") return "text-sam-danger";
  if (tone === "on-photo") return "text-white";
  if (tone === "bubble-mine") return "text-[color:var(--cm-room-bubble-outgoing-fg,#fff)] opacity-80";
  return "text-[color:var(--cm-room-text-muted)]";
}

/** aria 문구 — 화면 글자가 아니라 읽기 도구용. `readTracked=false`(오픈 그룹)는 「보냄」 */
export function messengerOutboundStatusAriaKey(status: MessengerOutboundStatus, readTracked: boolean): MessageKey {
  if (status === "sending") return "common_sending";
  if (status === "failed") return "cm_ui_send_failed_label";
  if (status === "read") return "cm_ui_msg_status_read";
  return readTracked ? "cm_ui_unread" : "cm_ui_msg_status_sent";
}

export const MessengerOutboundStatusIcon = memo(function MessengerOutboundStatusIcon({
  status,
  readTracked,
  tone,
  t,
}: {
  status: MessengerOutboundStatus;
  /** 상대 읽음을 추적하는 방(1:1·비공개 그룹)인지 — SENT 의 aria 문구만 바뀐다 */
  readTracked: boolean;
  tone: MessengerOutboundStatusIconTone;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}) {
  const Glyph =
    status === "sending" ? Clock3 : status === "failed" ? AlertCircle : status === "read" ? CheckCheck : Check;
  return (
    <span
      role="img"
      aria-label={t(messengerOutboundStatusAriaKey(status, readTracked))}
      data-cm-outbound-status={status}
      className={`${MESSENGER_OUTBOUND_STATUS_ICON_BOX_CLASS} ${toneClass(status, tone)}`}
    >
      <Glyph className="h-[13px] w-[13px]" strokeWidth={2.25} aria-hidden />
    </span>
  );
});
