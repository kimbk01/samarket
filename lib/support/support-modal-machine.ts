/**
 * 고객센터 문의 창 상태 기계 — 단일 정의 (계약 `docs/audit/customer-support-full-fix-contract-2026-11-28.md` §5).
 *
 * 상태 = `{ session, stack: View[], inflight, held }`. View = 쓰기 / 상세 / 접수 완료 / 로그인.
 * 모든 사건은 intent 하나로만 들어온다: close · back(화면 ‹ 와 기기 ◁ 같은 경로) · navigate · open_case · open_context ·
 * route_changed · auth_out.
 *
 * - 쓰기 요청(접수·추가 문의·확인했어요)이 진행 중(`inflight`)이면 close·back·navigate·open_case·open_context 는
 *   **1개만 보관**했다가 결과를 붙인 뒤 실행한다. 모든 버튼은 같은 `busy`(= inflight 있음)로 비활성.
 * - open_case 는 덮어쓰지 않고 쌓는다(쓰기 화면 유지 — Owner 결정 1) · 같은 문의면 다시 읽기 · 접수 완료·로그인 위에서도.
 * - open_context 는 다른 맥락이면 새 쓰기 화면(새 key), 같은 맥락이 맨 위면 그대로.
 * - 결과는 (session, viewId, caseId) 가 맞을 때만 그 View 에 붙인다(`isSupportModalViewCurrent`).
 * - 창 닫기 ≠ 문의 종료(서버 상태 바꾸지 않음).
 *
 * 옛 `support-modal-controller.ts` 를 흡수했다 — 그 파일은 같은 공개 함수 이름을 다시 내보내기만 한다.
 */

import type { SupportContext } from "@/lib/support/support-context";
import { isSupportContextEnabled } from "@/lib/support/support-context";
import { clearSupportModalRestoreCaseId } from "@/lib/support/support-modal-restore-stash";
import { supportTicketDraftKey } from "@/lib/support/support-ticket-form";

/* ───────────── 타입 ───────────── */

export type SupportTicketSubmittedInfo = {
  caseNo: string;
  categoryLabel: string;
  issueLabel: string;
  createdAt: string;
  audience: "MEMBER" | "OWNER";
  storeId: string | null;
  /** 고객 문의 SSOT §6 (F4): 같은 분야 진행 중 문의에 이어 붙었다 — 기존 문의의 번호·분야·세부를 보여 준다. */
  merged?: boolean;
};

export type SupportModalStackView =
  | { kind: "compose"; id: string; context: SupportContext }
  | { kind: "detail"; id: string; caseId: string; reloadTick: number }
  | { kind: "submitted"; id: string; info: SupportTicketSubmittedInfo }
  | { kind: "login"; id: string };

export type SupportModalWriteKind = "submit" | "follow_up" | "confirm";

export type SupportModalInflight = {
  opId: number;
  kind: SupportModalWriteKind;
  viewId: string;
  caseId: string | null;
};

export type SupportModalIntent =
  | { type: "close" }
  | { type: "back" }
  | { type: "navigate"; href: string }
  | { type: "open_case"; caseId: string }
  | { type: "open_context"; context: SupportContext }
  | { type: "new_inquiry"; context: SupportContext }
  | { type: "route_changed" }
  | { type: "auth_out" };

/** 창이 닫힌 까닭 — 호스트가 기록 항목을 어떻게 정리할지 정한다 */
export type SupportModalCloseReason =
  /** 앱 안 닫기(✕·확인·첫 단계 ‹) — 넣은 기록 항목을 되돌린다 */
  | { kind: "intent" }
  /** 기기 ◁ 가 기록 항목을 이미 꺼냈다 */
  | { kind: "pop" }
  /** 창 아래에서 경로가 바뀌었다 — 기록 항목은 소비된 것으로 본다(되돌리지 않음 · C-20) */
  | { kind: "route" }
  /** 닫고 다른 화면으로 — 기록 항목을 그 주소로 교체 */
  | { kind: "navigate"; href: string };

