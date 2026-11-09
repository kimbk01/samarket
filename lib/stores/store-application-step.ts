/**
 * 매장 입점 진행 단계 — DB 값과 1:1 (Owner 2026-11-10 「진행 사항을 정확히 프로세스 형태로」).
 * 사장님 진행 막대·어드민 처리 이력이 같은 판정 함수를 쓴다. 서버 전용 모듈 import 금지.
 *
 *  ① 신청(submit)  ② 접수(received = pending)  ③ 심사(review = under_review · 보완 · 반려)
 *  ④ 입점 승인(approved)  ⑤ 판매 승인(store_sales_permissions.sales_status = approved)  ⑥ 영업 시작(is_visible)
 */

export type StoreApplicationStepKey = "submit" | "received" | "review" | "approved" | "sales" | "live";

export type StoreApplicationStepState = "done" | "current" | "todo" | "warn" | "bad";

export const STORE_APPLICATION_STEP_KEYS: readonly StoreApplicationStepKey[] = [
  "submit",
  "received",
  "review",
  "approved",
  "sales",
  "live",
];

/** 현재 상태 이름 — 문구 키 선택용 */
export type StoreApplicationPhase =
  | "received"
  | "under_review"
  | "revision_requested"
  | "rejected"
  | "approved_wait_sales"
  | "sales_wait_visible"
  | "live"
  | "suspended";

export type StoreApplicationStepInput = {
  approval_status: string | null | undefined;
  sales_status?: string | null;
  is_visible?: boolean | null;
};

export type StoreApplicationStepView = {
  phase: StoreApplicationPhase;
  steps: { key: StoreApplicationStepKey; state: StoreApplicationStepState }[];
};

function build(states: StoreApplicationStepState[]): StoreApplicationStepView["steps"] {
  return STORE_APPLICATION_STEP_KEYS.map((key, i) => ({ key, state: states[i] ?? "todo" }));
}

export function resolveStoreApplicationPhase(input: StoreApplicationStepInput): StoreApplicationPhase {
  const st = String(input.approval_status ?? "").trim();
  if (st === "under_review") return "under_review";
  if (st === "revision_requested") return "revision_requested";
  if (st === "rejected") return "rejected";
  if (st === "suspended") return "suspended";
  if (st === "approved") {
    if (String(input.sales_status ?? "").trim() !== "approved") return "approved_wait_sales";
    return input.is_visible === true ? "live" : "sales_wait_visible";
  }
  return "received";
}

export function resolveStoreApplicationStep(input: StoreApplicationStepInput): StoreApplicationStepView {
  const phase = resolveStoreApplicationPhase(input);
  switch (phase) {
    case "received":
      return { phase, steps: build(["done", "current", "todo", "todo", "todo", "todo"]) };
    case "under_review":
      return { phase, steps: build(["done", "done", "current", "todo", "todo", "todo"]) };
    case "revision_requested":
      return { phase, steps: build(["done", "done", "warn", "todo", "todo", "todo"]) };
    case "rejected":
      return { phase, steps: build(["done", "done", "bad", "todo", "todo", "todo"]) };
    case "approved_wait_sales":
      return { phase, steps: build(["done", "done", "done", "done", "current", "todo"]) };
    case "sales_wait_visible":
      return { phase, steps: build(["done", "done", "done", "done", "done", "current"]) };
    case "live":
      return { phase, steps: build(["done", "done", "done", "done", "done", "done"]) };
    case "suspended":
      return { phase, steps: build(["done", "done", "done", "done", "done", "bad"]) };
  }
}

/** 상태 변경 기록 1행 (store_application_events) */
export type StoreApplicationEventRow = {
  id?: string;
  from_status: string | null;
  to_status: string;
  action: string;
  reason: string | null;
  actor_type: "owner" | "admin" | "system";
  created_at: string;
};

/** 단계별 시각 — 같은 상태로 여러 번 바뀌었으면 가장 최근 시각 */
export function resolveStoreApplicationStepTimes(input: {
  created_at?: string | null;
  approved_at?: string | null;
  sales_approved_at?: string | null;
  first_listed_at?: string | null;
  events: readonly StoreApplicationEventRow[];
}): Partial<Record<StoreApplicationStepKey, string>> {
  const latest = (to: string): string | null => {
    let best: string | null = null;
    for (const e of input.events) {
      if (e.to_status !== to) continue;
      if (!best || e.created_at > best) best = e.created_at;
    }
    return best;
  };
  const latestAny = (tos: string[]): string | null => {
    let best: string | null = null;
    for (const to of tos) {
      const v = latest(to);
      if (v && (!best || v > best)) best = v;
    }
    return best;
  };
  const out: Partial<Record<StoreApplicationStepKey, string>> = {};
  const created = String(input.created_at ?? "").trim();
  if (created) out.submit = created;
  const received = latest("pending") ?? (created || null);
  if (received) out.received = received;
  const review = latestAny(["under_review", "revision_requested", "rejected"]);
  if (review) out.review = review;
  const approved = latest("approved") ?? (String(input.approved_at ?? "").trim() || null);
  if (approved) out.approved = approved;
  const sales = String(input.sales_approved_at ?? "").trim();
  if (sales) out.sales = sales;
  const live = String(input.first_listed_at ?? "").trim();
  if (live) out.live = live;
  return out;
}
