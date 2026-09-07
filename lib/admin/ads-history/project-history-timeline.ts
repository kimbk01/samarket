/**
 * CUT R7 — Pure timeline / row projectors from stored evidence shapes.
 * No DB. No invented timestamps. Actor never inferred.
 */

import { ADS_CANONICAL_PRODUCTS } from "@/lib/ads/ads-canonical-product-ssot";
import {
  formatHistoricalBusinessCashMinor,
  formatHistoricalPointAmount,
} from "@/lib/admin/ads-history/historical-amount";
import type {
  AdsHistoryLedgerRow,
  AdsHistoryPaymentState,
  AdsHistorySourceKind,
  AdsHistoryTimelineEvent,
} from "@/lib/admin/ads-history/types";

function sortTimeline(events: AdsHistoryTimelineEvent[]): AdsHistoryTimelineEvent[] {
  return [...events].sort((a, b) => {
    if (!a.at && !b.at) return 0;
    if (!a.at) return 1;
    if (!b.at) return -1;
    return a.at.localeCompare(b.at);
  });
}

function sourceLabels(kind: AdsHistorySourceKind): { ko: string; en: string } {
  switch (kind) {
    case "member":
      return { ko: "회원 신청", en: "Member application" };
    case "owner":
      return { ko: "매장 오너 신청", en: "Store owner application" };
    case "admin_direct":
      return { ko: "Admin 직접 등록", en: "Admin direct" };
    case "legacy_owner":
      return { ko: "레거시 오너 신청", en: "Legacy owner application" };
    default:
      return { ko: "출처 미확인", en: "Source unknown" };
  }
}

function paymentStateLabels(state: AdsHistoryPaymentState): { ko: string; en: string } {
  switch (state) {
    case "paid":
      return { ko: "결제 완료", en: "Paid" };
    case "hold":
      return { ko: "보류", en: "Hold" };
    case "refunded":
      return { ko: "환불", en: "Refunded" };
    case "none":
      return { ko: "결제 없음", en: "No payment" };
    case "not_proven":
      return { ko: "결제 증거 없음", en: "Payment not proven" };
    default:
      return { ko: "결제 상태 미확인", en: "Payment unknown" };
  }
}

function lifecycleFromParts(parts: string[]): { ko: string; en: string } {
  if (parts.length === 0) return { ko: "이력 구간 없음", en: "No lifecycle segments" };
  return { ko: parts.join(" → "), en: parts.join(" → ") };
}

