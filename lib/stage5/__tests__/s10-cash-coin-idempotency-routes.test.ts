/**
 * 5단계 S10 (L1) — 캐시 충전 · Coin→Cash 전환 · Coin 출금 (문서 G-2 §5-2 S10).
 *
 * 기존 L1 은 writer 단위(RPC 인자·키 필수)와 폼 소스(키 고정)를 증명한다 (J 매트릭스 문서 참조).
 * 이 파일은 라우트 층 셀을 채운다: 폼이 보낸 같은 키로 재시도하면 라우트가 그 키를 그대로 DB 함수에 넘기고
 * (서버가 키를 새로 만들지 않음), DB 멱등 응답을 그대로 돌려 「두 번째 행」이 생기지 않는다.
 * DB 쪽 멱등(UNIQUE·같은 행 반환)은 mock 이 아니라 L2(ND-3) 범위다 — 여기서는 DB 계약을 흉내 내는
 * 키→행 맵으로 라우트 동작만 본다.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "owner-s10";
const STORE = "store-s10";

type RpcCall = { fn: string; args: Record<string, unknown> };
const db = vi.hoisted(() => ({
  calls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  /** (fn,key) → 첫 생성 행 id — DB 멱등 계약의 흉내 */
  rows: new Map<string, { id: string; amount: unknown }>(),
  writes: [] as string[],
  approved: new Set<string>(),
}));
const spies = vi.hoisted(() => ({
  audit: vi.fn(async (..._a: unknown[]) => undefined),
  notifyDone: vi.fn(async (..._a: unknown[]) => undefined),
  permission: vi.fn(),
}));

function idemRow(fn: string, key: string, amount: unknown) {
  const k = `${fn}:${key}`;
  const hit = db.rows.get(k);
  if (hit) {
    if (hit.amount !== amount) return { conflict: true as const };
    return { id: hit.id, idempotent: true };
  }
  const id = `${fn}-row-${db.rows.size + 1}`;
  db.rows.set(k, { id, amount });
  return { id, idempotent: false };
}

function rpc(fn: string, args: Record<string, unknown> = {}) {
  db.calls.push({ fn, args });
  const key = String(args.p_idempotency_key ?? "");
  if (fn === "owner_create_business_cash_charge_request") {
    const r = idemRow(fn, key, args.p_amount_minor);
    if ("conflict" in r) return Promise.resolve({ data: { ok: false, error: "idempotency_key_reused" }, error: null });
    return Promise.resolve({ data: { ok: true, request_id: r.id, status: "PENDING", idempotent: r.idempotent }, error: null });
  }
  if (fn === "convert_store_economic_points_to_business_cash") {
    if (args.p_expected_rate_version !== 3) {
      return Promise.resolve({ data: { ok: false, error: "stale_rate", rate_pesos_per_point: 1, version: 3 }, error: null });
    }
    const r = idemRow(fn, key, args.p_points);
    if ("conflict" in r) return Promise.resolve({ data: { ok: false, error: "idempotency_key_reused" }, error: null });
    return Promise.resolve({
      data: { ok: true, idempotent: r.idempotent, sp_debited: args.p_points, bc_credited_minor: 100 * Number(args.p_points), rate_version: 3 },
      error: null,
    });
  }
  if (fn === "coin_withdrawal_request") {
    const r = idemRow(fn, key, args.p_amount);
    if ("conflict" in r) return Promise.resolve({ data: { ok: false, error: "idempotency_key_reused" }, error: null });
    return Promise.resolve({ data: { ok: true, request_id: r.id }, error: null });
  }
  if (fn === "approve_business_cash_charge_request") {
    const id = String(args.p_request_id);
    const again = db.approved.has(id);
    db.approved.add(id);
    return Promise.resolve({
      data: { ok: true, idempotent: again, ledger_id: `ledger-${id}`, balance_after_minor: 150000 },
      error: null,
    });
  }
  return Promise.resolve({ data: null, error: { message: `unexpected rpc ${fn}` } });
}

