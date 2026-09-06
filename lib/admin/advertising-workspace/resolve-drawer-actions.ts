/**
 * Drawer CTA → writer family resolution (ADDENDUM).
 * Only writer-backed verbs; GAP verbs omitted from UI.
 */

import {
  isAdminAuthorityCtaAllowed,
  type AdminAuthorityFamily,
  type AdminAuthorityVerb,
} from "@/lib/ads/admin-authority-matrix";

export type WorkspaceDrawerAction =
  | "approve"
  | "reject"
  | "request_changes"
  | "pause"
  | "resume"
  | "end"
  | "terminate"
  | "delete_safe_draft"
  | "add_internal_memo"
  | "extend_compensation"
  | "change_period";

export type WorkspaceEntityFamily =
  | "boost_community"
  | "boost_trade"
  | "feed_banner"
  | "delivery_banner"
  | "delivery_sponsored"
  | "platform_popup_request"
  | "platform_popup_campaign";

const ACTION_TO_VERB: Record<
  Exclude<WorkspaceDrawerAction, "change_period">,
  AdminAuthorityVerb
> = {
  approve: "APPROVE",
  reject: "REJECT",
  request_changes: "REQUEST_REVISION",
  pause: "PAUSE",
  resume: "RESUME",
  end: "END",
  terminate: "TERMINATE",
  delete_safe_draft: "DELETE_DRAFT",
  add_internal_memo: "ADD_INTERNAL_MEMO",
  extend_compensation: "EXTEND_COMPENSATION",
};

function familyForMatrix(f: WorkspaceEntityFamily): AdminAuthorityFamily {
  if (f === "boost_community") return "boost_community";
  if (f === "boost_trade") return "boost_trade";
  if (f === "feed_banner") return "feed_banner";
  if (f === "delivery_banner") return "delivery_banner";
  if (f === "delivery_sponsored") return "delivery_sponsored";
  return "platform_popup";
}

/** Infer lifecycle bucket from operator status label / order_status. */
export function inferWorkspaceLifecycleBucket(statusRaw: string):
  | "pending"
  | "scheduled"
  | "active"
  | "paused"
  | "ended"
  | "draft"
  | "other" {
  const s = statusRaw.toLowerCase();
  if (s.includes("draft") || s.includes("임시") || s.includes("불완전")) return "draft";
  if (s.includes("pending") || s.includes("검토") || s.includes("대기") || s.includes("review")) {
    return "pending";
  }
  if (s.includes("schedule") || s.includes("예약")) return "scheduled";
  if (s.includes("pause") || s.includes("중지")) return "paused";
  if (s.includes("end") || s.includes("종료") || s.includes("reject") || s.includes("반려")) {
    return "ended";
  }
  if (s.includes("active") || s.includes("활성") || s.includes("노출") || s.includes("승인")) {
    return "active";
  }
  return "other";
}

export function listWorkspaceDrawerActions(input: {
  family: WorkspaceEntityFamily;
  statusRaw: string;
}): WorkspaceDrawerAction[] {
  const bucket = inferWorkspaceLifecycleBucket(input.statusRaw);
  const matrixFamily = familyForMatrix(input.family);

  if (input.family === "platform_popup_request") {
    const candidates: WorkspaceDrawerAction[] =
      bucket === "pending"
        ? ["approve", "reject", "add_internal_memo"]
        : ["add_internal_memo"];
    return candidates.filter((a) => {
      if (a === "add_internal_memo" || a === "change_period") return true;
      return isAdminAuthorityCtaAllowed(matrixFamily, ACTION_TO_VERB[a]);
    });
  }

  if (input.family === "platform_popup_campaign") {
    const candidates: WorkspaceDrawerAction[] =
      bucket === "active"
        ? ["change_period", "pause", "end", "add_internal_memo"]
        : bucket === "paused"
          ? ["change_period", "resume", "end", "add_internal_memo"]
          : bucket === "scheduled"
            ? ["change_period", "pause", "end", "add_internal_memo"]
            : bucket === "draft"
              ? ["add_internal_memo"]
              : bucket === "pending"
                ? ["approve", "reject", "add_internal_memo"]
                : ["add_internal_memo"];
    return candidates.filter((a) => {
      if (a === "add_internal_memo" || a === "change_period") return true;
      if (a === "extend_compensation") return false;
      return isAdminAuthorityCtaAllowed(matrixFamily, ACTION_TO_VERB[a]);
    });
  }

  const candidates: WorkspaceDrawerAction[] =
    bucket === "pending"
      ? ["approve", "reject", "request_changes", "add_internal_memo"]
      : bucket === "active"
        ? ["pause", "end", "terminate", "extend_compensation", "add_internal_memo"]
        : bucket === "paused"
          ? ["resume", "end", "add_internal_memo"]
          : bucket === "draft"
            ? ["delete_safe_draft", "add_internal_memo"]
            : bucket === "scheduled"
              ? ["pause", "end", "add_internal_memo"]
              : ["add_internal_memo"];

  return candidates.filter((a) => {
    if (a === "add_internal_memo" || a === "change_period") return true;
    if (a === "request_changes") {
      return isAdminAuthorityCtaAllowed(matrixFamily, "REQUEST_REVISION");
    }
    if (a === "terminate") {
      return isAdminAuthorityCtaAllowed(matrixFamily, "TERMINATE");
    }
    if (a === "extend_compensation") {
      return isAdminAuthorityCtaAllowed(matrixFamily, "EXTEND_COMPENSATION");
    }
    return isAdminAuthorityCtaAllowed(matrixFamily, ACTION_TO_VERB[a]);
  });
}

export function parseWorkspaceEntityId(rowId: string): string {
  const i = rowId.indexOf(":");
  return i >= 0 ? rowId.slice(i + 1) : rowId;
}

export function familyFromControlDomain(
  domain: string,
  product: string,
  options?: { id?: string | null; source?: string | null }
): WorkspaceEntityFamily | null {
  if (domain === "community_promote") return "boost_community";
  if (domain === "trade_promote") return "boost_trade";
  if (domain === "feed") return "feed_banner";
  if (domain === "popup") {
    const id = String(options?.id ?? "");
    const source = String(options?.source ?? "");
    if (
      id.startsWith("popup_campaign:") ||
      source === "platform_popup_campaigns"
    ) {
      return "platform_popup_campaign";
    }
    return "platform_popup_request";
  }
  if (domain === "delivery") {
    const p = product.toLowerCase();
    if (p.includes("sponsored") || p.includes("store")) return "delivery_sponsored";
    return "delivery_banner";
  }
  return null;
}