export function projectBoostHistoryRow(input: {
  id: string;
  domain: "community" | "trade";
  orderStatus: string;
  createdAt: string | null;
  endAt: string | null;
  startAt: string | null;
  targetTitle: string | null;
  userId: string | null;
  pointCost: unknown;
}): AdsHistoryLedgerRow {
  const productKey = input.domain === "community" ? "community_boost" : "trade_boost";
  const canon = ADS_CANONICAL_PRODUCTS[productKey];
  const amount = formatHistoricalPointAmount(input.pointCost);
  const status = String(input.orderStatus ?? "").toLowerCase();
  const source = sourceLabels("member");
  const timeline: AdsHistoryTimelineEvent[] = [];

  timeline.push({
    kind: "application",
    labelKo: "신청",
    labelEn: "Application",
    at: input.createdAt,
    actorLabel: input.userId ? `회원 ${input.userId.slice(0, 8)}` : null,
    actorProven: Boolean(input.userId),
    amountLabel: null,
    reason: null,
    evidence: "event",
    evidenceNoteKo: null,
    evidenceNoteEn: null,
  });

  if (amount.proven) {
    timeline.push({
      kind: "payment",
      labelKo: "결제",
      labelEn: "Payment",
      at: input.createdAt,
      actorLabel: null,
      actorProven: false,
      amountLabel: amount.label,
      reason: null,
      evidence: "event",
      evidenceNoteKo: "point_promotion_orders.point_cost (역사 청구액)",
      evidenceNoteEn: "point_promotion_orders.point_cost (historical charged)",
    });
  } else {
    timeline.push({
      kind: "payment",
      labelKo: "결제",
      labelEn: "Payment",
      at: null,
      actorLabel: null,
      actorProven: false,
      amountLabel: null,
      reason: null,
      evidence: "not_proven",
      evidenceNoteKo: "금액 정보 없음",
      evidenceNoteEn: "Amount not stored",
    });
  }

  timeline.push({
    kind: "note",
    labelKo: "승인",
    labelEn: "Approval",
    at: null,
    actorLabel: null,
    actorProven: false,
    amountLabel: null,
    reason: null,
    evidence: "gap",
    evidenceNoteKo: "상위노출은 승인 절차 없음",
    evidenceNoteEn: "Boost has no approval workflow",
  });

  if (status === "paused") {
    timeline.push({
      kind: "operating",
      labelKo: "제재(일시중지)",
      labelEn: "Sanction (paused)",
      at: null,
      actorLabel: null,
      actorProven: false,
      amountLabel: null,
      reason: null,
      evidence: "state_only",
      evidenceNoteKo: "운영 변경 시각·관리자 미저장 — 현재 order_status만 확인",
      evidenceNoteEn: "No pause timestamp/actor — order_status only",
    });
  }

  if (status === "ended" || input.endAt) {
    timeline.push({
      kind: "end",
      labelKo: "종료",
      labelEn: "Ended",
      at: input.endAt,
      actorLabel: null,
      actorProven: false,
      amountLabel: null,
      reason: null,
      evidence: input.endAt ? "event" : "state_only",
      evidenceNoteKo: "종료 환불 이벤트 미저장(자동 환불 정책 없음)",
      evidenceNoteEn: "End refund event not stored (no auto-refund policy)",
    });
  }

  timeline.push({
    kind: "runtime_exposure",
    labelKo: "실제 노출 이벤트",
    labelEn: "Actual exposure events",
    at: null,
    actorLabel: null,
    actorProven: false,
    amountLabel: null,
    reason: null,
    evidence: "gap",
    evidenceNoteKo: "실제 노출 이벤트 없음 — 일정/상태만 존재",
    evidenceNoteEn: "No impression events — schedule/state only",
  });

  const lifeParts: string[] = ["신청", "결제"];
  if (status === "paused") lifeParts.push("제재");
  if (status === "ended") lifeParts.push("종료");
  else if (status === "active") lifeParts.push("노출");
  const life = lifecycleFromParts(lifeParts);
  const payState: AdsHistoryPaymentState = amount.proven ? "paid" : "not_proven";
  const payLabels = paymentStateLabels(payState);
  const finalKo =
    status === "ended"
      ? "종료"
      : status === "paused"
        ? "제재 중"
        : status === "active"
          ? "활성"
          : status || "미확인";
  const finalEn =
    status === "ended"
      ? "Ended"
      : status === "paused"
        ? "Sanctioned"
        : status === "active"
          ? "Active"
          : status || "Unknown";

  return {
    id: `boost:${productKey}:${input.id}`,
    productKey,
    domain: input.domain,
    productLabelKo: canon.publicNameKo,
    productLabelEn: canon.publicNameEn,
    campaignTitle: (input.targetTitle ?? "").trim() || input.id.slice(0, 8),
    sourceKind: "member",
    sourceLabelKo: source.ko,
    sourceLabelEn: source.en,
    applicantLabel: input.userId ? input.userId.slice(0, 8) : null,
    paymentCurrency: "POINT",
    historicalAmountLabel: amount.label,
    historicalAmountProven: amount.proven,
    paymentState: payState,
    paymentStateLabelKo: payLabels.ko,
    paymentStateLabelEn: payLabels.en,
    lifecycleSummaryKo: life.ko,
    lifecycleSummaryEn: life.en,
    finalStatusKo: finalKo,
    finalStatusEn: finalEn,
    lastEventAt: input.endAt || input.createdAt,
    placementLabelKo: canon.publicNameKo,
    placementLabelEn: canon.publicNameEn,
    placementEvidence: "schedule_only",
    legacy: false,
    sellable: true,
    detailHref: "/admin/advertising/boosts",
    operationsHref: "/admin/advertising/boosts",
    applicationsHref: null,
    timeline: sortTimeline(timeline),
    gapsKo: [
      "승인 절차 미적용(상위노출)",
      "운영 변경 관리자/시각 미저장",
      "실제 노출 이벤트 테이블 미저장",
      "종료 환불 이벤트 미저장(자동 환불 정책 없음)",
    ],
    gapsEn: [
      "No approval workflow (boost)",
      "Operating actor/timestamp not stored",
      "Impression event table not stored",
      "End refund event not stored (no auto-refund policy)",
    ],
  };
}