function from(table: string) {
  const b: Record<string, unknown> = {};
  const terminal = () => {
    if (table === "stores") {
      return {
        data: { id: STORE, owner_user_id: OWNER, approval_status: "approved", owner_can_edit_store_identity: false },
        error: null,
      };
    }
    if (table === "business_cash_charge_requests") {
      return { data: { owner_user_id: OWNER, amount_minor: 150000 }, error: null };
    }
    return { data: null, error: null };
  };
  for (const m of ["select", "eq", "in", "order", "limit", "range", "is"]) b[m] = () => b;
  for (const m of ["insert", "update", "upsert", "delete"]) {
    b[m] = () => {
      db.writes.push(`${table}.${m}`);
      return b;
    };
  }
  b.maybeSingle = async () => terminal();
  b.single = async () => terminal();
  b.then = (res: (v: unknown) => unknown) => Promise.resolve(terminal()).then(res);
  return b;
}
const sb = { rpc, from } as never;

vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => OWNER }));
vi.mock("@/lib/auth/server-guards", () => ({ validateActiveSession: async () => ({ ok: true }) }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => sb }));
vi.mock("@/lib/stores/advertising/canonical-business-cash-writer", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  loadStoreEconomicPointsBalance: async () => ({ balance: 10_000 }),
}));
vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: (...a: unknown[]) => spies.permission(...a),
}));
vi.mock("@/lib/admin/audit/append-admin-route-audit", () => ({
  appendAdminRouteAudit: (...a: unknown[]) => spies.audit(...a),
}));
vi.mock("@/lib/stores/advertising/delivery-ad-business-cash-charge-notify", () => ({
  safeNotifyOwnerBusinessCashChargeCompleted: (...a: unknown[]) => spies.notifyDone(...a),
  safeNotifyOwnerBusinessCashChargeRejected: vi.fn(async () => undefined),
}));

import { POST as businessCashPost } from "@/app/api/me/stores/[storeId]/business-cash/route";
import { POST as withdrawalsPost } from "@/app/api/me/stores/[storeId]/finance/withdrawals/route";
import { POST as adminChargesPost } from "@/app/api/admin/business-cash-charges/route";

const ctx = { params: Promise.resolve({ storeId: STORE }) };
function post(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function cash(body: Record<string, unknown>) {
  const res = await businessCashPost(post(`https://x.test/api/me/stores/${STORE}/business-cash`, body), ctx);
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}
async function withdraw(body: Record<string, unknown>) {
  const res = await withdrawalsPost(post(`https://x.test/api/me/stores/${STORE}/finance/withdrawals`, body), ctx);
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}
const callsOf = (fn: string): RpcCall[] => db.calls.filter((c) => c.fn === fn);

beforeEach(() => {
  db.calls.length = 0;
  db.rows.clear();
  db.writes.length = 0;
  db.approved.clear();
  vi.clearAllMocks();
  spies.permission.mockResolvedValue({ ok: true, actor: { userId: "admin-s10" }, sb });
});

describe("S10 L1 — 캐시 충전 신청: 폼 고정 키 재전송 → 같은 요청 1건", () => {
  const topup = { op: "topup_request", amountMinor: 150000, paymentMethod: "gcash", paymentReference: "GC-77", idempotencyKey: "bc_topup:form-1" };

  it("같은 키 2회 → DB 함수에 같은 키, 같은 requestId, 두 번째 idempotent:true, 테이블 직접 쓰기 0", async () => {
    const a = await cash(topup);
    const b = await cash(topup);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(b.json.requestId).toBe(a.json.requestId);
    expect([a.json.idempotent, b.json.idempotent]).toEqual([false, true]);
    expect(callsOf("owner_create_business_cash_charge_request").map((c) => c.args.p_idempotency_key)).toEqual([
      "bc_topup:form-1",
      "bc_topup:form-1",
    ]);
    expect(db.rows.size).toBe(1);
    expect(db.writes).toEqual([]);
  });

  it("키 없음 → 400 idempotency_required, DB 함수 미호출 (서버가 키를 만들지 않음)", async () => {
    const r = await cash({ ...topup, idempotencyKey: "" });
    expect(r).toMatchObject({ status: 400, json: { error: "idempotency_required" } });
    expect(db.calls).toEqual([]);
  });

  it("같은 키 + 다른 금액 → DB idempotency_key_reused → 409 (두 번째 행 없음)", async () => {
    await cash(topup);
    const r = await cash({ ...topup, amountMinor: 999 });
    expect(r).toMatchObject({ status: 409, json: { error: "idempotency_key_reused" } });
    expect(db.rows.size).toBe(1);
  });
});

describe("S10 L1 — Coin→Cash 전환: 견적 버전 + 고정 키", () => {
  const convert = { op: "convert", points: 5, expectedRateVersion: 3, idempotencyKey: "sp2bc:form-1" };

  it("같은 키 2회 → 같은 키 전달, 두 번째 idempotent:true, 전환 1건", async () => {
    const a = await cash(convert);
    const b = await cash(convert);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a.json.idempotent, b.json.idempotent]).toEqual([false, true]);
    expect(new Set(callsOf("convert_store_economic_points_to_business_cash").map((c) => c.args.p_idempotency_key))).toEqual(
      new Set(["sp2bc:form-1"])
    );
    expect(db.rows.size).toBe(1);
  });

  it("견적 버전 변경(stale_rate) → 409 + 새 버전 반환, 전환 0건", async () => {
    const r = await cash({ ...convert, expectedRateVersion: 2 });
    expect(r.status).toBe(409);
    expect(r.json).toMatchObject({ error: "stale_rate", version: 3 });
    expect(db.rows.size).toBe(0);
  });

  it("키 없음 → 400, DB 함수 미호출", async () => {
    const r = await cash({ ...convert, idempotencyKey: " " });
    expect(r).toMatchObject({ status: 400, json: { error: "idempotency_required" } });
    expect(callsOf("convert_store_economic_points_to_business_cash")).toEqual([]);
  });
});