export type SupportModalMachineState = {
  phase: "closed" | "open";
  /** 창이 닫힐 때마다 +1 */
  session: number;
  stack: readonly SupportModalStackView[];
  inflight: SupportModalInflight | null;
  /** inflight 중 들어온 intent 1개 */
  held: SupportModalIntent | null;
  /** 마지막으로 닫힌 까닭(닫힌 상태에서만 의미) */
  lastClose: SupportModalCloseReason | null;
};

/** 옛 컨트롤러 모양(외부 호출처 호환 — GlobalPopupHost·FAB 등) */
export type SupportModalPhase = "closed" | "open";
export type SupportModalState = {
  phase: SupportModalPhase;
  /** 맨 위에서 가장 가까운 쓰기 화면의 맥락 */
  context: SupportContext | null;
  /** 맨 위 화면이 상세면 그 문의 id */
  caseId: string | null;
  restoreCaseId: string | null;
};

/* ───────────── 저장소 ───────────── */

let viewSeq = 0;
let opSeq = 0;
const nextViewId = (kind: string) => `${kind}-${++viewSeq}`;

let machine: SupportModalMachineState = {
  phase: "closed",
  session: 0,
  stack: [],
  inflight: null,
  held: null,
  lastClose: null,
};
let compat: SupportModalState = { phase: "closed", context: null, caseId: null, restoreCaseId: null };
const listeners = new Set<() => void>();

function deriveCompat(s: SupportModalMachineState, restoreCaseId: string | null): SupportModalState {
  if (s.phase !== "open") return { phase: "closed", context: null, caseId: null, restoreCaseId: null };
  const top = s.stack[s.stack.length - 1] ?? null;
  let context: SupportContext | null = null;
  for (let i = s.stack.length - 1; i >= 0; i -= 1) {
    const v = s.stack[i]!;
    if (v.kind === "compose") {
      context = v.context;
      break;
    }
  }
  return {
    phase: "open",
    context,
    caseId: top?.kind === "detail" ? top.caseId : null,
    restoreCaseId,
  };
}

function commit(next: SupportModalMachineState, restoreCaseId: string | null = null): void {
  machine = next;
  compat = deriveCompat(next, restoreCaseId);
  for (const l of listeners) l();
}

export function getSupportModalMachineState(): SupportModalMachineState {
  return machine;
}

export function getSupportModalState(): SupportModalState {
  return compat;
}

export function subscribeSupportModalState(onStore: () => void): () => void {
  listeners.add(onStore);
  return () => {
    listeners.delete(onStore);
  };
}

export function isSupportModalOpen(): boolean {
  return machine.phase === "open";
}

export function isSupportModalBusy(): boolean {
  return machine.inflight != null;
}

/* ───────────── 한 단계 뒤로(화면 안 단계) ───────────── */

/**
 * 맨 위 화면 안의 작은 단계(분야·세부 선택 · 요금표 · 추가 문의 입력칸) — 열려 있는 동안 등록한다.
 * back intent 는 이것을 먼저 부르고, 없으면 쌓인 화면을 하나 빼고, 첫 화면이면 창을 닫는다.
 */
type BackStep = { priority: number; order: number; fn: () => void };
let backSeq = 0;
const backSteps = new Map<number, BackStep>();

export function registerSupportModalBackStep(priority: number, fn: () => void): () => void {
  const id = ++backSeq;
  backSteps.set(id, { priority, order: id, fn });
  return () => {
    backSteps.delete(id);
  };
}

function runInnerBackStep(): boolean {
  let top: BackStep | null = null;
  for (const e of backSteps.values()) {
    if (!top || e.priority > top.priority || (e.priority === top.priority && e.order > top.order)) top = e;
  }
  if (!top) return false;
  top.fn();
  return true;
}

/* ───────────── 순수 전이 ───────────── */

