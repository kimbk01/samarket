/**
 * CUT R4 — Operations / Boost state-aware primary CTA projection.
 * Mutations only when writer-backed; navigation CTAs never call writers.
 */

import type { AdsShellListRow } from "@/lib/admin/ads-exposure/shell-row";
import { isBoostShellDomain } from "@/lib/admin/ads-exposure/shell-row";
import { isAdsDomainRootLiveHref } from "@/lib/admin/ads-exposure/live-route";
import type { WorkspaceDrawerAction } from "@/lib/admin/advertising-workspace/resolve-drawer-actions";

export type OpsPrimaryCtaKind =
  | "view_live"
  | "waiting_reason"
  | "scheduled_info"
  | "resume"
  | "sanction"
  | "history"
  | "detail";

export type OpsPrimaryCta = {
  kind: OpsPrimaryCtaKind;
  labelKo: string;
  labelEn: string;
  /** External/customer runtime — only when proven */
  href?: string | null;
  /** Admin detail/history */
  adminHref?: string | null;
  /** Opens detail panel (no navigation) */
  selectDetail?: boolean;
  /** Writer-backed mutation after R1 confirm */
  mutation?: Extract<WorkspaceDrawerAction, "pause" | "resume"> | null;
};

/**
 * State-aware primary CTA for operations / boosts lists.
 * `관리 ▼` must not be the primary workflow.
 */
export function resolveOperationsPrimaryCta(
  row: Pick<
    AdsShellListRow,
    | "statusTab"
    | "domain"
    | "liveHref"
    | "href"
    | "waitingReasonLabel"
    | "runtimeExposureStatusLabel"
  >,
  opts?: { mode?: "operations" | "boosts" | "all" | "history" }
): OpsPrimaryCta {
  const boost = isBoostShellDomain(row.domain);
  const tab = row.statusTab;

  if (boost && (tab === "paused" || /제재/.test(row.runtimeExposureStatusLabel))) {
    return {
      kind: "resume",
      labelKo: "재개",
      labelEn: "Resume",
      mutation: "resume",
      selectDetail: true,
    };
  }
  if (boost && (tab === "live" || tab === "waiting" || tab === "scheduled")) {
    return {
      kind: "sanction",
      labelKo: "제재",
      labelEn: "Sanction",
      mutation: "pause",
      selectDetail: true,
    };
  }
  if (boost && (tab === "ended" || tab === "rejected")) {
    return {
      kind: "history",
      labelKo: "이력 보기",
      labelEn: "View history",
      adminHref: "/admin/advertising/history",
    };
  }

  if (tab === "paused") {
    return {
      kind: "resume",
      labelKo: "재개",
      labelEn: "Resume",
      mutation: "resume",
      selectDetail: true,
    };
  }

  if (tab === "live" && row.liveHref) {
    // Boost domain roots must never become primary `실제 노출 보기`.
    if (boost && isAdsDomainRootLiveHref(row.liveHref)) {
      return {
        kind: "detail",
        labelKo: "상세 보기",
        labelEn: "View detail",
        adminHref: row.href,
        selectDetail: true,
      };
    }
    return {
      kind: "view_live",
      labelKo: "실제 노출 보기",
      labelEn: "View live",
      href: row.liveHref,
    };
  }

  if (tab === "waiting") {
    return {
      kind: "waiting_reason",
      labelKo: "대기 이유 보기",
      labelEn: "View wait reason",
      selectDetail: true,
      adminHref: row.href,
    };
  }

  if (tab === "scheduled") {
    return {
      kind: "scheduled_info",
      labelKo: "예약 정보 보기",
      labelEn: "View schedule",
      selectDetail: true,
      adminHref: row.href,
    };
  }

  if (tab === "ended" || tab === "rejected") {
    return {
      kind: "history",
      labelKo: "이력 보기",
      labelEn: "View history",
      adminHref: opts?.mode === "history" ? row.href : "/admin/advertising/history",
    };
  }

  // incomplete / live without liveHref / fallback
  if (tab === "live") {
    return {
      kind: "detail",
      labelKo: "상세 보기",
      labelEn: "View detail",
      adminHref: row.href,
      selectDetail: true,
    };
  }

  return {
    kind: "detail",
    labelKo: "상세 보기",
    labelEn: "View detail",
    adminHref: row.href,
    selectDetail: true,
  };
}

/** Fallback waiting copy when projection has no reason (never invent root cause). */
export function operationsWaitingFallback(ko: boolean): string {
  return ko ? "노출 대기 · 상세 상태를 확인하세요." : "Waiting · Check detail status.";
}
