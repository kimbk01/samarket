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
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { adsBoostOrderDeepLinkHref } from "@/lib/admin/ads-exposure/boost-order-deep-link";
import { adsOpsStatusLabel, mapRawToAdsOpsStatus } from "@/lib/admin/ads-exposure/ops-status";
import { catalogPair } from "@/lib/i18n/catalog-pair";
import { translate, type MessageKey } from "@/lib/i18n/messages";

/** 한국어 화면 문구(카탈로그) */
function K(key: MessageKey, vars?: Record<string, string | number>): string {
  return translate("ko", key, vars);
}
/** 영어 화면 문구(카탈로그) */
function EN(key: MessageKey, vars?: Record<string, string | number>): string {
  return translate("en", key, vars);
}

/**
 * AD-129 · AD-308: 이력 「상세」= 그 항목 하나를 여는 주소.
 * 피드 회원 신청 → 신청 상세 · 피드 운영자 등록 캠페인 → 캠페인 수정 화면(`[campaignId]` 단독 페이지 없음) ·
 * 운영자 팝업 → 팝업 캠페인 상세 · 사장님 팝업(이전 방식) 신청 → 팝업 신청 상세.
 */
export const ADS_HISTORY_DETAIL_HREF = {
  feedRequest: (id: string) => `/admin/feed-ad-requests/${encodeURIComponent(id)}`,
  feedCampaign: (id: string) => `/admin/feed-ads/${encodeURIComponent(id)}/edit`,
  popupCampaign: (id: string) => `/admin/platform-popup/${encodeURIComponent(id)}`,
  popupOwnerRequest: (id: string) => `/admin/platform-popup/requests/${encodeURIComponent(id)}`,
} as const;

/** 행위자 표기 (한국어 화면) — 영어 역할 코드를 보이지 않는다 */
function actorKo(role: "admin" | "owner" | "member", id: string | null): string {
  const name = K(role === "admin" ? "admin_ads_history_actor_admin" : role === "owner" ? "admin_ads_history_actor_owner" : "admin_ads_history_actor_member");
  return id ? `${name} ${id.slice(0, 8)}` : name;
}

/** 배달 감사 행 `actor_type` → 한국어 행위자 이름 */
function deliveryActorTypeKo(actorType: string): string {
  const t = actorType.trim().toLowerCase();
  if (t === "admin" || t === "operator" || t === "staff") return K("admin_ads_history_actor_admin");
  if (t === "owner" || t === "store_owner" || t === "store") return K("admin_ads_history_actor_owner");
  if (t === "system" || t === "cron") return K("admin_ads_history_actor_system");
  if (t === "member" || t === "user") return K("admin_ads_history_actor_member");
  return K("admin_ads_history_actor_other");
}

/** 원래 상태 코드 → 한국어 운영 상태 이름 */
function statusKo(raw: string): string {
  return /^[A-Za-z_]+$/.test(raw.trim()) ? adsOpsStatusLabel(mapRawToAdsOpsStatus(raw), true) : raw;
}

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
      return catalogPair("admin_member_application");
    case "owner":
      return catalogPair("admin_store_owner_application");
    case "admin_direct":
      return catalogPair("admin_admin_direct");
    case "legacy_owner":
      return catalogPair("admin_legacy_owner_application");
    default:
      return catalogPair("admin_source_unknown");
  }
}

function paymentStateLabels(state: AdsHistoryPaymentState): { ko: string; en: string } {
  switch (state) {
    case "paid":
      return catalogPair("admin_paid_2");
    case "hold":
      return catalogPair("admin_delivery_ads_action_request_changes");
    case "refunded":
      return catalogPair("admin_ads_payment_status_refunded");
    case "none":
      return catalogPair("admin_no_payment");
    case "not_proven":
      return catalogPair("admin_payment_not_proven");
    default:
      return catalogPair("admin_payment_unknown");
  }
}

function lifecycleFromParts(parts: string[]): { ko: string; en: string } {
  if (parts.length === 0) return catalogPair("admin_no_lifecycle_segments");
  return { ko: parts.join(" → "), en: parts.join(" → ") };
}