function contextEnabled(context: SupportContext | null | undefined): context is SupportContext {
  return Boolean(
    context &&
      context.enabled === true &&
      (Boolean(String(context.category ?? "").trim()) || context.needsCategorySelection === true)
  );
}

function closedState(s: SupportModalMachineState, reason: SupportModalCloseReason): SupportModalMachineState {
  return {
    phase: "closed",
    session: s.session + 1,
    stack: [],
    inflight: null,
    held: null,
    lastClose: reason,
  };
}

function composeView(context: SupportContext): SupportModalStackView {
  return { kind: "compose", id: nextViewId("compose"), context };
}

function detailView(caseId: string): SupportModalStackView {
  return { kind: "detail", id: nextViewId("detail"), caseId, reloadTick: 0 };
}

function withStack(s: SupportModalMachineState, stack: SupportModalStackView[]): SupportModalMachineState {
  return { ...s, stack };
}

/** open_case — 같은 문의가 맨 위면 다시 읽기, 아래에 있으면 맨 위로 옮겨 다시 읽기, 없으면 쌓기 */
function pushCase(s: SupportModalMachineState, caseId: string): SupportModalMachineState {
  if (s.phase !== "open") {
    return { ...s, phase: "open", stack: [detailView(caseId)], lastClose: null };
  }
  const stack = [...s.stack];
  const top = stack[stack.length - 1];
  if (top?.kind === "detail" && top.caseId === caseId) {
    stack[stack.length - 1] = { ...top, reloadTick: top.reloadTick + 1 };
    return withStack(s, stack);
  }
  const at = stack.findIndex((v) => v.kind === "detail" && v.caseId === caseId);
  if (at >= 0) {
    const existing = stack[at] as Extract<SupportModalStackView, { kind: "detail" }>;
    stack.splice(at, 1);
    stack.push({ ...existing, reloadTick: existing.reloadTick + 1 });
    return withStack(s, stack);
  }
  // 로그인 화면 위에는 쌓지 않는다(로그인 뒤 다시 연다) — 로그인 화면을 상세로 바꾼다(401 이면 다시 로그인)
  if (top?.kind === "login") stack.pop();
  stack.push(detailView(caseId));
  return withStack(s, stack);
}

function openContext(s: SupportModalMachineState, context: SupportContext): SupportModalMachineState {
  if (s.phase === "open") {
    const top = s.stack[s.stack.length - 1];
    if (top?.kind === "compose" && supportTicketDraftKey(top.context) === supportTicketDraftKey(context)) {
      return s;
    }
  }
  return { ...s, phase: "open", stack: [composeView(context)], lastClose: null };
}

/** 쌓인 화면 하나 빼기 — 첫 화면이면 닫기 */
function popOrClose(s: SupportModalMachineState): SupportModalMachineState {
  if (s.stack.length > 1) return withStack(s, s.stack.slice(0, -1));
  return closedState(s, { kind: "intent" });
}

/* ───────────── intent 실행 ───────────── */

function isHoldable(intent: SupportModalIntent): boolean {
  return intent.type !== "route_changed" && intent.type !== "auth_out";
}

function apply(intent: SupportModalIntent, opts: { fromPop?: boolean } = {}): void {
  const s = machine;
  switch (intent.type) {
    case "open_case":
      commit(pushCase(s, intent.caseId), intent.caseId);
      return;
    case "open_context":
      commit(openContext(s, intent.context));
      return;
    case "new_inquiry":
      if (s.phase !== "open") return;
      commit({ ...s, stack: [composeView(intent.context)] });
      return;
    case "navigate":
      if (s.phase !== "open") return;
      clearSupportModalRestoreCaseId();
      commit(closedState(s, { kind: "navigate", href: intent.href }));
      return;
    case "close":
      if (s.phase !== "open") return;
      clearSupportModalRestoreCaseId();
      commit(closedState(s, { kind: opts.fromPop ? "pop" : "intent" }));
      return;
    case "back": {
      if (s.phase !== "open") return;
      if (runInnerBackStep()) return;
      const next = popOrClose(s);
      if (next.phase === "closed") {
        clearSupportModalRestoreCaseId();
        commit({ ...next, lastClose: { kind: opts.fromPop ? "pop" : "intent" } });
        return;
      }
      commit(next);
      return;
    }
    case "route_changed":
      if (s.phase !== "open") return;
      clearSupportModalRestoreCaseId();
      commit(closedState(s, { kind: "route" }));
      return;
    case "auth_out":
      if (s.phase !== "open") return;
      commit({ ...s, stack: [{ kind: "login", id: nextViewId("login") }] });
      return;
  }
}

