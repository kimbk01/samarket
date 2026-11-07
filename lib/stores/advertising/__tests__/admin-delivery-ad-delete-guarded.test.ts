/**
 * AL-01 · 보완 설계 §4-3 — 배달 광고 관리자 초안 삭제 (공통·도메인 같은 함수) 동작 시험.
 * AD2-10 · AD2-11 (2026-11-07): 사유 필수 · 이력(노출·문의·결제·막는 감사) 검사·삭제·감사 1행은 DB 함수
 * `admin_delivery_ad_delete_draft` 한 트랜잭션 — TS 는 같은 판 확인 후 함수 1번만 부르고 표를 직접 지우지 않는다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const hasCanonicalBcFundingSecured = vi.fn(async () => false);
vi.mock("@/lib/stores/advertising/canonical-business-cash-writer", () => ({
  hasCanonicalBcFundingSecured: (...a: unknown[]) =>
    (hasCanonicalBcFundingSecured as (...x: unknown[]) => unknown)(...a),
}));

import {
  adminDeleteDeliveryAdDraftGuarded,
  isBlockingDeliveryAdDeleteAudit,
} from "@/lib/stores/advertising/admin-delivery-ad-delete";

type Row = Record<string, unknown>;

function makeDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map((r) => ({ ...r }));
  const deletes: Array<{ table: string; filters: Record<string, unknown> }> = [];
  const inserts: Array<{ table: string; row: Row }> = [];
  const rpcCalls: Array<{ fn: string; args: unknown }> = [];
  let rpcResult: { data: unknown; error: unknown } = { data: { ok: true }, error: null };
  const sb = {
    tables,
    deletes,
    inserts,
    rpcCalls,
    setRpc(r: { data: unknown; error: unknown }) {
      rpcResult = r;
    },
    async rpc(fn: string, args: unknown) {
      rpcCalls.push({ fn, args });
      return rpcResult;
    },
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let mode: "select" | "delete" | "insert" = "select";
      let head = false;
      let single = false;
      let insertRow: Row | null = null;
      const match = () =>
        (tables[table] ?? []).filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v));
      const q = {
        select(_c?: string, opts?: { head?: boolean }) {
          if (mode === "select") head = opts?.head === true;
          return q;
        },
        delete() {
          mode = "delete";
          return q;
        },
        insert(row: Row) {
          mode = "insert";
          insertRow = row;
          return q;
        },
        eq(col: string, val: unknown) {
          filters[col] = val;
          return q;
        },
        maybeSingle() {
          single = true;
          return q;
        },
        then(res: (v: unknown) => void) {
          if (mode === "insert") {
            inserts.push({ table, row: insertRow ?? {} });
            (tables[table] ??= []).push(insertRow ?? {});
            return res({ error: null });
          }
          if (mode === "delete") {
            const hit = match();
            deletes.push({ table, filters: { ...filters } });
            tables[table] = (tables[table] ?? []).filter((r) => !hit.includes(r));
            return res({ data: hit.map((r) => ({ id: r.id })), error: null });
          }
          const rows = match();
          if (head) return res({ count: rows.length, error: null });
          if (single) return res({ data: rows[0] ?? null, error: null });
          return res({ data: rows, error: null });
        },
      };
      return q;
    },
  };
  return sb;
}

const ADMIN = "admin-1";
const CID = "camp-1";
const UPDATED = "2026-11-01T00:00:00Z";

function firstPartyBannerDraft(over: Row = {}): Row {
  return {
    id: CID,
    lifecycle_status: "DRAFT",
    updated_at: UPDATED,
    campaign_source: "DIBAY_FIRST_PARTY",
    creative_id: "cr-2",
    ...over,
  };
}

function seedBase(over: Record<string, Row[]> = {}): Record<string, Row[]> {
  return {
    store_banner_ad_campaigns: [firstPartyBannerDraft()],
    delivery_banner_campaign_inventories: [{ id: "j1", campaign_id: CID }],
    delivery_ad_creatives: [
      { id: "cr-2", supersedes_creative_id: "cr-1" },
      { id: "cr-1", supersedes_creative_id: null },
      { id: "cr-other", supersedes_creative_id: null },
    ],
    delivery_ad_audit_logs: [
      { id: "a1", campaign_id: CID, product_kind: "banner", action: "admin_first_party_banner_create" },
      { id: "a2", campaign_id: CID, product_kind: "banner", action: "creative_replaced" },
    ],
    ...over,
  };
}

const input = {
  adminUserId: ADMIN,
  productKind: "banner" as const,
  campaignId: CID,
  expectedLifecycle: "DRAFT" as const,
  expectedUpdatedAt: UPDATED,
  reason: "잘못 만든 초안",
};

beforeEach(() => {
  vi.clearAllMocks();
  hasCanonicalBcFundingSecured.mockResolvedValue(false);
});

describe("AL-01 adminDeleteDeliveryAdDraftGuarded", () => {
  it("운영자 초안 + 사유 → DB 함수 1번(사유 전달) · TS 가 표를 직접 지우거나 감사를 쓰지 않음", async () => {
    const sb = makeDb(seedBase());
    const res = await adminDeleteDeliveryAdDraftGuarded(sb as never, input);
    expect(res).toEqual({ ok: true, campaignId: CID });
    expect(sb.rpcCalls).toEqual([
      { fn: "admin_delivery_ad_delete_draft", args: { p_campaign: CID, p_admin: ADMIN, p_reason: "잘못 만든 초안" } },
    ]);
    expect(sb.deletes).toEqual([]);
    expect(sb.inserts).toEqual([]);
  });

  it("사유 없음·1자 → reason_required · DB 함수 안 부름", async () => {
    for (const reason of [null, "a"]) {
      const sb = makeDb(seedBase());
      const res = await adminDeleteDeliveryAdDraftGuarded(sb as never, { ...input, reason });
      expect(res).toEqual({ ok: false, error: "reason_required", httpStatus: 400 });
      expect(sb.rpcCalls).toEqual([]);
    }
  });

  it.each([
    ["delete_not_allowed", 422],
    ["delete_blocked_funding_secured", 409],
    ["not_draft", 422],
  ] as const)("DB 함수가 %s → 같은 코드 · %s", async (code, status) => {
    const sb = makeDb(seedBase());
    sb.setRpc({ data: { ok: false, error: code }, error: null });
    const res = await adminDeleteDeliveryAdDraftGuarded(sb as never, input);
    expect(res).toEqual({ ok: false, error: code, httpStatus: status });
    expect(sb.deletes).toEqual([]);
  });

  it("DB 함수 없음 → rpc_missing 503 · 삭제 폴백 없음", async () => {
    const sb = makeDb(seedBase());
    sb.setRpc({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    const res = await adminDeleteDeliveryAdDraftGuarded(sb as never, input);
    expect(res).toEqual({ ok: false, error: "rpc_missing", httpStatus: 503 });
    expect(sb.deletes).toEqual([]);
  });

  it("DB 원문 오류 → db_error (원문 노출 없음)", async () => {
    const sb = makeDb(seedBase());
    sb.setRpc({ data: null, error: { code: "23503", message: "fk violation detail" } });
    const res = await adminDeleteDeliveryAdDraftGuarded(sb as never, input);
    expect(res).toEqual({ ok: false, error: "db_error", httpStatus: 500 });
  });

  it("사장님 광고(OWNER_PAID · 값 없음 포함) → not_admin_direct", async () => {
    for (const source of ["OWNER_PAID", undefined]) {
      const sb = makeDb(
        seedBase({ store_banner_ad_campaigns: [firstPartyBannerDraft({ campaign_source: source })] })
      );
      const res = await adminDeleteDeliveryAdDraftGuarded(sb as never, input);
      expect(res).toEqual({ ok: false, error: "not_admin_direct", httpStatus: 422 });
      expect(sb.deletes).toEqual([]);
    }
  });

  it("초안 아님 → not_draft · 판이 다르면 stale", async () => {
    const sbActive = makeDb(
      seedBase({ store_banner_ad_campaigns: [firstPartyBannerDraft({ lifecycle_status: "SCHEDULED" })] })
    );
    expect(
      await adminDeleteDeliveryAdDraftGuarded(sbActive as never, { ...input, expectedLifecycle: "SCHEDULED" })
    ).toEqual({ ok: false, error: "not_draft", httpStatus: 422 });
    const sbStale = makeDb(seedBase());
    expect(
      await adminDeleteDeliveryAdDraftGuarded(sbStale as never, { ...input, expectedUpdatedAt: "2020-01-01T00:00:00Z" })
    ).toEqual({ ok: false, error: "stale_updated_at", httpStatus: 409 });
  });

  it("없는 캠페인 → campaign_not_found 404", async () => {
    const sb = makeDb(seedBase({ store_banner_ad_campaigns: [] }));
    expect(await adminDeleteDeliveryAdDraftGuarded(sb as never, input)).toEqual({
      ok: false,
      error: "campaign_not_found",
      httpStatus: 404,
    });
  });

  it("막는 감사 규칙: 생성·초안 편집은 막지 않고 전이·환불은 막는다", () => {
    for (const a of [
      "admin_first_party_banner_create",
      "owner_banner_create_draft",
      "owner_sponsored_update_draft",
      "draft_saved",
      "creative_replaced",
      "updated",
    ]) {
      expect(isBlockingDeliveryAdDeleteAudit(a)).toBe(false);
    }
    for (const a of ["submitted", "approved", "paused_admin", "ended_admin", "bc_refund_orphan"]) {
      expect(isBlockingDeliveryAdDeleteAudit(a)).toBe(true);
    }
  });
});
