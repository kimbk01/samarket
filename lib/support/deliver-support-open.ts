/**
 * Customer Support opening SSOT — all product sources converge here.
 * Does not parse push payloads, run auth, or own viewport geometry.
 */

import type { SupportContext } from "@/lib/support/support-context";
import { isSupportContextEnabled } from "@/lib/support/support-context";
import { stashSupportModalRestoreCaseId } from "@/lib/support/support-modal-restore-stash";
import { canOpenSupportModal, openSupportModal } from "@/lib/support/support-modal-machine";

export type DeliverSupportOpenSource =
  | "push"
  | "inbox"
  | "banner"
  | "fab"
  | "cta"
  | "history"
  | "bootstrap"
  | "restore"
  | "enter";

export type DeliverSupportOpenInput = {
  caseId?: string | null;
  context?: SupportContext | null;
  notificationId?: string | null;
  source: DeliverSupportOpenSource;
};

export type DeliverSupportOpenResult =
  | { ok: true; caseId: string | null; source: DeliverSupportOpenSource }
  | { ok: false; error: "missing_target" | "open_failed"; source: DeliverSupportOpenSource };

/**
 * Durable intent + modal open signal.
 * caseId → stash then open ACTIVE; context → open START.
 */
export function deliverSupportOpen(input: DeliverSupportOpenInput): DeliverSupportOpenResult {
  const source = input.source;
  const caseId = typeof input.caseId === "string" ? input.caseId.trim() : "";
  const context =
    input.context && isSupportContextEnabled(input.context) ? input.context : null;

  if (!caseId && !context) {
    return { ok: false, error: "missing_target", source };
  }

  if (caseId) {
    stashSupportModalRestoreCaseId(caseId);
    const opened = openSupportModal({ caseId });
    if (!opened) {
      return { ok: false, error: "open_failed", source };
    }
    return { ok: true, caseId, source };
  }

  const opened = openSupportModal({ context });
  if (!opened) {
    return { ok: false, error: "open_failed", source };
  }
  return { ok: true, caseId: null, source };
}

/* ───────────── 진입 주소(`/support/cases/X` · `/support/enter`) — 주소 정리 뒤 열기 (C-21) ───────────── */

/**
 * 진입 주소 화면은 `router.replace` 로 주소를 정리한 **뒤** 창을 연다 — 먼저 열면 창이 넣은 기록 항목이 진입 주소 위에
 * 쌓였다가 replace 로 바뀌어, ◁ 가 진입 주소로 돌아가 창이 다시 열리는 반복이 생긴다.
 * 문의 창 호스트가 경로가 `fromPath` 와 달라진 것을 보면 `flushSupportOpenAfterRoute` 로 연다.
 */
/** 열 수 있는 입력인가 — 진입 주소 화면이 주소를 정리하기 전에 오류 화면을 고를 때 */
export function canDeliverSupportOpen(input: DeliverSupportOpenInput): boolean {
  const caseId = typeof input.caseId === "string" ? input.caseId.trim() : "";
  const context = input.context && isSupportContextEnabled(input.context) ? input.context : null;
  return canOpenSupportModal({ caseId: caseId || null, context });
}

let pendingAfterRoute: { fromPath: string; input: DeliverSupportOpenInput } | null = null;

export function deliverSupportOpenAfterRouteLeaves(fromPath: string, input: DeliverSupportOpenInput): void {
  pendingAfterRoute = { fromPath, input };
}

/** 호스트가 경로가 바뀔 때마다 부른다 — 진입 주소를 떠났으면 보관한 열기를 실행 */
export function flushSupportOpenAfterRoute(pathname: string | null | undefined): DeliverSupportOpenResult | null {
  const pending = pendingAfterRoute;
  if (!pending) return null;
  const path = String(pathname ?? "");
  if (!path || path === pending.fromPath) return null;
  pendingAfterRoute = null;
  return deliverSupportOpen(pending.input);
}

export function hasPendingSupportOpenAfterRoute(): boolean {
  return pendingAfterRoute != null;
}
