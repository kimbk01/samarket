/**
 * AL-01 · 보완 설계 §4-3 — 배달 광고 관리자 초안 삭제 (공통·도메인 같은 함수) 동작 시험.
 * 생성 감사 행만 있는 초안은 지워지고, 노출·문의·결제·막는 감사·사장님 광고·초안 아님은 막힌다. 소재 행도 정리된다.
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
  const sb = {
    tables,
    deletes,
    inserts,
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
  it("생성·초안 편집 감사 행만 있는 운영자 초안 → 삭제 성공 · 소재(이전 판 포함) 삭제 · 감사 1행", async () => {
    const sb = makeDb(seedBase());
    const res = await adminDeleteDeliveryAdDraftGuarded(sb as never, input);
    expect(res).toEqual({ ok: true, campaignId: CID });
    expect(sb.tables.store_banner_ad_campaigns).toEqual([]);
    expect(sb.tables.delivery_banner_campaign_inventories).toEqual([]);
    expect(sb.tables.delivery_ad_creatives.map((r) => r.id)).toEqual(["cr-other"]);
    const campDel = sb.deletes.find((d) => d.table === "store_banner_ad_campaigns");
    expect(campDel?.filters).toEqual({
      id: CID,
      lifecycle_status: "DRAFT",
      campaign_source: "DIBAY_FIRST_PARTY",
      updated_at: UPDATED,
    });
    const audits = sb.inserts.filter((i) => i.table === "delivery_ad_audit_logs");
    expect(audits).toHaveLength(1);
    expect(audits[0].row).toMatchObject({
      action: "deleted_safe_draft",
      actor_type: "admin",
      actor_user_id: ADMIN,
      reason: "잘못 만든 초안",
      after_json: { deleted: true, creatives_deleted: ["cr-2", "cr-1"] },
    });
  });

  it("노출 기록 1건 → delete_not_allowed · 아무것도 지우지 않음", async () => {
    const sb = makeDb(
      seedBase({
        delivery_ad_impression_events: [{ id: "i1", campaign_id: CID, product_kind: "banner" }],
      })
    );
    const res = await adminDeleteDeliveryAdDraftGuarded(sb as never, input);
    expect(res).toEqual({ ok: false, error: "delete_not_allowed", httpStatus: 422 });
    expect(sb.deletes).toEqual([]);
    expect(sb.inserts).toEqual([]);
  });

  it("문의 건 1건(연쇄 삭제 대상) → delete_not_allowed · 문의 건 그대로", async () => {
    const sb = makeDb(
      seedBase({
        delivery_ad_operations_cases: [{ id: "case-1", product_kind: "banner", banner_campaign_id: CID }],
      })
    );
    const res = await adminDeleteDeliveryAdDraftGuarded(sb as never, input);
    expect(res).toEqual({ ok: false, error: "delete_not_allowed", httpStatus: 422 });
    expect(sb.deletes).toEqual([]);
    expect(sb.tables.delivery_ad_operations_cases).toHaveLength(1);
  });

  it("결제(SECURED) → delete_blocked_funding_secured", async () => {
    hasCanonicalBcFundingSecured.mockResolvedValue(true);
    const sb = makeDb(seedBase());
    const res = await adminDeleteDeliveryAdDraftGuarded(sb as never, input);
    expect(res).toEqual({ ok: false, error: "delete_blocked_funding_secured", httpStatus: 409 });
    expect(sb.deletes).toEqual([]);
  });

  it("환불된 결제 기록(원장 이력) → delete_not_allowed", async () => {
    const sb = makeDb(
      seedBase({
        delivery_ad_canonical_bc_fundings: [
          { id: "f1", product_kind: "banner", application_id: CID, status: "REFUNDED" },
        ],
      })
    );
    const res = await adminDeleteDeliveryAdDraftGuarded(sb as never, input);
    expect(res).toEqual({ ok: false, error: "delete_not_allowed", httpStatus: 422 });
  });

  it("막는 감사 행(제출 등) → delete_not_allowed", async () => {
    const sb = makeDb(
      seedBase({
        delivery_ad_audit_logs: [
          { id: "a1", campaign_id: CID, product_kind: "banner", action: "admin_first_party_banner_create" },
          { id: "a3", campaign_id: CID, product_kind: "banner", action: "submitted" },
        ],
      })
    );
    const res = await adminDeleteDeliveryAdDraftGuarded(sb as never, input);
    expect(res).toEqual({ ok: false, error: "delete_not_allowed", httpStatus: 422 });
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