export function projectFeedBannerHistoryRow(input: {
  id: string;
  domain: "community" | "trade";
  kind: "request" | "campaign";
  status: string;
  createdAt: string | null;
  startAt: string | null;
  endAt: string | null;
  title: string | null;
  placement: string | null;
  source: "MEMBER_REQUESTED" | "ADMIN_DIRECT" | "request";
  userId: string | null;
  createdBy: string | null;
  pointCost: unknown;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewReason: string | null;
}): AdsHistoryLedgerRow {
  const productKey = input.domain === "community" ? "community_banner" : "trade_banner";
  const canon = ADS_CANONICAL_PRODUCTS[productKey];
  const adminDirect = input.source === "ADMIN_DIRECT";
  const sourceKind: AdsHistorySourceKind = adminDirect ? "admin_direct" : "member";
  const source = sourceLabels(sourceKind);
  const amount = adminDirect
    ? { label: null as string | null, proven: true }
    : formatHistoricalPointAmount(input.pointCost);
  const status = String(input.status ?? "").toLowerCase();
  const timeline: AdsHistoryTimelineEvent[] = [];

  timeline.push({
    kind: "application",
    labelKo: adminDirect ? "Admin 직접 등록" : "신청",
    labelEn: adminDirect ? "Admin direct register" : "Application",
    at: input.createdAt,
    actorLabel: adminDirect
      ? input.createdBy
        ? `Admin ${input.createdBy.slice(0, 8)}`
        : "Admin"
      : input.userId
        ? `회원 ${input.userId.slice(0, 8)}`
        : null,
    actorProven: adminDirect ? Boolean(input.createdBy) : Boolean(input.userId),
    amountLabel: null,
    reason: null,
    evidence: "event",
    evidenceNoteKo: null,
    evidenceNoteEn: null,
  });

  if (adminDirect) {
    timeline.push({
      kind: "payment",
      labelKo: "결제",
      labelEn: "Payment",
      at: null,
      actorLabel: null,
      actorProven: false,
      amountLabel: null,
      reason: null,
      evidence: "gap",
      evidenceNoteKo: "결제 없음",
      evidenceNoteEn: "No payment",
    });
    timeline.push({
      kind: "note",
      labelKo: "승인",
      labelEn: "Approval",
      at: null,
      actorLabel: null,
      actorProven: false,
      amountLabel: null,
      reason: null,
      evidence: "gap",
      evidenceNoteKo: "Admin Direct — 승인 절차 없음",
      evidenceNoteEn: "Admin Direct — no approval workflow",
    });
  } else {
    timeline.push({
      kind: "payment",
      labelKo: "결제/홀드",
      labelEn: "Payment/hold",
      at: input.createdAt,
      actorLabel: null,
      actorProven: false,
      amountLabel: amount.label,
      reason: null,
      evidence: amount.proven ? "event" : "not_proven",
      evidenceNoteKo: amount.proven
        ? "feed_ad_requests.point_cost"
        : "금액 정보 없음",
      evidenceNoteEn: amount.proven
        ? "feed_ad_requests.point_cost"
        : "Amount not stored",
    });
    if (input.reviewedAt || status === "rejected" || status === "active" || status === "approved") {
      const rejected = status === "rejected";
      timeline.push({
        kind: rejected ? "reject" : "approval",
        labelKo: rejected ? "반려" : "승인",
        labelEn: rejected ? "Rejected" : "Approved",
        at: input.reviewedAt,
        actorLabel: input.reviewedBy ? `Admin ${input.reviewedBy.slice(0, 8)}` : null,
        actorProven: Boolean(input.reviewedBy),
        amountLabel: null,
        reason: input.reviewReason,
        evidence: input.reviewedAt ? "event" : "state_only",
        evidenceNoteKo: input.reviewedBy ? null : "처리 관리자 미저장 또는 미확인",
        evidenceNoteEn: input.reviewedBy ? null : "Reviewer not stored/proven",
      });
    } else if (status === "pending_review" || status === "pending") {
      timeline.push({
        kind: "approval",
        labelKo: "승인 대기",
        labelEn: "Pending review",
        at: null,
        actorLabel: null,
        actorProven: false,
        amountLabel: null,
        reason: null,
        evidence: "state_only",
        evidenceNoteKo: null,
        evidenceNoteEn: null,
      });
    }
  }

  if (status === "paused") {
    timeline.push({
      kind: "operating",
      labelKo: "일시중지",
      labelEn: "Paused",
      at: null,
      actorLabel: null,
      actorProven: false,
      amountLabel: null,
      reason: null,
      evidence: "state_only",
      evidenceNoteKo: "운영 변경 이력 없음 — 캠페인 상태만 확인",
      evidenceNoteEn: "No ops event log — campaign status only",
    });
  }

  if (status === "ended" || status === "cancelled") {
    timeline.push({
      kind: "end",
      labelKo: status === "cancelled" ? "취소" : "종료",
      labelEn: status === "cancelled" ? "Cancelled" : "Ended",
      at: input.endAt,
      actorLabel: null,
      actorProven: false,
      amountLabel: null,
      reason: null,
      evidence: input.endAt ? "event" : "state_only",
      evidenceNoteKo: "종료 자동 환불 없음",
      evidenceNoteEn: "No automatic end refund",
    });
  }

  timeline.push({
    kind: "runtime_exposure",
    labelKo: "실제 노출 이벤트",
    labelEn: "Actual exposure events",
    at: null,
    actorLabel: null,
    actorProven: false,
    amountLabel: null,
    reason: null,
    evidence: "gap",
    evidenceNoteKo: "실제 노출 이벤트 없음 — 요청/캠페인 일정만",
    evidenceNoteEn: "No impression events — request/campaign schedule only",
  });

  const lifeParts: string[] = [adminDirect ? "Admin 등록" : "신청"];
  if (!adminDirect) lifeParts.push(amount.proven ? "Point" : "결제미확인");
  if (!adminDirect && (input.reviewedAt || status === "rejected" || status === "active")) {
    lifeParts.push(status === "rejected" ? "반려" : "승인");
  }
  if (status === "ended") lifeParts.push("종료");
  if (status === "paused") lifeParts.push("일시중지");
  const life = lifecycleFromParts(lifeParts);

  const payState: AdsHistoryPaymentState = adminDirect
    ? "none"
    : amount.proven
      ? status === "pending_review"
        ? "hold"
        : "paid"
      : "not_proven";
  const payLabels = paymentStateLabels(payState);
  const placement = (input.placement ?? "").trim();

  return {
    id: `feed_banner:${productKey}:${input.kind}:${input.id}`,
    productKey,
    domain: input.domain,
    productLabelKo: canon.publicNameKo,
    productLabelEn: canon.publicNameEn,
    campaignTitle: (input.title ?? "").trim() || input.id.slice(0, 8),
    sourceKind,
    sourceLabelKo: source.ko,
    sourceLabelEn: source.en,
    applicantLabel: adminDirect
      ? input.createdBy?.slice(0, 8) ?? "Admin"
      : input.userId?.slice(0, 8) ?? null,
    paymentCurrency: adminDirect ? "NONE" : "POINT",
    historicalAmountLabel: adminDirect ? null : amount.label,
    historicalAmountProven: adminDirect ? true : amount.proven,
    paymentState: payState,
    paymentStateLabelKo: payLabels.ko,
    paymentStateLabelEn: payLabels.en,
    lifecycleSummaryKo: life.ko,
    lifecycleSummaryEn: life.en,
    finalStatusKo: status || "미확인",
    finalStatusEn: status || "unknown",
    lastEventAt: input.reviewedAt || input.endAt || input.createdAt,
    placementLabelKo: placement || null,
    placementLabelEn: placement || null,
    placementEvidence: placement ? "event" : "not_proven",
    legacy: false,
    sellable: !adminDirect,
    detailHref: adminDirect
      ? "/admin/advertising/operations"
      : "/admin/advertising/applications",
    operationsHref: "/admin/advertising/operations",
    applicationsHref: adminDirect ? null : "/admin/advertising/applications",
    timeline: sortTimeline(timeline),
    gapsKo: [
      "실제 노출 이벤트 미저장",
      "운영 변경 관리자 미저장(캠페인)",
      "종료 환불 이벤트 미저장",
    ],
    gapsEn: [
      "Impression events not stored",
      "Ops actor not stored on campaign",
      "End refund event not stored",
    ],
  };
}

