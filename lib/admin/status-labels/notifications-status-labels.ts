/**
 * 알림 작업 공간 상태 라벨 (수정 계획 2-4) — 화면에 원시 상태 코드를 그대로 쓰지 않는다.
 * - `notifications.campaign`: 알림 캠페인 상태 (`campaignStatusLabel` 과 같은 문구)
 * - `notifications.push_delivery`: 푸시 발송 기록 상태 (`push_deliveries.status`)
 * 부수효과 import 로 등록한다. Client-safe.
 */

import { registerAdminStatusLabels } from "@/lib/admin/status-labels/admin-status-label-registry";
import {
  CAMPAIGN_STATUSES,
  campaignStatusLabel,
  type CampaignStatus,
} from "@/lib/admin/notification-campaigns/campaign-status-machine";
import type { AdminStatusTone } from "@/lib/admin/status-labels/admin-status-label-registry";

export const NOTIFICATIONS_CAMPAIGN_STATUS_NS = "notifications.campaign";
export const NOTIFICATIONS_PUSH_DELIVERY_STATUS_NS = "notifications.push_delivery";

const CAMPAIGN_TONE: Record<CampaignStatus, AdminStatusTone> = {
  draft: "neutral",
  scheduled: "info",
  active: "info",
  paused: "warning",
  ended: "neutral",
  cancelled: "neutral",
  sending: "info",
  sent: "success",
  partially_failed: "warning",
  failed: "danger",
};

registerAdminStatusLabels(
  NOTIFICATIONS_CAMPAIGN_STATUS_NS,
  Object.fromEntries(
    CAMPAIGN_STATUSES.map((s) => [
      s,
      { ko: campaignStatusLabel(s, "ko"), en: campaignStatusLabel(s, "en"), tone: CAMPAIGN_TONE[s] },
    ])
  )
);

registerAdminStatusLabels(NOTIFICATIONS_PUSH_DELIVERY_STATUS_NS, {
  pending: { ko: "대기", en: "Pending", tone: "neutral" },
  sent: { ko: "발송 완료", en: "Sent", tone: "success" },
  skipped: { ko: "건너뜀", en: "Skipped", tone: "warning" },
  failed: { ko: "실패", en: "Failed", tone: "danger" },
  opened: { ko: "열어봄", en: "Opened", tone: "success" },
  dismissed: { ko: "닫음", en: "Dismissed", tone: "neutral" },
});