/** 진행 단계 키 → 한국어·영어 요약 */
function lifecycleFromKeys(parts: MessageKey[]): { ko: string; en: string } {
  if (parts.length === 0) return catalogPair("admin_no_lifecycle_segments");
  return { ko: parts.map((p) => K(p)).join(" → "), en: parts.map((p) => EN(p)).join(" → ") };
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
  /** L25: 같은 금액의 영어 칸 (화면이 언어에 따라 고름) */
  const amountEn = formatHistoricalPointAmount(input.pointCost, false);
  const status = String(input.orderStatus ?? "").toLowerCase();
  const source = sourceLabels("member");
  const timeline: AdsHistoryTimelineEvent[] = [];

  timeline.push({
    kind: "application",
    labelKo: "신청",
    labelEn: "Application",
    at: input.createdAt,
    actorLabel: input.userId ? actorKo("member", input.userId) : null,
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
      amountLabelEn: amountEn.label,
      reason: null,
      evidence: "event",
      evidenceNoteKo: "주문에 저장된 당시 청구 포인트",
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
      evidenceNoteKo: "운영 변경 시각·관리자 미저장 — 현재 주문 상태만 확인",
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

  const lifeParts: MessageKey[] = ["admin_ads_history_life_application", "admin_ads_history_life_payment"];
  if (status === "paused") lifeParts.push("admin_ads_history_life_sanction");
  if (status === "ended") lifeParts.push("admin_ads_history_life_ended");
  else if (status === "active") lifeParts.push("admin_ads_history_life_exposing");
  const life = lifecycleFromKeys(lifeParts);
  const payState: AdsHistoryPaymentState = amount.proven ? "paid" : "not_proven";
  const payLabels = paymentStateLabels(payState);
  const finalKey: MessageKey | null =
    status === "ended"
      ? "admin_ads_history_life_ended"
      : status === "paused"
        ? "admin_ads_history_final_sanctioned"
        : status === "active"
          ? "admin_ads_history_final_active"
          : status
            ? null
            : "admin_ads_history_unknown";
  const finalKo = finalKey ? K(finalKey) : status;
  const finalEn = finalKey ? EN(finalKey) : status;

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
    historicalAmountLabelEn: amountEn.label,
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
    // 재감사 S-1 (H-5): 목록 자체가 아니라 그 주문을 집어 연다
    detailHref: adsBoostOrderDeepLinkHref(input.id),
    operationsHref: "/admin/advertising/boosts",
    applicationsHref: null,
    timeline: sortTimeline(timeline),
    gapsKo: [K("admin_ads_history_gap_boost_no_approval"), K("admin_ads_history_gap_ops_actor_time"), K("admin_ads_history_gap_impression_table"), K("admin_ads_history_gap_end_refund_no_policy")],
    gapsEn: [EN("admin_ads_history_gap_boost_no_approval"), EN("admin_ads_history_gap_ops_actor_time"), EN("admin_ads_history_gap_impression_table"), EN("admin_ads_history_gap_end_refund_no_policy")],
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
  /** L25: 같은 금액의 영어 칸 (화면이 언어에 따라 고름) */
  const amountEn = adminDirect ? { label: null as string | null } : formatHistoricalPointAmount(input.pointCost, false);
  const status = String(input.status ?? "").toLowerCase();
  const timeline: AdsHistoryTimelineEvent[] = [];

  timeline.push({
    kind: "application",
    labelKo: K(adminDirect ? "admin_ads_history_admin_direct_register" : "admin_ads_history_life_application"),
    labelEn: EN(adminDirect ? "admin_ads_history_admin_direct_register" : "admin_ads_history_life_application"),
    at: input.createdAt,
    actorLabel: adminDirect
      ? actorKo("admin", input.createdBy)
      : input.userId
        ? actorKo("member", input.userId)
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
      evidenceNoteKo: "운영자 등록 — 승인 절차 없음",
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
      amountLabelEn: amountEn.label,
      reason: null,
      evidence: amount.proven ? "event" : "not_proven",
      evidenceNoteKo: K(amount.proven ? "admin_ads_history_note_points_saved" : "admin_ads_history_amount_missing"),
      evidenceNoteEn: EN(amount.proven ? "admin_ads_history_note_points_saved" : "admin_ads_history_amount_missing"),
    });
    if (input.reviewedAt || status === "rejected" || status === "active" || status === "approved") {
      const rejected = status === "rejected";
      timeline.push({
        kind: rejected ? "reject" : "approval",
        labelKo: K(rejected ? "admin_ads_history_rejected" : "admin_ads_history_approved"),
        labelEn: EN(rejected ? "admin_ads_history_rejected" : "admin_ads_history_approved"),
        at: input.reviewedAt,
        actorLabel: input.reviewedBy ? actorKo("admin", input.reviewedBy) : null,
        actorProven: Boolean(input.reviewedBy),
        amountLabel: null,
        reason: input.reviewReason,
        evidence: input.reviewedAt ? "event" : "state_only",
        evidenceNoteKo: input.reviewedBy ? null : K("admin_ads_history_reviewer_missing"),
        evidenceNoteEn: input.reviewedBy ? null : EN("admin_ads_history_reviewer_missing"),
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
      labelKo: K(status === "cancelled" ? "admin_ads_history_cancelled" : "admin_ads_history_life_ended"),
      labelEn: EN(status === "cancelled" ? "admin_ads_history_cancelled" : "admin_ads_history_life_ended"),
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

  const lifeParts: MessageKey[] = [adminDirect ? "admin_ads_history_admin_direct_register" : "admin_ads_history_life_application"];
  if (!adminDirect) lifeParts.push(amount.proven ? "admin_ads_history_points" : "admin_ads_history_payment_unknown");
  if (!adminDirect && (input.reviewedAt || status === "rejected" || status === "active")) {
    lifeParts.push(status === "rejected" ? "admin_ads_history_rejected" : "admin_ads_history_approved");
  }
  if (status === "ended") lifeParts.push("admin_ads_history_life_ended");
  if (status === "paused") lifeParts.push("admin_ads_history_paused");
  const life = lifecycleFromKeys(lifeParts);

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
      ? input.createdBy?.slice(0, 8) ?? K("admin_ads_history_actor_admin")
      : input.userId?.slice(0, 8) ?? null,
    paymentCurrency: adminDirect ? "NONE" : "POINT",
    historicalAmountLabel: adminDirect ? null : amount.label,
    historicalAmountProven: adminDirect ? true : amount.proven,
    paymentState: payState,
    paymentStateLabelKo: payLabels.ko,
    paymentStateLabelEn: payLabels.en,
    lifecycleSummaryKo: life.ko,
    lifecycleSummaryEn: life.en,
    finalStatusKo: status || K("admin_ads_history_unknown"),
    finalStatusEn: status || "unknown",
    lastEventAt: input.reviewedAt || input.endAt || input.createdAt,
    placementLabelKo: placement || null,
    placementLabelEn: placement || null,
    placementEvidence: placement ? "event" : "not_proven",
    legacy: false,
    sellable: !adminDirect,
    detailHref:
      input.kind === "request"
        ? ADS_HISTORY_DETAIL_HREF.feedRequest(input.id)
        : ADS_HISTORY_DETAIL_HREF.feedCampaign(input.id),
    operationsHref: "/admin/advertising/operations",
    applicationsHref: adminDirect ? null : "/admin/advertising/applications",
    timeline: sortTimeline(timeline),
    gapsKo: [K("admin_ads_history_gap_impressions"), K("admin_ads_history_gap_ops_actor_campaign"), K("admin_ads_history_gap_end_refund")],
    gapsEn: [EN("admin_ads_history_gap_impressions"), EN("admin_ads_history_gap_ops_actor_campaign"), EN("admin_ads_history_gap_end_refund")],
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
  /** L25: 비즈니스 캐시 금액은 통화 코드 + 숫자라 언어와 무관 — 영어 칸도 같은 값 */
  const amountEn = amount;
  const timeline: AdsHistoryTimelineEvent[] = [];

  timeline.push({
    kind: "application",
    labelKo: K(adminDirect ? "admin_ads_history_admin_direct" : "admin_ads_history_owner_application"),
    labelEn: EN(adminDirect ? "admin_ads_history_admin_direct" : "admin_ads_history_owner_application"),
    at: input.submittedAt || input.createdAt,
    actorLabel: adminDirect
      ? actorKo("admin", null)
      : input.ownerUserId
        ? actorKo("owner", input.ownerUserId)
        : null,
    actorProven: adminDirect ? false : Boolean(input.ownerUserId),
    amountLabel: null,
    reason: null,
    evidence: "event",
    evidenceNoteKo: adminDirect ? K("admin_ads_history_admin_actor_missing") : null,
    evidenceNoteEn: adminDirect ? EN("admin_ads_history_admin_actor_missing") : null,
  });

  timeline.push({
    kind: "payment",
    labelKo: "결제",
    labelEn: "Payment",
    at: adminDirect ? null : input.submittedAt || input.createdAt,
    actorLabel: null,
    actorProven: false,
    amountLabel: amount.label,
      amountLabelEn: amountEn.label,
    reason: null,
    evidence: adminDirect ? "gap" : amount.proven ? "event" : "not_proven",
    evidenceNoteKo: K(adminDirect ? "admin_ads_history_no_payment" : amount.proven ? "admin_ads_history_amount_saved_at_application" : "admin_ads_history_amount_missing"),
    evidenceNoteEn: EN(adminDirect ? "admin_ads_history_no_payment" : amount.proven ? "admin_ads_history_amount_saved_at_application" : "admin_ads_history_amount_missing"),
  });

  if (input.audits.length > 0) {
    for (const a of input.audits) {
      const action = a.action.toLowerCase();
      let kind: AdsHistoryTimelineEvent["kind"] = "operating";
      let labelKo = K("admin_ads_history_ops_change");
      let labelEn = a.action;
      if (/approv|accept/.test(action)) {
        kind = "approval";
        labelKo = K("admin_ads_history_approved");
        labelEn = EN("admin_ads_history_approved");
      } else if (/reject|deny/.test(action)) {
        kind = "reject";
        labelKo = K("admin_ads_history_rejected");
        labelEn = EN("admin_ads_history_rejected");
      } else if (/hold|incomplete|revision/.test(action)) {
        kind = "hold";
        labelKo = K("admin_ads_history_hold");
        labelEn = EN("admin_ads_history_hold");
      } else if (/pause/.test(action)) {
        labelKo = K("admin_ads_history_paused");
        labelEn = EN("admin_ads_history_paused");
      } else if (/resume/.test(action)) {
        labelKo = K("admin_ads_history_resumed");
        labelEn = EN("admin_ads_history_resumed");
      } else if (/end|terminat|archiv/.test(action)) {
        kind = "end";
        labelKo = K("admin_ads_history_life_ended");
        labelEn = EN("admin_ads_history_life_ended");
      } else if (/refund/.test(action)) {
        kind = "refund";
        labelKo = K("admin_ads_history_refund");
        labelEn = EN("admin_ads_history_refund");
      }
      timeline.push({
        kind,
        labelKo,
        labelEn,
        at: a.createdAt,
        actorLabel: a.actorUserId
          ? `${deliveryActorTypeKo(a.actorType)} ${a.actorUserId.slice(0, 8)}`
          : a.actorType
            ? deliveryActorTypeKo(a.actorType)
            : null,
        actorProven: Boolean(a.actorUserId),
        amountLabel: null,
        reason: a.reason,
        evidence: "event",
        evidenceNoteKo: "배달 광고 감사 기록",
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
      evidenceNoteKo: "감사 기록 없음 — 진행·심사 상태만 표시",
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
      evidenceNoteKo: "환불 기록 있음",
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
      evidenceNoteKo: "배달 광고 노출 기록 건수",
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

  const lifeParts = [K(adminDirect ? "admin_ads_history_admin_direct" : "admin_ads_history_owner_application")];
  if (!adminDirect) lifeParts.push(K(amount.proven ? "admin_ads_history_life_payment" : "admin_ads_history_payment_unknown"));
  if (input.audits.some((a) => /approv/i.test(a.action))) lifeParts.push(K("admin_ads_history_approved"));
  if (input.audits.some((a) => /reject/i.test(a.action))) lifeParts.push(K("admin_ads_history_rejected"));
  if (/END|TERMINAT|ARCHIV/i.test(input.lifecycleStatus)) lifeParts.push(K("admin_ads_history_life_ended"));
  const life = lifecycleFromParts(lifeParts);
  const lifeEnParts = [adminDirect ? "Admin direct" : "Owner application"];
  if (!adminDirect) lifeEnParts.push(amount.proven ? "Business Cash" : "Payment unknown");
  if (input.audits.some((a) => /approv/i.test(a.action))) lifeEnParts.push("Approved");
  if (input.audits.some((a) => /reject/i.test(a.action))) lifeEnParts.push("Rejected");
  if (/END|TERMINAT|ARCHIV/i.test(input.lifecycleStatus)) lifeEnParts.push("Ended");
  const payState: AdsHistoryPaymentState = adminDirect
    ? "none"
    : input.refundProven
      ? "refunded"
      : amount.proven
        ? "paid"
        : "not_proven";
  const payLabels = paymentStateLabels(payState);

  const placementBits = [...input.inventoryKeys];
  const placementBitsEn = [...input.inventoryKeys];
  if (input.sortOrder != null) {
    placementBits.push(K("admin_ads_history_slide_n", { n: input.sortOrder + 1 }));
    placementBitsEn.push(EN("admin_ads_history_slide_n", { n: input.sortOrder + 1 }));
  }

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
      ? K("admin_ads_history_actor_admin")
      : input.ownerUserId?.slice(0, 8) ?? null,
    paymentCurrency: adminDirect ? "NONE" : "BUSINESS_CASH",
    historicalAmountLabel: amount.label,
    historicalAmountLabelEn: amountEn.label,
    historicalAmountProven: amount.proven,
    paymentState: payState,
    paymentStateLabelKo: payLabels.ko,
    paymentStateLabelEn: payLabels.en,
    lifecycleSummaryKo: life.ko,
    lifecycleSummaryEn: lifeEnParts.join(" → "),
    finalStatusKo: input.lifecycleStatus,
    finalStatusEn: input.lifecycleStatus,
    lastEventAt: input.audits[0]?.createdAt || input.endAt || input.createdAt,
    placementLabelKo: placementBits.join(" · ") || null,
    placementLabelEn: placementBitsEn.join(" · ") || null,
    placementEvidence: placementBits.length ? "event" : "not_proven",
    legacy: false,
    sellable: !adminDirect,
    // 재감사 S-1 (H-5): 예전 주소 `/admin/stores/delivery-ads/{id}` 는 없는 경로(404) — 배달 광고 상세
    detailHref: DELIVERY_AD_ADMIN_ROUTES.detail(input.id),
    operationsHref: "/admin/advertising/operations",
    applicationsHref: adminDirect ? null : "/admin/advertising/applications",
    timeline: sortTimeline(timeline),
    gapsKo: [
      ...(input.audits.length ? [] : [K("admin_ads_history_gap_no_ops_audit")]),
      ...(input.refundProven ? [] : [K("admin_ads_history_no_refund_history")]),
      ...(input.impressionCount && input.impressionCount > 0 ? [] : [K("admin_ads_history_no_impressions_unaggregated")]),
    ],
    gapsEn: [
      ...(input.audits.length ? [] : [EN("admin_ads_history_gap_no_ops_audit")]),
      ...(input.refundProven ? [] : [EN("admin_ads_history_no_refund_history")]),
      ...(input.impressionCount && input.impressionCount > 0 ? [] : [EN("admin_ads_history_no_impressions_unaggregated")]),
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
    labelKo: K(legacy ? "admin_ads_history_legacy_owner_linked_register" : "admin_ads_history_admin_direct_register"),
    labelEn: EN(legacy ? "admin_ads_history_legacy_owner_linked_register" : "admin_ads_history_admin_direct_register"),
    at: input.createdAt,
    actorLabel: actorKo("admin", input.createdBy),
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
    evidenceNoteKo: "결제 없음 (운영자 등록 팝업)",
    evidenceNoteEn: "No payment (canonical Popup Admin Direct)",
  });

  timeline.push({
    kind: "note",
    labelKo: "승인",
    labelEn: "Approval",
    at: input.approvedAt,
    actorLabel: input.approvedBy ? actorKo("admin", input.approvedBy) : null,
    actorProven: Boolean(input.approvedBy),
    amountLabel: null,
    reason: null,
    evidence: input.approvedAt ? "event" : "gap",
    evidenceNoteKo: K(input.approvedAt ? "admin_ads_history_approved_at_saved" : "admin_ads_history_no_new_sale_approval"),
    evidenceNoteEn: EN(input.approvedAt ? "admin_ads_history_approved_at_saved" : "admin_ads_history_no_new_sale_approval"),
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
    K(legacy ? "admin_ads_history_legacy_owner_application" : "admin_ads_history_admin_direct"),
    K("admin_ads_history_no_payment"),
    statusKo(String(input.status)),
  ]);
  const lifeEn = [legacy ? "Legacy owner" : "Admin direct", "No payment", String(input.status)].join(" → ");

  return {
    id: `popup:campaign:${input.id}`,
    productKey: "popup",
    domain: "popup",
    productLabelKo: legacy ? K("admin_ads_history_legacy_name", { name: canon.publicNameKo }) : canon.publicNameKo,
    productLabelEn: legacy ? EN("admin_ads_history_legacy_name", { name: canon.publicNameEn }) : canon.publicNameEn,
    campaignTitle: (input.name ?? "").trim() || input.id.slice(0, 8),
    sourceKind,
    sourceLabelKo: source.ko,
    sourceLabelEn: source.en,
    applicantLabel: input.createdBy?.slice(0, 8) ?? K("admin_ads_history_actor_admin"),
    paymentCurrency: "NONE",
    historicalAmountLabel: null,
    historicalAmountProven: true,
    paymentState: "none",
    paymentStateLabelKo: payLabels.ko,
    paymentStateLabelEn: payLabels.en,
    lifecycleSummaryKo: life.ko,
    lifecycleSummaryEn: lifeEn,
    finalStatusKo: input.status,
    finalStatusEn: input.status,
    lastEventAt: input.endAt || input.approvedAt || input.createdAt,
    placementLabelKo: "팝업",
    placementLabelEn: "Popup surface",
    placementEvidence: "schedule_only",
    legacy,
    sellable: false,
    detailHref: ADS_HISTORY_DETAIL_HREF.popupCampaign(input.id),
    operationsHref: "/admin/advertising/operations",
    applicationsHref: null,
    timeline: sortTimeline(timeline),
    gapsKo: [K("admin_ads_history_impressions_separate"), K("admin_ads_history_no_refund_history")],
    gapsEn: [EN("admin_ads_history_impressions_separate"), EN("admin_ads_history_no_refund_history")],
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
  /** L25: 비즈니스 캐시 금액은 언어와 무관 — 영어 칸도 같은 값 */
  const amountEn = amount;
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
      labelKo: "사장님 신청(이전 방식)",
      labelEn: "Legacy owner application",
      at: input.createdAt,
      actorLabel: input.ownerUserId ? actorKo("owner", input.ownerUserId) : null,
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
      amountLabelEn: amountEn.label,
      reason: null,
      evidence: amount.proven ? "event" : "not_proven",
      evidenceNoteKo: K(amount.proven ? "admin_ads_history_amount_saved_on_application" : "admin_ads_history_amount_missing"),
      evidenceNoteEn: EN(amount.proven ? "admin_ads_history_amount_saved_on_application" : "admin_ads_history_amount_missing"),
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
      evidenceNoteKo: K(payStatus === "refunded" ? "admin_ads_history_payment_status_refunded" : "admin_ads_history_no_refund_no_infer"),
      evidenceNoteEn: EN(payStatus === "refunded" ? "admin_ads_history_payment_status_refunded" : "admin_ads_history_no_refund_no_infer"),
    },
  ];
  const payLabels = paymentStateLabels(payState);
  const life = lifecycleFromParts([K("admin_ads_history_legacy_owner_application"), payLabels.ko, statusKo(input.requestStatus)]);
  const lifeEn = ["Legacy owner application", payLabels.en, input.requestStatus].join(" → ");

  return {
    id: `popup:owner_request:${input.id}`,
    productKey: "popup",
    domain: "popup",
    productLabelKo: K("admin_ads_history_legacy_name", { name: canon.publicNameKo }),
    productLabelEn: EN("admin_ads_history_legacy_name", { name: canon.publicNameEn }),
    campaignTitle: (input.title ?? "").trim() || input.id.slice(0, 8),
    sourceKind: "legacy_owner",
    sourceLabelKo: source.ko,
    sourceLabelEn: source.en,
    applicantLabel: input.ownerUserId?.slice(0, 8) ?? null,
    paymentCurrency: "BUSINESS_CASH",
    historicalAmountLabel: amount.label,
    historicalAmountLabelEn: amountEn.label,
    historicalAmountProven: amount.proven,
    paymentState: payState,
    paymentStateLabelKo: payLabels.ko,
    paymentStateLabelEn: payLabels.en,
    lifecycleSummaryKo: life.ko,
    lifecycleSummaryEn: lifeEn,
    finalStatusKo: input.requestStatus,
    finalStatusEn: input.requestStatus,
    lastEventAt: input.createdAt,
    placementLabelKo: "사장님 팝업(이전 방식)",
    placementLabelEn: "Popup (legacy owner)",
    placementEvidence: "schedule_only",
    legacy: true,
    sellable: false,
    detailHref: ADS_HISTORY_DETAIL_HREF.popupOwnerRequest(input.id),
    operationsHref: "/admin/advertising/operations",
    applicationsHref: null,
    timeline: sortTimeline(timeline),
    gapsKo: [K("admin_ads_history_new_sales_disabled"), K("admin_ads_history_ops_details_separate")],
    gapsEn: [EN("admin_ads_history_new_sales_disabled"), EN("admin_ads_history_ops_details_separate")],
  };
}
