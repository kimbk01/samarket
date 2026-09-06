/**
 * Feed Banner ops presentation SSOT — Admin queue/sheet + Member hub.
 * Projects request (+ campaign status/window) to product labels. No new DB enum family.
 * DO NOT filter admin "광고중" by raw feed_ad_requests.status alone.
 * DO NOT duplicate status switches in UI components.
 */

import {
  projectFeedAdMemberPresentation,
  resolveFeedAdPresentationInputs,
  type FeedAdMemberDisplayStatus,
} from "@/lib/ads/feed-ad-member-presentation";

export type FeedAdOpsProductStatus =
  | "pending_review"
  | "scheduled"
  | "active"
  | "paused"
  | "rejected"
  | "cancelled"
  | "ended";

export type FeedAdOpsStatusLabelLang = "ko" | "en";

const LABELS: Record<FeedAdOpsProductStatus, { ko: string; en: string }> = {
  pending_review: { ko: "심사중", en: "In review" },
  scheduled: { ko: "광고 예정", en: "Scheduled" },
  active: { ko: "광고중", en: "Running" },
  paused: { ko: "일시중지", en: "Paused" },
  rejected: { ko: "반려", en: "Rejected" },
  cancelled: { ko: "취소", en: "Cancelled" },
  ended: { ko: "종료", en: "Ended" },
};

export function feedAdOpsProductStatusFromDisplay(
  display: FeedAdMemberDisplayStatus | string
): FeedAdOpsProductStatus {
  const s = String(display ?? "").trim().toLowerCase();
  if (s === "pending_review" || s === "pending" || s === "held") return "pending_review";
  if (s === "scheduled") return "scheduled";
  if (s === "active" || s === "approved" || s === "captured") return "active";
  if (s === "paused") return "paused";
  if (s === "rejected") return "rejected";
  if (s === "cancelled") return "cancelled";
  if (s === "ended" || s === "expired") return "ended";
  return "ended";
}

export function projectFeedAdOpsProductStatus(input: {
  requestStatus: string;
  startAt?: string | null;
  endAt?: string | null;
  /** Prefer campaign fields — stale request copies must not keep "광고중". */
  campaignStatus?: string | null;
  campaignStartAt?: string | null;
  campaignEndAt?: string | null;
  nowMs?: number;
}): FeedAdOpsProductStatus {
  const resolved = resolveFeedAdPresentationInputs({
    requestStatus: input.requestStatus,
    requestStartAt: input.startAt,
    requestEndAt: input.endAt,
    campaignStatus: input.campaignStatus,
    campaignStartAt: input.campaignStartAt,
    campaignEndAt: input.campaignEndAt,
  });
  const presentation = projectFeedAdMemberPresentation({
    requestStatus: resolved.requestStatus,
    startAt: resolved.startAt,
    endAt: resolved.endAt,
    campaignStatus: resolved.campaignStatus,
    nowMs: input.nowMs,
  });
  return feedAdOpsProductStatusFromDisplay(presentation.displayStatus);
}

export function feedAdOpsStatusLabel(
  status: FeedAdOpsProductStatus | string,
  lang: FeedAdOpsStatusLabelLang = "ko"
): string {
  const key = feedAdOpsProductStatusFromDisplay(status);
  return LABELS[key][lang];
}

export type FeedAdOpsTimelineEvent = {
  id: string;
  at: string;
  kind:
    | "submitted"
    | "approved"
    | "rejected"
    | "member_cancelled"
    | "admin_ended"
    | "campaign_window"
    | "hold";
  labelKo: string;
  labelEn: string;
  detail?: string | null;
};

/** Project timeline from existing request/campaign/holds — no new events table. */
export function projectFeedAdOpsTimeline(input: {
  request: {
    createdAt: string;
    status: string;
    reviewReason?: string | null;
    reviewedAt?: string | null;
  };
  campaign?: {
    status: string;
    startAt?: string | null;
    endAt?: string | null;
  } | null;
  holds?: { amount: number; status: string; createdAt: string }[];
}): FeedAdOpsTimelineEvent[] {
  const events: FeedAdOpsTimelineEvent[] = [];
  const created = input.request.createdAt;
  if (created) {
    events.push({
      id: "submitted",
      at: created,
      kind: "submitted",
      labelKo: "신청",
      labelEn: "Submitted",
    });
  }
  for (const h of input.holds ?? []) {
    const st = String(h.status).toLowerCase();
    events.push({
      id: `hold-${h.createdAt}-${st}`,
      at: h.createdAt,
      kind: "hold",
      labelKo:
        st === "captured"
          ? "포인트 확정(CAPTURE)"
          : st === "released"
            ? "포인트 반환(RELEASE)"
            : "포인트 보류(HOLD)",
      labelEn:
        st === "captured"
          ? "Points captured"
          : st === "released"
            ? "Points released"
            : "Points held",
      detail: `${h.amount}P`,
    });
  }
  const reason = (input.request.reviewReason ?? "").trim();
  const reviewedAt = input.request.reviewedAt;
  const rs = String(input.request.status).toLowerCase();
  if (reviewedAt && rs === "rejected") {
    events.push({
      id: "rejected",
      at: reviewedAt,
      kind: "rejected",
      labelKo: "반려",
      labelEn: "Rejected",
      detail: reason || null,
    });
  }
  if (reviewedAt && (rs === "cancelled" || reason === "member_cancelled")) {
    events.push({
      id: "member_cancelled",
      at: reviewedAt,
      kind: "member_cancelled",
      labelKo: "회원 취소",
      labelEn: "Member cancelled",
    });
  }
  if (reviewedAt && (rs === "active" || rs === "ended" || rs === "approved")) {
    if (reason !== "member_cancelled") {
      events.push({
        id: "approved",
        at: reviewedAt,
        kind: "approved",
        labelKo: "승인",
        labelEn: "Approved",
      });
    }
  }
  if (input.campaign?.startAt) {
    events.push({
      id: "campaign_start",
      at: input.campaign.startAt,
      kind: "campaign_window",
      labelKo: "광고 시작",
      labelEn: "Campaign start",
    });
  }
  if (input.campaign?.endAt && String(input.campaign.status).toLowerCase() === "ended") {
    events.push({
      id: "admin_or_window_end",
      at: input.campaign.endAt,
      kind: "admin_ended",
      labelKo: "종료",
      labelEn: "Ended",
    });
  } else if (rs === "ended" && reviewedAt) {
    events.push({
      id: "request_ended",
      at: reviewedAt,
      kind: "admin_ended",
      labelKo: "종료",
      labelEn: "Ended",
    });
  }
  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return events;
}