describe("S10 L1 — Coin 출금 신청: 고정 키 재전송 → 요청 1건", () => {
  const body = {
    amount: 500,
    destinationType: "gcash",
    accountNumber: "09171234567",
    accountName: "Owner",
    idempotencyKey: "coin_withdrawal:form-1",
  };

  it("같은 키 2회 → 같은 requestId (201), DB 함수에 같은 키, 행 1개", async () => {
    const a = await withdraw(body);
    const b = await withdraw(body);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(b.json.requestId).toBe(a.json.requestId);
    expect(callsOf("coin_withdrawal_request").every((c) => c.args.p_idempotency_key === "coin_withdrawal:form-1")).toBe(true);
    expect(db.rows.size).toBe(1);
    expect(db.writes).toEqual([]);
  });

  it("키 없음 → 400 idempotencyKey_required, DB 함수 미호출", async () => {
    const r = await withdraw({ ...body, idempotencyKey: "" });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe("idempotencyKey_required");
    expect(callsOf("coin_withdrawal_request")).toEqual([]);
  });

  it("잔액 초과 → 400 exceeds_available, DB 함수 미호출", async () => {
    const r = await withdraw({ ...body, amount: 20_000 });
    expect(r).toMatchObject({ status: 400, json: { error: "exceeds_available" } });
    expect(callsOf("coin_withdrawal_request")).toEqual([]);
  });
});

describe("S10 L1 — 관리자 충전 승인: 권한키·사유·재시도 멱등", () => {
  async function approve(body: Record<string, unknown>) {
    const res = await adminChargesPost(post("https://x.test/api/admin/business-cash-charges", body));
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  }

  it("business 권한 없음 → 403, 승인 RPC 미호출", async () => {
    const { NextResponse } = await import("next/server");
    spies.permission.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: "forbidden_permission" }, { status: 403 }),
    });
    const r = await approve({ op: "approve", requestId: "req-1", reason: "deposit verified" });
    expect(r.status).toBe(403);
    expect(spies.permission).toHaveBeenCalledWith("business");
    expect(db.calls).toEqual([]);
  });

  it("사유 없음 → 400, 승인 RPC 미호출", async () => {
    const r = await approve({ op: "approve", requestId: "req-1" });
    expect(r.status).toBe(400);
    expect(db.calls).toEqual([]);
  });

  it("같은 요청 승인 2회 → RPC 는 두 번째를 idempotent 로 반환, 라우트도 idempotent:true (원장 재기록 없음은 DB 계약 L2)", async () => {
    const a = await approve({ op: "approve", requestId: "req-1", reason: "deposit verified" });
    const b = await approve({ op: "approve", requestId: "req-1", reason: "deposit verified" });
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a.json.idempotent, b.json.idempotent]).toEqual([false, true]);
    expect(callsOf("approve_business_cash_charge_request")[0].args).toEqual({
      p_admin_user_id: "admin-s10",
      p_request_id: "req-1",
      p_reason: "deposit verified",
    });
    // 알림은 requestId 기반 dedupe 키(delivery_ad_cash_charge_ok:{id}) — 두 호출 모두 같은 요청 id.
    expect(spies.notifyDone.mock.calls.map((c) => (c[1] as { requestId: string }).requestId)).toEqual(["req-1", "req-1"]);
  });
});