/** 기기 ◁ 로 들어온 back 인지 — 보관됐다 나중에 실행되면 기록 항목은 다시 넣어 둔 상태다 */
export type SupportModalDispatchOptions = { fromPop?: boolean };

/**
 * intent 하나를 넣는다. 쓰기 요청 중이면 보관(1개 — 마지막 것)하고 `"held"` 를 돌려준다.
 */
export function dispatchSupportModalIntent(
  intent: SupportModalIntent,
  opts: SupportModalDispatchOptions = {}
): "applied" | "held" {
  if (machine.inflight && isHoldable(intent)) {
    commit({ ...machine, held: intent }, compat.restoreCaseId);
    return "held";
  }
  apply(intent, opts);
  return "applied";
}

/* ───────────── 쓰기 요청 표시 (support-modal-ops 만 부른다) ───────────── */

export type SupportModalOpToken = {
  session: number;
  viewId: string;
  caseId: string | null;
};

export function supportModalTokenFor(viewId: string, caseId: string | null): SupportModalOpToken {
  return { session: machine.session, viewId, caseId };
}

/** 결과를 붙여도 되는가 — 같은 창 회차 · 그 화면이 아직 쌓여 있음 · 같은 문의 */
export function isSupportModalViewCurrent(token: SupportModalOpToken): boolean {
  if (machine.phase !== "open" || machine.session !== token.session) return false;
  const v = machine.stack.find((x) => x.id === token.viewId);
  if (!v) return false;
  if (token.caseId != null) return v.kind === "detail" && v.caseId === token.caseId;
  return true;
}

export function isSupportModalViewTop(viewId: string): boolean {
  if (machine.phase !== "open") return false;
  return machine.stack[machine.stack.length - 1]?.id === viewId;
}

/** 쓰기 요청 시작 — 이미 하나가 진행 중이면 null */
export function beginSupportModalWrite(kind: SupportModalWriteKind, token: SupportModalOpToken): number | null {
  if (machine.inflight) return null;
  if (!isSupportModalViewCurrent(token)) return null;
  const opId = ++opSeq;
  commit({ ...machine, inflight: { opId, kind, viewId: token.viewId, caseId: token.caseId } }, compat.restoreCaseId);
  return opId;
}

/**
 * 쓰기 요청 끝 — 그 요청이 지금 표시 중이면 풀고, 보관한 intent 를 실행한다.
 * 보관한 intent 는 결과가 화면에 그려진 **뒤**(다음 차례) 실행한다 — 결과로 닫힌 입력칸 등 화면 안 단계가 정리된 상태 기준.
 */
export function endSupportModalWrite(opId: number): void {
  if (machine.inflight?.opId !== opId) return;
  const held = machine.held;
  commit({ ...machine, inflight: null, held: null }, compat.restoreCaseId);
  if (!held) return;
  const host = typeof window !== "undefined" ? window : globalThis;
  host.setTimeout(() => {
    // 그사이 새 쓰기 요청이 시작됐으면 다시 보관된다(dispatch 규칙 그대로)
    dispatchSupportModalIntent(held);
  }, 0);
}

/** 화면 하나를 다른 화면으로(접수 성공 → 접수 완료) — 결과가 그 화면에 맞을 때만 */
export function replaceSupportModalView(token: SupportModalOpToken, next: SupportModalStackView): boolean {
  if (!isSupportModalViewCurrent(token)) return false;
  commit(
    withStack(
      machine,
      machine.stack.map((v) => (v.id === token.viewId ? next : v))
    ),
    compat.restoreCaseId
  );
  return true;
}

