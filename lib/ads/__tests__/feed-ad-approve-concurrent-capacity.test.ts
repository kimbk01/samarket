/**
 * FB-P09 (2026-11-04) — 동시 승인에서 진 쪽: 보류 포인트를 돌려주지 않고 「검토 중」으로 남는다 · 다시 승인 가능 · 원장 이동 0.
 * 옛 코드: 진 쪽을 `compensateFeedAdPointHold` 로 환급(보류 → 해제)해서, 다시 승인하면 `hold_missing` 500.
 * 메모리 가짜 DB 에 자리 트리거(`feed_ad_campaigns_pool_capacity_guard` · 풀 3)를 흉내 낸다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/points/user-point-ledger", () => ({
  spendUserPoints: vi.fn(async () => ({ ok: true })),
  creditUserPoints: vi.fn(async () => ({ ok: true })),
  appendUserPointLedgerAudit: vi.fn(async () => undefined),
}));

import { creditUserPoints, spendUserPoints } from "@/lib/points/user-point-ledger";
import { approveFeedAdRequest } from "@/lib/ads/approve-feed-ad-request";

type Row = Record<string, unknown>;
const tick = () => new Promise((r) => setTimeout(r, 0));

function makeDb() {
  const state = { requests: [] as Row[], requestCreatives: [] as Row[], campaigns: [] as Row[], creatives: [] as Row[], holds: [] as Row[] };
  const occupies = (c: Row) => !["", "ended", "rejected", "draft"].includes(String(c.status ?? ""));

  function tableApi(table: string) {
    const eqs: { col: string; val: unknown }[] = [];
    const ins: { col: string; vals: unknown[] }[] = [];
    const nulls: string[] = [];
    let payload: Row | Row[] | null = null;
    let mode: "select" | "insert" | "update" | "delete" = "select";
    const match = (r: Row) =>
      eqs.every((f) => String(r[f.col]) === String(f.val)) &&
      ins.every((f) => f.vals.map(String).includes(String(r[f.col]))) &&
      nulls.every((c) => r[c] == null);
    const list = (): Row[] =>
      table === "feed_ad_requests"
        ? state.requests
        : table === "feed_ad_request_creatives"
          ? state.requestCreatives
          : table === "feed_ad_campaigns"
            ? state.campaigns
            : table === "feed_ad_creatives"
              ? state.creatives
              : table === "feed_ad_point_holds"
                ? state.holds
                : [];

    async function finish(single: boolean) {
      await tick(); // 다른 승인과 순서가 섞이게
      const rows = list();
      if (mode === "select") {
        const hit = rows.filter(match);
        return { data: single ? (hit[0] ?? null) : hit, error: null };
      }
      if (mode === "insert") {
        const arr = Array.isArray(payload) ? payload : [payload as Row];
        const made = arr.map((r, i) => ({ id: `${table}-${rows.length + i + 1}`, ...r }));
        rows.push(...made);
        return { data: single ? made[0] : made, error: null };
      }
      if (mode === "delete") {
        const keep = rows.filter((r) => !match(r));
        rows.length = 0;
        rows.push(...keep);
        return { data: null, error: null };
      }
      const hit = rows.filter(match);
      const p = payload as Row;
      if (table === "feed_ad_campaigns" && p.status === "active") {
        // 자리 트리거: 같은 위치에서 점유 중인 다른 행이 3개 이상이면 막는다
        for (const r of hit) {
          const used = state.campaigns.filter((c) => c !== r && c.placement === r.placement && occupies(c)).length;
          if (used >= 3) return { data: null, error: { message: "feed_ad_pool_capacity_full" } };
        }
      }
      for (const r of hit) Object.assign(r, p);
      return { data: single ? (hit[0] ?? null) : hit, error: null };
    }

    const api: Record<string, unknown> = {
      select: () => api,
      insert: (r: Row | Row[]) => ((mode = "insert"), (payload = r), api),
      update: (r: Row) => ((mode = "update"), (payload = r), api),
      delete: () => ((mode = "delete"), api),
      eq: (col: string, val: unknown) => (eqs.push({ col, val }), api),
      in: (col: string, vals: unknown[]) => (ins.push({ col, vals }), api),
      is: (col: string, val: null) => (val === null && nulls.push(col), api),
      order: () => api,
      maybeSingle: () => finish(true),
    };
    (api as { then?: unknown }).then = (res: (v: unknown) => void, rej?: (e: unknown) => void) => finish(false).then(res, rej);
    return api;
  }
  const sb = { from: (t: string) => tableApi(t) } as unknown as SupabaseClient;
  return { sb, state };
}

function seedRequest(state: ReturnType<typeof makeDb>["state"], id: string, userId: string) {
  state.requests.push({
    id,
    user_id: userId,
    product_id: "feed_banner_trade_3",
    domain: "trade",
    placement: "TRADE_HOME",
    target_category_id: null,
    target_topic_slug: null,
    destination_type: "internal_page",
    destination_id: "",
    destination_url: "/market",
    duration_days: 3,
    point_cost: 8000,
    status: "pending_review",
    reviewed_by: null,
  });
  state.requestCreatives.push({ request_id: id, sort_order: 1, image_url: "https://example.com/a.png", alt_text: "", headline: "" });
  state.holds.push({ id: `hold-${id}`, request_id: id, user_id: userId, amount: 8000, status: "held" });
}

describe("FB-P09 동시 승인 — 진 쪽 보류 유지 · 재승인 성공 · 원장 이동 0", () => {
  beforeEach(() => {
    vi.mocked(creditUserPoints).mockClear();
    vi.mocked(spendUserPoints).mockClear();
  });

  it("마지막 자리 1개에 두 건을 같이 승인 → 이긴 쪽 확정 1 · 진 쪽 보류·검토 중 · 다시 승인 성공", async () => {
    const { sb, state } = makeDb();
    state.campaigns.push(
      { id: "other-1", placement: "TRADE_HOME", status: "active" },
      { id: "other-2", placement: "TRADE_HOME", status: "active" }
    );
    seedRequest(state, "req-a", "user-a");
    seedRequest(state, "req-b", "user-b");

    const [a, b] = await Promise.all([
      approveFeedAdRequest(sb, { requestId: "req-a", adminUserId: "admin-1" }),
      approveFeedAdRequest(sb, { requestId: "req-b", adminUserId: "admin-2" }),
    ]);
    const results = [a, b];
    const winners = results.filter((r) => r.ok);
    const losers = results.filter((r) => !r.ok);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    const loser = losers[0]!;
    if (loser.ok) throw new Error("unreachable");
    expect(loser.error).toBe("capacity_full");
    expect(loser.httpStatus).toBe(409);
    expect(loser.holdKept).toBe(true);
    expect(loser.message).toContain("자리가 차서 승인되지 않았습니다");

    const loserId = a.ok ? "req-b" : "req-a";
    const winnerId = a.ok ? "req-a" : "req-b";
    expect(state.holds.find((h) => h.request_id === winnerId)?.status).toBe("captured");
    // 진 쪽: 보류 그대로 · 검토 중 · 심사자 비움 · 광고 행 없음
    expect(state.holds.find((h) => h.request_id === loserId)?.status).toBe("held");
    const loserReq = state.requests.find((r) => r.id === loserId)!;
    expect(loserReq.status).toBe("pending_review");
    expect(loserReq.reviewed_by).toBeNull();
    expect(state.campaigns.filter((c) => c.request_id === loserId)).toHaveLength(0);
    // 원장: 돌려준 포인트도, 새로 뺀 포인트도 없다
    expect(creditUserPoints).not.toHaveBeenCalled();
    expect(spendUserPoints).not.toHaveBeenCalled();

    // 자리가 나면 다시 승인 → 성공 (hold_missing 없음)
    state.campaigns.find((c) => c.id === "other-1")!.status = "ended";
    const again = await approveFeedAdRequest(sb, { requestId: loserId, adminUserId: "admin-2" });
    expect(again).toMatchObject({ ok: true, status: "active" });
    expect(state.holds.find((h) => h.request_id === loserId)?.status).toBe("captured");
    expect(creditUserPoints).not.toHaveBeenCalled();
    expect(spendUserPoints).not.toHaveBeenCalled();
  });

  it("DS-3: 목적지 없는 신청은 승인하지 않는다(심사 잡기 전 · 보류 그대로)", async () => {
    const { sb, state } = makeDb();
    seedRequest(state, "req-n", "user-n");
    state.requests[0]!.destination_url = "";
    const r = await approveFeedAdRequest(sb, { requestId: "req-n", adminUserId: "admin-1" });
    expect(r).toMatchObject({ ok: false, error: "destination_required", httpStatus: 400 });
    expect(state.holds[0]?.status).toBe("held");
    expect(state.campaigns).toHaveLength(0);
    expect(state.requests[0]?.reviewed_by).toBeNull();
  });
});
