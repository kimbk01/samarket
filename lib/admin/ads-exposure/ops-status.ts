/**
 * Canonical ops status labels — Admin ↔ Member ↔ Owner presentation.
 * Internal enums stay in domain writers; UI uses these only.
 */

export type AdsOpsStatus =
  | "pending"
  | "scheduled"
  | "live"
  | "paused"
  | "ended"
  | "rejected"
  | "draft"
  | "archived";

const LABELS: Record<AdsOpsStatus, { ko: string; en: string }> = {
  pending: { ko: "승인 대기", en: "Pending approval" },
  scheduled: { ko: "예약", en: "Scheduled" },
  live: { ko: "노출 중", en: "Live" },
  paused: { ko: "일시중지", en: "Paused" },
  ended: { ko: "종료", en: "Ended" },
  rejected: { ko: "반려", en: "Rejected" },
  draft: { ko: "임시저장", en: "Draft" },
  archived: { ko: "삭제됨", en: "Removed" },
};

export function adsOpsStatusLabel(status: AdsOpsStatus, ko: boolean): string {
  return ko ? LABELS[status].ko : LABELS[status].en;
}

export function mapRawToAdsOpsStatus(raw: string): AdsOpsStatus {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return "ended";
  if (s.includes("archiv") || s.includes("deleted") || s.includes("삭제")) return "archived";
  if (s.includes("draft") || s.includes("임시")) return "draft";
  if (
    s.includes("pending") ||
    s.includes("review") ||
    s.includes("submitted") ||
    s.includes("대기") ||
    s.includes("검토") ||
    s === "held"
  ) {
    return "pending";
  }
  if (s.includes("schedul") || s.includes("예약") || s.includes("approved")) {
    // approved before window → scheduled; if also "active" handled below
    if (s.includes("active") || s.includes("노출")) return "live";
    return "scheduled";
  }
  if (s.includes("pause") || s.includes("중지") || s.includes("hold")) return "paused";
  if (s.includes("reject") || s.includes("반려") || s.includes("거절")) return "rejected";
  if (
    s.includes("end") ||
    s.includes("expir") ||
    s.includes("cancel") ||
    s.includes("terminat") ||
    s.includes("종료")
  ) {
    return "ended";
  }
  if (s.includes("active") || s.includes("노출") || s.includes("live") || s.includes("exposing")) {
    return "live";
  }
  return "ended";
}

/** Project ops status from lifecycle + schedule window. */
export function projectAdsOpsStatus(input: {
  rawStatus: string;
  startAt?: string | null;
  endAt?: string | null;
  nowMs?: number;
}): AdsOpsStatus {
  const base = mapRawToAdsOpsStatus(input.rawStatus);
  if (base === "rejected" || base === "ended" || base === "archived" || base === "draft") {
    return base;
  }
  if (base === "paused" || base === "pending") return base;

  const now = input.nowMs ?? Date.now();
  const start = input.startAt ? Date.parse(input.startAt) : NaN;
  const end = input.endAt ? Date.parse(input.endAt) : NaN;
  if (Number.isFinite(end) && end <= now) return "ended";
  if (base === "live" || base === "scheduled") {
    if (Number.isFinite(start) && start > now) return "scheduled";
    if (base === "scheduled" && (!Number.isFinite(start) || start <= now)) return "live";
  }
  return base;
}
