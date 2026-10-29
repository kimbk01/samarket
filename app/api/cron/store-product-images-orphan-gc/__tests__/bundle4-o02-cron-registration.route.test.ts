/**
 * 묶음 4 · O-02 — 고아 이미지 정리 cron: vercel.json 하루 1회 등록 · dry-run 유지(실삭제 env 미설정) ·
 * 결과(후보 수) 로그 + 감사 `store_images.orphan_gc` 1건.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runGc = vi.fn();
const audit = vi.fn(async (..._a: unknown[]) => undefined);

vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => ({}) }));
vi.mock("@/lib/stores/store-product-images-orphan-gc.server", () => ({
  runStoreProductImagesOrphanGc: (...a: unknown[]) => runGc(...a),
}));
vi.mock("@/lib/audit/append-audit-log", () => ({ appendAuditLog: (...a: unknown[]) => audit(...a) }));

import { GET } from "@/app/api/cron/store-product-images-orphan-gc/route";

const req = (auth?: string) =>
  new Request("http://localhost/api/cron/store-product-images-orphan-gc", {
    headers: auth ? { authorization: auth } : {},
  });

const prevSecret = process.env.CRON_SECRET;
const prevDelete = process.env.STORE_PRODUCT_IMAGES_ORPHAN_GC_DELETE_ENABLED;

beforeEach(() => {
  process.env.CRON_SECRET = "s3cret";
  delete process.env.STORE_PRODUCT_IMAGES_ORPHAN_GC_DELETE_ENABLED;
  runGc.mockReset();
  audit.mockClear();
  runGc.mockImplementation(async (input: { dryRun: boolean }) => ({
    ok: true,
    result: {
      dry_run: input.dryRun,
      stores_scanned: 2,
      stores_skipped: 0,
      objects: 10,
      orphans: 3,
      removed: 0,
      remove_failed: 0,
      stores: [
        { store_id: "s1", objects: 6, referenced_kept: 3, young_kept: 0, orphans: 3, orphan_sample: [], removed: 0 },
        { store_id: "s2", objects: 4, referenced_kept: 4, young_kept: 0, orphans: 0, orphan_sample: [], removed: 0 },
      ],
    },
  }));
});
afterEach(() => {
  if (prevSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = prevSecret;
  if (prevDelete === undefined) delete process.env.STORE_PRODUCT_IMAGES_ORPHAN_GC_DELETE_ENABLED;
  else process.env.STORE_PRODUCT_IMAGES_ORPHAN_GC_DELETE_ENABLED = prevDelete;
});

describe("O-02 고아 이미지 cron", () => {
  it("vercel.json crons 에 하루 1회 등록 (UTC 19:30 = 03:30 PHT)", () => {
    const vercel = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
      crons: { path: string; schedule: string }[];
      env?: Record<string, string>;
    };
    const entry = vercel.crons.filter((c) => c.path === "/api/cron/store-product-images-orphan-gc");
    expect(entry).toHaveLength(1);
    expect(entry[0]!.schedule).toBe("30 19 * * *");
    // 실삭제 env 는 vercel.json 에서 켜지 않는다
    expect(vercel.env?.STORE_PRODUCT_IMAGES_ORPHAN_GC_DELETE_ENABLED).toBeUndefined();
  });

  it("인증 없으면 401, 실행 없음", async () => {
    expect((await GET(req())).status).toBe(401);
    expect(runGc).not.toHaveBeenCalled();
  });

  it("기본 dry-run 실행 + 후보 수 감사 1건", async () => {
    const res = await GET(req("Bearer s3cret"));
    const body = (await res.json()) as { dry_run: boolean; orphans: number };
    expect(res.status).toBe(200);
    expect((runGc.mock.calls[0]![0] as { dryRun: boolean }).dryRun).toBe(true);
    expect(body).toMatchObject({ dry_run: true, orphans: 3 });
    expect(audit).toHaveBeenCalledTimes(1);
    const row = audit.mock.calls[0]![1] as { action: string; actor_type: string; after_json: Record<string, unknown> };
    expect(row.action).toBe("store_images.orphan_gc");
    expect(row.actor_type).toBe("system");
    expect(row.after_json).toMatchObject({ dry_run: true, orphans: 3, removed: 0 });
    expect(row.after_json.stores_with_orphans).toEqual([{ store_id: "s1", orphans: 3 }]);
  });
});