export function projectDeliveryHistoryRow(input: {
  id: string;
  product: "store_sponsored" | "banner";
  title: string | null;
  campaignSource: "OWNER_PAID" | "DIBAY_FIRST_PARTY";
  ownerUserId: string | null;
  lifecycleStatus: string;
  reviewStatus: string | null;
  createdAt: string | null;
  submittedAt: string | null;
  startAt: string | null;
  endAt: string | null;
  inventoryKeys: string[];
  sortOrder: number | null;
  finalPayableMinor: unknown;
  currency: string | null;
  audits: Array<{
    action: string;
    actorType: string;
    actorUserId: string | null;
    reason: string | null;
    createdAt: string;
  }>;
  refundProven: boolean;
  refundAmountLabel: string | null;
  impressionCount: number | null;
}): AdsHistoryLedgerRow {
  const productKey =
    input.product === "banner" ? "delivery_home_banner" : "delivery_store_sponsored";
  const canon = ADS_CANONICAL_PRODUCTS[productKey];
  const adminDirect = input.campaignSource === "DIBAY_FIRST_PARTY";
  const sourceKind: AdsHistorySourceKind = adminDirect ? "admin_direct" : "owner";
  const source = sourceLabels(sourceKind);
  const amount = adminDirect
    ? { label: null as string | null, proven: true }
    : formatHistoricalBusinessCashMinor(input.finalPayableMinor, input.currency);
  const timeline: AdsHistoryTimelineEvent[] = [];

  timeline.push({
    kind: "application",
    labelKo: adminDirect ? "Admin 직접 등록" : "오너 신청",
    labelEn: adminDirect ? "Admin direct" : "Owner application",
    at: input.submittedAt || input.createdAt,
    actorLabel: adminDirect
      ? "Admin"
      : input.ownerUserId
        ? `오너 ${input.ownerUserId.slice(0, 8)}`
        : null,
    actorProven: adminDirect ? false : Boolean(input.ownerUserId),
    amountLabel: null,
    reason: null,
    evidence: "event",
    evidenceNoteKo: adminDirect ? "신청자 Admin identity NOT_PROVEN on list row" : null,
    evidenceNoteEn: adminDirect ? "Admin actor id NOT_PROVEN on list row" : null,
  });

  timeline.push({
    kind: "payment",
    labelKo: "결제",
    labelEn: "Payment",
    at: adminDirect ? null : input.submittedAt || input.createdAt,
    actorLabel: null,
    actorProven: false,
    amountLabel: amount.label,
    reason: null,
    evidence: adminDirect ? "gap" : amount.proven ? "event" : "not_proven",
    evidenceNoteKo: adminDirect
      ? "결제 없음"
      : amount.proven
        ? "commercial snapshot final_payable_minor"
        : "금액 정보 없음",
    evidenceNoteEn: adminDirect
      ? "No payment"
      : amount.proven
        ? "commercial snapshot final_payable_minor"
        : "Amount not stored",
  });

  if (input.audits.length > 0) {
    for (const a of input.audits) {
      const action = a.action.toLowerCase();
      let kind: AdsHistoryTimelineEvent["kind"] = "operating";
      let labelKo = a.action;
      let labelEn = a.action;
      if (/approv|accept/.test(action)) {
        kind = "approval";
        labelKo = "승인";
        labelEn = "Approved";
      } else if (/reject|deny/.test(action)) {
        kind = "reject";
        labelKo = "반려";
        labelEn = "Rejected";
      } else if (/hold|incomplete|revision/.test(action)) {
        kind = "hold";
        labelKo = "보류";
        labelEn = "Hold";
      } else if (/pause/.test(action)) {
        labelKo = "일시중지";
        labelEn = "Paused";
      } else if (/resume/.test(action)) {
        labelKo = "재개";
        labelEn = "Resumed";
      } else if (/end|terminat|archiv/.test(action)) {
        kind = "end";
        labelKo = "종료";
        labelEn = "Ended";
      } else if (/refund/.test(action)) {
        kind = "refund";
        labelKo = "환불";
        labelEn = "Refund";
      }
      timeline.push({
        kind,
        labelKo,
        labelEn,
        at: a.createdAt,
        actorLabel: a.actorUserId
          ? `${a.actorType} ${a.actorUserId.slice(0, 8)}`
          : a.actorType || null,
        actorProven: Boolean(a.actorUserId),
        amountLabel: null,
        reason: a.reason,
        evidence: "event",
        evidenceNoteKo: "delivery_ad_audit_logs",
        evidenceNoteEn: "delivery_ad_audit_logs",
      });
    }
  } else {
    timeline.push({
      kind: "note",
      labelKo: "운영/승인 이벤트",
      labelEn: "Ops/approval events",
      at: null,
      actorLabel: null,
      actorProven: false,
      amountLabel: null,
      reason: null,
      evidence: "not_proven",
      evidenceNoteKo: "audit log 없음 — lifecycle/review 상태만 표시",
      evidenceNoteEn: "No audit rows — lifecycle/review state only",
    });
  }

  if (input.refundProven) {
    timeline.push({
      kind: "refund",
      labelKo: "환불",
      labelEn: "Refund",
      at: null,
      actorLabel: null,
      actorProven: false,
      amountLabel: input.refundAmountLabel,
      reason: null,
      evidence: "event",
      evidenceNoteKo: "BC refund evidence",
      evidenceNoteEn: "BC refund evidence",
    });
  } else {
    timeline.push({
      kind: "refund",
      labelKo: "환불",
      labelEn: "Refund",
      at: null,
      actorLabel: null,
      actorProven: false,
      amountLabel: null,
      reason: null,
      evidence: "gap",
      evidenceNoteKo: "환불 이력 없음",
      evidenceNoteEn: "No refund history",
    });
  }

  if (input.impressionCount != null && input.impressionCount > 0) {
    timeline.push({
      kind: "runtime_exposure",
      labelKo: `실제 노출 ${input.impressionCount}건`,
      labelEn: `${input.impressionCount} impressions`,
      at: null,
      actorLabel: null,
      actorProven: false,
      amountLabel: null,
      reason: null,
      evidence: "event",
      evidenceNoteKo: "delivery_ad_impression_events count",
      evidenceNoteEn: "delivery_ad_impression_events count",
    });
  } else {
    timeline.push({
      kind: "runtime_exposure",
      labelKo: "실제 노출 이벤트",
      labelEn: "Actual exposure events",
      at: null,
      actorLabel: null,
      actorProven: false,
      amountLabel: null,
      reason: null,
      evidence: "not_proven",
      evidenceNoteKo: "실제 노출 이벤트 없음(또는 미집계)",
      evidenceNoteEn: "No impression events (or not aggregated)",
    });
  }

  const lifeParts = [adminDirect ? "Admin 등록" : "오너 신청"];
  if (!adminDirect) lifeParts.push(amount.proven ? "Business Cash" : "결제미확인");
  if (input.audits.some((a) => /approv/i.test(a.action))) lifeParts.push("승인");
  if (input.audits.some((a) => /reject/i.test(a.action))) lifeParts.push("반려");
  if (/END|TERMINAT|ARCHIV/i.test(input.lifecycleStatus)) lifeParts.push("종료");
  const life = lifecycleFromParts(lifeParts);
  const payState: AdsHistoryPaymentState = adminDirect
    ? "none"
    : input.refundProven
      ? "refunded"
      : amount.proven
        ? "paid"
        : "not_proven";
  const payLabels = paymentStateLabels(payState);

  const placementBits = [...input.inventoryKeys];
  if (input.sortOrder != null) placementBits.push(`Slide ${input.sortOrder + 1}`);

  return {
    id: `delivery:${productKey}:${input.id}`,
    productKey,
    domain: "delivery",
    productLabelKo: canon.publicNameKo,
    productLabelEn: canon.publicNameEn,
    campaignTitle: (input.title ?? "").trim() || input.id.slice(0, 8),
    sourceKind,
    sourceLabelKo: source.ko,
    sourceLabelEn: source.en,
    applicantLabel: adminDirect
      ? "Admin"
      : input.ownerUserId?.slice(0, 8) ?? null,
    paymentCurrency: adminDirect ? "NONE" : "BUSINESS_CASH",
    historicalAmountLabel: amount.label,
    historicalAmountProven: amount.proven,
    paymentState: payState,
    paymentStateLabelKo: payLabels.ko,
    paymentStateLabelEn: payLabels.en,
    lifecycleSummaryKo: life.ko,
    lifecycleSummaryEn: life.en,
    finalStatusKo: input.lifecycleStatus,
    finalStatusEn: input.lifecycleStatus,
    lastEventAt: input.audits[0]?.createdAt || input.endAt || input.createdAt,
    placementLabelKo: placementBits.join(" · ") || null,
    placementLabelEn: placementBits.join(" · ") || null,
    placementEvidence: placementBits.length ? "event" : "not_proven",
    legacy: false,
    sellable: !adminDirect,
    detailHref: `/admin/stores/delivery-ads/${input.id}`,
    operationsHref: "/admin/advertising/operations",
    applicationsHref: adminDirect ? null : "/admin/advertising/applications",
    timeline: sortTimeline(timeline),
    gapsKo: [
      ...(input.audits.length ? [] : ["운영/승인 audit 없음"]),
      ...(input.refundProven ? [] : ["환불 이력 없음"]),
      ...(input.impressionCount && input.impressionCount > 0
        ? []
        : ["실제 노출 이벤트 없음(또는 미집계)"]),
    ],
    gapsEn: [
      ...(input.audits.length ? [] : ["No ops/approval audit"]),
      ...(input.refundProven ? [] : ["No refund history"]),
      ...(input.impressionCount && input.impressionCount > 0
        ? []
        : ["No impression events (or not aggregated)"]),
    ],
  };
}

