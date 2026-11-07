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

/**
 * 설계 §6 · FB-A05 · AD-103 (2026-11-04) — 공통 조치 API 가 사유를 요구하는 동작 (동작 단계 표 L2·L3 와 같다).
 * 승인·반려·보류·정지·재개·연장 = L2 · 종료·강제 종료·초안 삭제 = L3. 화면·서버가 같은 목록을 쓴다.
 */
export const ADS_WORKSPACE_REASON_REQUIRED_ACTIONS: readonly WorkspaceDrawerAction[] = [
  "approve",
  "reject",
  "request_changes",
  "pause",
  "resume",
  "extend_compensation",
  "end",
  "terminate",
  "delete_safe_draft",
];

/**
 * AL-16: 팝업 캠페인 초안 삭제 가능 = 서버 `isPlatformPopupDeleteSafeDraftRow` 와 같은 조건 —
 * 운영자 등록(사장님 매장·신청 연결 없음) + 상태 draft·pending_review. (노출 기록 0 은 서버가 삭제 직전에 센다)
 * 목록 행에는 원 상태 대신 완성도·노출 분류가 실려 오므로 그것으로 같은 판정을 한다.
 */
export function isWorkspacePopupDeleteSafeDraft(item: {
  sourceKind?: string | null;
  completenessClass?: string | null;
  runtimeDisplayStatus?: string | null;
}): boolean {
  if (item.sourceKind !== "admin_direct") return false;
  const c = String(item.completenessClass ?? "");
  if (c === "orphan_partial" || c === "incomplete" || c === "draft_ready" || c === "pending_review") return true;
  const r = String(item.runtimeDisplayStatus ?? "");
  return r === "draft" || r === "pending" || r === "incomplete";
}

/** AL-17: 글 상태로 멈춘 상위노출(paused_by = listing_*)은 관리자 재개 불가 — 거래 도메인 화면과 같은 조건. */
export function isListingPausedBoost(pausedBy: string | null | undefined): boolean {
  return String(pausedBy ?? "").startsWith("listing_");
}

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
  if (s.includes("schedule") || s.includes("예약")) return "scheduled";
  if (s.includes("pause") || s.includes("중지")) return "paused";
  if (s.includes("end") || s.includes("종료") || s.includes("reject") || s.includes("반려")) {
    return "ended";
  }
  // 「노출 대기」 before generic 「대기」 so popup waiting gets pause/end, not approve.
  if (
    s.includes("노출 중") ||
    s.includes("현재 노출") ||
    s.includes("노출 대기") ||
    s.includes("waiting")
  ) {
    return "active";
  }
  if (s.includes("pending") || s.includes("검토") || s.includes("대기") || s.includes("review")) {
    return "pending";
  }
  if (s.includes("active") || s.includes("활성") || s.includes("노출") || s.includes("승인")) {
    return "active";
  }
  return "other";
}

export function listWorkspaceDrawerActions(input: {
  family: WorkspaceEntityFamily;
  statusRaw: string;
  /** AL-16: 팝업 캠페인 초안 삭제 가능 여부(`isWorkspacePopupDeleteSafeDraft`) — 주면 이 값으로만 삭제 버튼을 정한다 */
  popupDeleteSafe?: boolean;
  /** AL-17: 상위노출 정지 주체 — `listing_*` 면 재개를 숨긴다 */
  pausedBy?: string | null;
}): WorkspaceDrawerAction[] {
  const actions = listWorkspaceDrawerActionsRaw(input);
  let out = actions;
  if (input.family === "platform_popup_campaign" && typeof input.popupDeleteSafe === "boolean") {
    out = out.filter((a) => a !== "delete_safe_draft");
    if (input.popupDeleteSafe) out = ["delete_safe_draft", ...out];
  }
  if ((input.family === "boost_trade" || input.family === "boost_community") && isListingPausedBoost(input.pausedBy)) {
    out = out.filter((a) => a !== "resume");
  }
  // D-03: 진행 중(ACTIVE·SCHEDULED·PAUSED_*) 배달 광고는 강제 종료(terminate) 대신 귀책·환급 종료(end)만 —
  // 서버도 terminate 를 `use_end_with_fault`(422)로 거부한다. 버튼을 보이지 않는다.
  if (input.family === "delivery_banner" || input.family === "delivery_sponsored") {
    out = out.filter((a) => a !== "terminate");
  }
  return out;
}

function listWorkspaceDrawerActionsRaw(input: {
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
              ? ["delete_safe_draft", "add_internal_memo"]
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

/** Shell mode filter — 「전체 광고」에서도 popup 운영 CTA(중지/종료/삭제)를 유지한다. */
export function filterWorkspaceActionsByMode(
  actions: WorkspaceDrawerAction[],
  mode: string
): WorkspaceDrawerAction[] {
  if (mode === "applications") {
    // CUT R3: list primary CTA is 검토하기 → detail. No list-row approve/reject/hold.
    return [];
  }
  if (mode === "boosts") {
    return actions.filter((a) => ["pause", "resume"].includes(a));
  }
  if (mode === "all" || mode === "operations") {
    return actions.filter((a) =>
      [
        "change_period",
        "pause",
        "resume",
        "end",
        "terminate",
        "extend_compensation",
        "delete_safe_draft",
      ].includes(a)
    );
  }
  return [];
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
