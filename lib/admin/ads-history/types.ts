/**
 * CUT R7 — Ads History / Audit Ledger read model types.
 * Projection only. No writers. No invented events.
 */

import type { AdsCanonicalProductKey } from "@/lib/ads/ads-canonical-product-ssot";

export type AdsHistoryDomainFilter =
  | "all"
  | "community"
  | "trade"
  | "delivery"
  | "popup";

export type AdsHistoryStatusFilter =
  | "all"
  | "approved"
  | "rejected"
  | "ended"
  | "refunded"
  | "paused";

export type AdsHistorySourceKind =
  | "member"
  | "owner"
  | "admin_direct"
  | "legacy_owner"
  | "unknown";

export type AdsHistoryPaymentCurrency = "POINT" | "BUSINESS_CASH" | "NONE" | "UNKNOWN";

export type AdsHistoryPaymentState =
  | "paid"
  | "hold"
  | "refunded"
  | "none"
  | "unknown"
  | "not_proven";

export type AdsHistoryEvidenceKind =
  | "event"
  | "state_only"
  | "schedule_only"
  | "not_proven"
  | "gap";

export type AdsHistoryTimelineEventKind =
  | "application"
  | "payment"
  | "approval"
  | "reject"
  | "hold"
  | "operating"
  | "runtime_exposure"
  | "refund"
  | "end"
  | "note";

export type AdsHistoryTimelineEvent = {
  kind: AdsHistoryTimelineEventKind;
  labelKo: string;
  labelEn: string;
  at: string | null;
  actorLabel: string | null;
  actorProven: boolean;
  amountLabel: string | null;
  reason: string | null;
  evidence: AdsHistoryEvidenceKind;
  evidenceNoteKo: string | null;
  evidenceNoteEn: string | null;
};

export type AdsHistoryLedgerRow = {
  id: string;
  productKey: AdsCanonicalProductKey | "legacy_other";
  domain: AdsHistoryDomainFilter;
  productLabelKo: string;
  productLabelEn: string;
  campaignTitle: string;
  sourceKind: AdsHistorySourceKind;
  sourceLabelKo: string;
  sourceLabelEn: string;
  applicantLabel: string | null;
  paymentCurrency: AdsHistoryPaymentCurrency;
  historicalAmountLabel: string | null;
  /** true when amount came from stored charge evidence (never current catalog). */
  historicalAmountProven: boolean;
  paymentState: AdsHistoryPaymentState;
  paymentStateLabelKo: string;
  paymentStateLabelEn: string;
  lifecycleSummaryKo: string;
  lifecycleSummaryEn: string;
  finalStatusKo: string;
  finalStatusEn: string;
  lastEventAt: string | null;
  placementLabelKo: string | null;
  placementLabelEn: string | null;
  placementEvidence: AdsHistoryEvidenceKind;
  legacy: boolean;
  sellable: boolean;
  detailHref: string | null;
  operationsHref: string | null;
  applicationsHref: string | null;
  timeline: AdsHistoryTimelineEvent[];
  gapsKo: string[];
  gapsEn: string[];
};

export type AdsHistoryLedgerModel = {
  rows: AdsHistoryLedgerRow[];
  exportAvailable: false;
  exportGapKo: string;
  exportGapEn: string;
  loadedAt: string;
  sectionErrors: string[];
};