export function projectPopupAdminHistoryRow(input: {
  id: string;
  name: string | null;
  status: string;
  approvalStatus: string | null;
  createdAt: string | null;
  createdBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  startAt: string | null;
  endAt: string | null;
  ownerRequestId: string | null;
}): AdsHistoryLedgerRow {
  const canon = ADS_CANONICAL_PRODUCTS.popup;
  const legacy = Boolean(input.ownerRequestId);
  const sourceKind: AdsHistorySourceKind = legacy ? "legacy_owner" : "admin_direct";
  const source = sourceLabels(sourceKind);
  const timeline: AdsHistoryTimelineEvent[] = [];

  timeline.push({
    kind: "application",
    labelKo: legacy ? "레거시 오너 연동 등록" : "Admin 직접 등록",
    labelEn: legacy ? "Legacy owner-linked register" : "Admin direct register",
    at: input.createdAt,
    actorLabel: input.createdBy ? `Admin ${input.createdBy.slice(0, 8)}` : "Admin",
    actorProven: Boolean(input.createdBy),
    amountLabel: null,
    reason: null,
    evidence: "event",
    evidenceNoteKo: null,
    evidenceNoteEn: null,
  });

  timeline.push({
    kind: "payment",
    labelKo: "결제",
    labelEn: "Payment",
    at: null,
    actorLabel: null,
    actorProven: false,
    amountLabel: null,
    reason: null,
    evidence: "gap",
    evidenceNoteKo: "결제 없음 (canonical Popup Admin Direct)",
    evidenceNoteEn: "No payment (canonical Popup Admin Direct)",
  });

  timeline.push({
    kind: "note",
    labelKo: "승인",
    labelEn: "Approval",
    at: input.approvedAt,
    actorLabel: input.approvedBy ? `Admin ${input.approvedBy.slice(0, 8)}` : null,
    actorProven: Boolean(input.approvedBy),
    amountLabel: null,
    reason: null,
    evidence: input.approvedAt ? "event" : "gap",
    evidenceNoteKo: input.approvedAt
      ? "stored approved_at (not a member approval queue)"
      : "신규 판매 승인 워크플로 없음",
    evidenceNoteEn: input.approvedAt
      ? "stored approved_at (not a member approval queue)"
      : "No new-sale approval workflow",
  });

  if (String(input.status).toLowerCase() === "ended" || input.endAt) {
    timeline.push({
      kind: "end",
      labelKo: "종료",
      labelEn: "Ended",
      at: input.endAt,
      actorLabel: null,
      actorProven: false,
      amountLabel: null,
      reason: null,
      evidence: input.endAt ? "event" : "state_only",
      evidenceNoteKo: null,
      evidenceNoteEn: null,
    });
  }

  timeline.push({
    kind: "refund",
    labelKo: "환불",
    labelEn: "Refund",
    at: null,
    actorLabel: null,
    actorProven: false,
    amountLabel: null,
    reason: null,
    evidence: "gap",
    evidenceNoteKo: "환불 이력 없음",
    evidenceNoteEn: "No refund history",
  });

  const payLabels = paymentStateLabels("none");
  const life = lifecycleFromParts([
    legacy ? "레거시" : "Admin 등록",
    "결제 없음",
    String(input.status),
  ]);

  return {
    id: `popup:campaign:${input.id}`,
    productKey: "popup",
    domain: "popup",
    productLabelKo: legacy ? `${canon.publicNameKo} (레거시)` : canon.publicNameKo,
    productLabelEn: legacy ? `${canon.publicNameEn} (legacy)` : canon.publicNameEn,
    campaignTitle: (input.name ?? "").trim() || input.id.slice(0, 8),
    sourceKind,
    sourceLabelKo: source.ko,
    sourceLabelEn: source.en,
    applicantLabel: input.createdBy?.slice(0, 8) ?? "Admin",
    paymentCurrency: "NONE",
    historicalAmountLabel: null,
    historicalAmountProven: true,
    paymentState: "none",
    paymentStateLabelKo: payLabels.ko,
    paymentStateLabelEn: payLabels.en,
    lifecycleSummaryKo: life.ko,
    lifecycleSummaryEn: life.en,
    finalStatusKo: input.status,
    finalStatusEn: input.status,
    lastEventAt: input.endAt || input.approvedAt || input.createdAt,
    placementLabelKo: "Popup surface",
    placementLabelEn: "Popup surface",
    placementEvidence: "schedule_only",
    legacy,
    sellable: false,
    detailHref: "/admin/advertising/operations",
    operationsHref: "/admin/advertising/operations",
    applicationsHref: null,
    timeline: sortTimeline(timeline),
    gapsKo: ["실제 노출 이벤트는 상세 집계 시 별도 확인", "환불 이력 없음"],
    gapsEn: ["Impression events require separate aggregation", "No refund history"],
  };
}

