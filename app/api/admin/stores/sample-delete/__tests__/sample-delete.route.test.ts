/**
 * 3-C §9-4 — POST /api/admin/stores/sample-delete
 * 권한 없음 403 · 실매장/테스트 매장 삭제 거부 · 확인 토큰 불일치 거부 · client_request_id 중복 실행 안전 ·
 * 이미 삭제됨 분리 · 공유 Storage 파일 제외.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const S_SAMPLE = "11111111-1111-4111-8111-111111111111";
const S_REAL = "22222222-2222-4222-8222-222222222222";
const S_TEST = "33333333-3333-4333-8333-333333333333";
const S_GONE = "44444444-4444-4444-8444-444444444444";

let permOk = true;
let previewRows: Record<string, unknown>[] = [];
let priorBatch: Record<string, unknown> | null = null;
const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
const audit = vi.fn(async (..._a: unknown[]) => undefined);
const removeAsset = vi.fn(async (input: { originalPath: string }) => ({
  attempted: [input.originalPath],
  removed: [input.originalPath],
  failed: [],
}));
const bump = vi.fn();

function makeSb() {
  return {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      if (fn === "admin_sample_store_delete_preview") return { data: previewRows, error: null };
      if (fn === "admin_delete_sample_store") {
        const id = String(args.p_store_id);
        const row = previewRows.find((r) => r.store_id === id);
        return {
          data: {
            status: "deleted",
            store_id: id,
            store_name: row?.store_name ?? null,
            slug: "s-1",
            menu_count: 3,
            image_count: 3,
            images: [
              { path: `${id}/own.l1.webp`, shared: false },
              { path: `${id}/shared.l1.webp`, shared: true },
              { path: `${id}/shared.l1.hero.webp`, shared: false },
            ],
          },
          error: null,
        };
      }
      return { data: null, error: { message: "unknown fn" } };
    },
    from: (table: string) => {
      const b = {
        select: () => b,
        eq: () => b,
        order: () => b,
        limit: () => b,
        maybeSingle: async () => ({
          data: table === "audit_logs" && priorBatch ? { after_json: priorBatch } : null,
          error: null,
        }),
      };
      return b;
    },
    storage: { from: () => ({ remove: async () => ({ error: null }) }) },
  };
}

vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: async () =>
    permOk
      ? { ok: true, actor: { userId: "admin-1" } }
      : {
          ok: false,
          response: new Response(JSON.stringify({ ok: false, error: "forbidden_permission" }), { status: 403 }),
        },
}));
vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => "admin-1" }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => makeSb() }));
vi.mock("@/lib/audit/append-audit-log", () => ({ appendAuditLog: (...a: unknown[]) => audit(...a) }));
vi.mock("@/lib/audit/request-meta", () => ({ getAuditRequestMeta: () => ({ ip: null, userAgent: null }) }));
vi.mock("@/lib/media/canonical-image-lifecycle.server", () => ({
  removeCanonicalImageAssetLogged: (input: { originalPath: string }) => removeAsset(input),
}));
vi.mock("@/lib/stores/store-public-shared-cache-generation", () => ({
  bumpStorePublicSharedCacheGeneration: (r: string) => bump(r),
}));
vi.mock("@/lib/stores/store-home-feed-server-cache", () => ({ clearStoreHomeFeedServerCache: vi.fn() }));
vi.mock("@/lib/stores/store-public-cache-invalidate-server", () => ({ invalidateStorePublicCachesForSlugOnServer: vi.fn() }));
vi.mock("@/lib/stores/store-menus-snapshot-invalidate-by-store-id", () => ({
  invalidateStoreMenusSnapshotCacheByStoreId: vi.fn(),
}));

import { POST } from "@/app/api/admin/stores/sample-delete/route";

function req(body: unknown) {
  return new Request("http://localhost/api/admin/stores/sample-delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

function preview(id: string, kind: string, over: Record<string, unknown> = {}) {
  return {
    store_id: id,
    exists: true,
    store_kind: kind,
    store_name: `${kind}-store`,
    menu_count: 3,
    option_count: 0,
    section_count: 1,
    images: [],
    deletable: kind === "sample",
    reasons: kind === "sample" ? [] : ["not_sample_store"],
    ...over,
  };
}

async function previewToken(ids: string[]): Promise<string> {
  const res = await POST(req({ mode: "preview", store_ids: ids }));
  const json = await res.json();
  return json.confirm_token as string;
}

beforeEach(() => {
  permOk = true;
  priorBatch = null;
  rpcCalls.length = 0;
  audit.mockClear();
  removeAsset.mockClear();
  bump.mockClear();
  previewRows = [preview(S_SAMPLE, "sample"), preview(S_REAL, "real"), preview(S_TEST, "legacy_test")];
});

describe("3-C sample-delete route", () => {
  it("business 권한 없으면 403 (RPC 호출 없음)", async () => {
    permOk = false;
    const res = await POST(req({ mode: "preview", store_ids: [S_SAMPLE] }));
    expect(res.status).toBe(403);
    expect(rpcCalls).toHaveLength(0);
  });

  it("미리보기: 실매장·테스트 매장은 삭제 불가로 표시하고 토큰을 준다", async () => {
    const res = await POST(req({ mode: "preview", store_ids: [S_SAMPLE, S_REAL, S_TEST] }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.summary).toMatchObject({ deletable: 1, blocked: 2 });
    expect(typeof json.confirm_token).toBe("string");
  });

  it("확인 토큰이 다르면 409 preview_changed, 삭제 RPC 없음", async () => {
    const res = await POST(
      req({ mode: "execute", store_ids: [S_SAMPLE], confirm_token: "stale", reason: "오픈 정리", client_request_id: "req_abcdefgh1" })
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("preview_changed");
    expect(rpcCalls.some((c) => c.fn === "admin_delete_sample_store")).toBe(false);
  });

  it("미리보기 후 건수가 바뀌면 거부", async () => {
    const token = await previewToken([S_SAMPLE]);
    previewRows = [preview(S_SAMPLE, "sample", { menu_count: 9 })];
    const res = await POST(req({ mode: "execute", store_ids: [S_SAMPLE], confirm_token: token, reason: "오픈 정리" }));
    expect(res.status).toBe(409);
  });

  it("실행: 샘플만 삭제, 실매장·테스트 매장은 삭제 RPC 를 부르지 않고 「삭제 불가」, 공유 이미지 묶음 제외", async () => {
    const ids = [S_SAMPLE, S_REAL, S_TEST];
    const token = await previewToken(ids);
    const res = await POST(req({ mode: "execute", store_ids: ids, confirm_token: token, reason: "오픈 정리" }));
    const json = await res.json();
    expect(res.status).toBe(200);
    const deleteCalls = rpcCalls.filter((c) => c.fn === "admin_delete_sample_store");
    expect(deleteCalls.map((c) => c.args.p_store_id)).toEqual([S_SAMPLE]);
    expect(deleteCalls[0]?.args.p_actor).toBe("admin-1");
    const byId = Object.fromEntries((json.results as { store_id: string; outcome: string }[]).map((r) => [r.store_id, r.outcome]));
    expect(byId).toEqual({ [S_SAMPLE]: "deleted", [S_REAL]: "blocked", [S_TEST]: "blocked" });
    // 공유 묶음(shared.l1.*)은 제외, 자기 파일만 원본 기준 삭제
    expect(removeAsset.mock.calls.map((c) => c[0].originalPath)).toEqual([`${S_SAMPLE}/own.l1.webp`]);
    // 매장별 감사 1 + 요약 1
    const actions = audit.mock.calls.map((c) => (c[1] as { action: string }).action);
    expect(actions).toEqual(["store.sample_delete", "store.sample_delete_batch"]);
    expect(bump).toHaveBeenCalledWith("admin_store.sample_delete");
  });

  it("이미 없는 매장은 「이미 삭제됨」 (오류 아님)", async () => {
    previewRows = [{ store_id: S_GONE, exists: false, deletable: false, reasons: ["not_found"] }];
    const token = await previewToken([S_GONE]);
    const res = await POST(req({ mode: "execute", store_ids: [S_GONE], confirm_token: token, reason: "오픈 정리" }));
    const json = await res.json();
    expect(json.results).toEqual([{ store_id: S_GONE, outcome: "already_deleted" }]);
    expect(rpcCalls.some((c) => c.fn === "admin_delete_sample_store")).toBe(false);
  });

  it("같은 client_request_id 재전송은 이전 결과를 돌려주고 다시 실행하지 않는다", async () => {
    priorBatch = { results: [{ store_id: S_SAMPLE, outcome: "deleted" }] };
    const res = await POST(
      req({ mode: "execute", store_ids: [S_SAMPLE], confirm_token: "any", reason: "오픈 정리", client_request_id: "req_abcdefgh1" })
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.duplicate).toBe(true);
    expect(json.results).toEqual([{ store_id: S_SAMPLE, outcome: "deleted" }]);
    expect(rpcCalls).toHaveLength(0);
  });

  it("사유 없이는 실행 불가", async () => {
    const res = await POST(req({ mode: "execute", store_ids: [S_SAMPLE], confirm_token: "x" }));
    expect(res.status).toBe(400);
  });
});
