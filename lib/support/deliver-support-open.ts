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

/** 보관한 열기(진입 주소 화면·같은 화면의 푸시가 함께 보관할 수 있어 순서대로 여럿) */
let pendingAfterRoute: { fromPath: string; input: DeliverSupportOpenInput }[] = [];

export function deliverSupportOpenAfterRouteLeaves(fromPath: string, input: DeliverSupportOpenInput): void {
  pendingAfterRoute.push({ fromPath, input });
}

/** 호스트가 경로가 바뀔 때마다 부른다 — 진입 주소를 떠났으면 보관한 열기를 순서대로 실행 */
export function flushSupportOpenAfterRoute(pathname: string | null | undefined): DeliverSupportOpenResult | null {
  const path = String(pathname ?? "");
  if (!path || pendingAfterRoute.length === 0) return null;
  const ready = pendingAfterRoute.filter((p) => p.fromPath !== path);
  if (ready.length === 0) return null;
  pendingAfterRoute = pendingAfterRoute.filter((p) => p.fromPath === path);
  let last: DeliverSupportOpenResult | null = null;
  for (const p of ready) last = deliverSupportOpen(p.input);
  return last;
}

export function hasPendingSupportOpenAfterRoute(): boolean {
  return pendingAfterRoute.length > 0;
}

/* ───────────── 고객센터 흐름이 스스로 하는 주소 정리 = 「경로 바뀜」이 아님 ───────────── */

/**
 * 고객센터 흐름(진입 주소 화면 · 푸시의 고객센터 갈래)이 창을 열면서 하는 `router.replace` 는 이것으로만 한다.
 * 호스트는 다음 경로 변화에서 이 표시를 소비하고, 창을 닫는 대신 창의 경로만 새 주소로 바꾼다
 * (재감사: 진입 주소에서 열린 창이 바로 뒤 replace 로 `route_changed` 가 되어 닫히던 것).
 */
let entryReplace: { fromPath: string } | null = null;

/** 바로 다음에 하는 `router.replace` 가 고객센터 흐름의 주소 정리라는 표시(진입 주소 화면이 replace 직전에 부른다) */
export function markSupportEntryReplace(): void {
  entryReplace = { fromPath: typeof window === "undefined" ? "" : window.location.pathname };
}

export function replaceSupportEntryRoute(router: { replace: (href: string) => void }, href: string): void {
  markSupportEntryReplace();
  router.replace(href);
}

/** 이 경로 변화가 고객센터 흐름의 주소 정리인가 — 맞으면 표시를 소비하고 true */
export function consumeSupportEntryReplace(pathname: string | null | undefined): boolean {
  const mark = entryReplace;
  if (!mark) return false;
  const path = String(pathname ?? "");
  if (!path || path === mark.fromPath) return false;
  entryReplace = null;
  return true;
}

/**
 * 푸시의 고객센터 갈래(`PushRouteListener`) — 진입 주소(`/support/…`) 위에서 받으면 주소를 먼저 정리하고 그 뒤에 연다
 * (진입 주소 화면과 같은 규칙: ◁ 반복 없음 · 경로 바뀜으로 닫히지 않음). 그 밖의 화면이면 바로 연다.
 */
export function deliverSupportPushOpen(
  input: DeliverSupportOpenInput,
  router: { replace: (href: string) => void }
): DeliverSupportOpenResult {
  const here = typeof window === "undefined" ? "" : window.location.pathname;
  if (!here.startsWith("/support/")) return deliverSupportOpen(input);
  if (!canDeliverSupportOpen(input)) {
    return { ok: false, error: "missing_target", source: input.source };
  }
  const caseId = typeof input.caseId === "string" ? input.caseId.trim() || null : null;
  if (caseId) stashSupportModalRestoreCaseId(caseId);
  deliverSupportOpenAfterRouteLeaves(here, input);
  replaceSupportEntryRoute(router, "/");
  return { ok: true, caseId, source: input.source };
}

/** 시험 전용 */
export function __resetSupportEntryRoutingForTests(): void {
  pendingAfterRoute = [];
  entryReplace = null;
}