export function projectPopupOwnerLegacyHistoryRow(input: {
  id: string;
  title: string | null;
  requestStatus: string;
  createdAt: string | null;
  ownerUserId: string | null;
  storeId: string | null;
  priceMinor: unknown;
  currency: string | null;
  paymentStatus: string | null;
}): AdsHistoryLedgerRow {
  const canon = ADS_CANONICAL_PRODUCTS.popup;
  const amount = formatHistoricalBusinessCashMinor(input.priceMinor, input.currency);
  const payStatus = String(input.paymentStatus ?? "").toLowerCase();
  const payState: AdsHistoryPaymentState =
    payStatus === "refunded"
      ? "refunded"
      : payStatus === "funded"
        ? "paid"
        : amount.proven
          ? "unknown"
          : "not_proven";
  const source = sourceLabels("legacy_owner");
  const timeline: AdsHistoryTimelineEvent[] = [
    {
      kind: "application",
      labelKo: "레거시 오너 신청",
      labelEn: "Legacy owner application",
      at: input.createdAt,
      actorLabel: input.ownerUserId ? `오너 ${input.ownerUserId.slice(0, 8)}` : null,
      actorProven: Boolean(input.ownerUserId),
      amountLabel: null,
      reason: null,
      evidence: "event",
      evidenceNoteKo: "신규 판매 비활성 — 이력 보존만",
      evidenceNoteEn: "New sales disabled — history preserve only",
    },
    {
      kind: "payment",
      labelKo: "결제",
      labelEn: "Payment",
      at: input.createdAt,
      actorLabel: null,
      actorProven: false,
      amountLabel: amount.label,
      reason: null,
      evidence: amount.proven ? "event" : "not_proven",
      evidenceNoteKo: amount.proven
        ? "platform_popup_owner_requests.price_minor"
        : "금액 정보 없음",
      evidenceNoteEn: amount.proven
        ? "platform_popup_owner_requests.price_minor"
        : "Amount not stored",
    },
    {
      kind: "refund",
      labelKo: "환불",
      labelEn: "Refund",
      at: null,
      actorLabel: null,
      actorProven: false,
      amountLabel: null,
      reason: null,
      evidence: payStatus === "refunded" ? "event" : "gap",
      evidenceNoteKo:
        payStatus === "refunded"
          ? "payment_status=refunded"
          : "환불 이력 없음(반려만으로 환불 추정 금지)",
      evidenceNoteEn:
        payStatus === "refunded"
          ? "payment_status=refunded"
          : "No refund — do not infer from rejection",
    },
  ];
  const payLabels = paymentStateLabels(payState);
  const life = lifecycleFromParts(["레거시 오너 신청", payLabels.ko, input.requestStatus]);

  return {
    id: `popup:owner_request:${input.id}`,
    productKey: "popup",
    domain: "popup",
    productLabelKo: `${canon.publicNameKo} (레거시)`,
    productLabelEn: `${canon.publicNameEn} (legacy)`,
    campaignTitle: (input.title ?? "").trim() || input.id.slice(0, 8),
    sourceKind: "legacy_owner",
    sourceLabelKo: source.ko,
    sourceLabelEn: source.en,
    applicantLabel: input.ownerUserId?.slice(0, 8) ?? null,
    paymentCurrency: "BUSINESS_CASH",
    historicalAmountLabel: amount.label,
    historicalAmountProven: amount.proven,
    paymentState: payState,
    paymentStateLabelKo: payLabels.ko,
    paymentStateLabelEn: payLabels.en,
    lifecycleSummaryKo: life.ko,
    lifecycleSummaryEn: life.en,
    finalStatusKo: input.requestStatus,
    finalStatusEn: input.requestStatus,
    lastEventAt: input.createdAt,
    placementLabelKo: "Popup (legacy owner)",
    placementLabelEn: "Popup (legacy owner)",
    placementEvidence: "schedule_only",
    legacy: true,
    sellable: false,
    detailHref: null,
    operationsHref: "/admin/advertising/operations",
    applicationsHref: null,
    timeline: sortTimeline(timeline),
    gapsKo: ["신규 판매 비활성", "승인/운영 상세는 별도 audit 확인"],
    gapsEn: ["New sales disabled", "Ops/approval details need separate audit"],
  };
}