/** 그 화면을 끝냄(확인했어요 성공·「확인」) — 그 화면만 빼고, 첫 화면이면 창을 닫는다 */
export function finishSupportModalView(token: SupportModalOpToken): boolean {
  if (!isSupportModalViewCurrent(token)) return false;
  const stack = machine.stack.filter((v) => v.id !== token.viewId);
  if (stack.length === 0) {
    clearSupportModalRestoreCaseId();
    // 쓰기 결과로 닫힐 때도 그 요청 표시·보관한 intent 는 끝(endSupportModalWrite)까지 둔다(C-13: 보관한 열기를 잃지 않음)
    commit({ ...closedState(machine, { kind: "intent" }), inflight: machine.inflight, held: machine.held });
    return true;
  }
  commit(withStack(machine, stack), compat.restoreCaseId);
  return true;
}

export function newSupportModalSubmittedView(info: SupportTicketSubmittedInfo): SupportModalStackView {
  return { kind: "submitted", id: nextViewId("submitted"), info };
}

/* ───────────── 옛 컨트롤러 공개 함수 (호환) ───────────── */

export type OpenSupportModalInput = {
  context?: SupportContext | null;
  /** Open directly into an existing case (notification / cold-start). */
  caseId?: string | null;
};

/** 이 입력으로 창을 열 수 있는가(문의 id 또는 쓸 수 있는 맥락) */
export function canOpenSupportModal(input: OpenSupportModalInput = {}): boolean {
  return Boolean(input.caseId?.trim()) || contextEnabled(input.context);
}

/** 창 열기 — 문의 id 면 open_case, 맥락이면 open_context. 문의를 만들지 않는다. */
export function openSupportModal(input: OpenSupportModalInput = {}): boolean {
  const caseId = input.caseId?.trim() || null;
  const context = contextEnabled(input.context) ? input.context : null;
  if (!caseId && !context) return false;
  if (caseId) dispatchSupportModalIntent({ type: "open_case", caseId });
  else dispatchSupportModalIntent({ type: "open_context", context: context! });
  return true;
}

/** UI-only close — does not resolve case or revoke session. */
export function closeSupportModal(): void {
  dispatchSupportModalIntent({ type: "close" });
}

/** 문의 id = 그 상세를 쌓기 · null = 맨 위 상세를 빼기(쓰기 화면으로) */
export function setSupportModalCaseId(caseId: string | null): void {
  if (machine.phase !== "open") return;
  const id = caseId?.trim() || null;
  if (id) {
    dispatchSupportModalIntent({ type: "open_case", caseId: id });
    return;
  }
  const top = machine.stack[machine.stack.length - 1];
  if (top?.kind === "detail" && machine.stack.length > 1) {
    commit(withStack(machine, machine.stack.slice(0, -1)));
  }
}

/** 새 문의하기 — 같은 대상의 새 쓰기 화면(분야 고르기부터) */
export function resetSupportModalToStart(nextContext?: SupportContext | null): void {
  if (machine.phase !== "open") return;
  const prev = compat.context;
  const context =
    nextContext && isSupportContextEnabled(nextContext)
      ? nextContext
      : prev
        ? {
            ...prev,
            category: "" as SupportContext["category"],
            needsCategorySelection: true,
            referenceType: undefined,
            referenceId: undefined,
            referenceTitle: undefined,
            explicitOtherSelection: undefined,
          }
        : null;
  if (!context) return;
  dispatchSupportModalIntent({ type: "new_inquiry", context });
}

/** 시험 전용 — 모듈 상태 초기화 */
export function __resetSupportModalMachineForTests(): void {
  backSteps.clear();
  commit({
    phase: "closed",
    session: machine.session + 1,
    stack: [],
    inflight: null,
    held: null,
    lastClose: null,
  });
}
