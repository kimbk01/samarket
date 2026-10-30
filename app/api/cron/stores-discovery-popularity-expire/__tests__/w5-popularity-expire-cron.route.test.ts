/**
 * v4 W5 · DB-01 — 인기 집계 만료 cron: vercel.json 매시간 등록 · CRON_SECRET 인증 · 1회 실행 배치 500
 * (운영 밀린 52건을 1회로 처리) · 결과 감사 `stores.discovery_popularity_expire_batch` 1건 (0건 실행은 감사 없음).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const expireBatch = vi.fn();
const audit = vi.fn(async (..._a: unknown[]) => undefined);

vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => ({}) }));
vi.mock("@/lib/stores/discovery/store-order-popularity-projection", () => ({
  expireStoreOrderPopularityProjectionBatch: (...a: unknown[]) => expireBatch(...a),
}));
vi.mock("@/lib/audit/append-audit-log", () => ({ appendAuditLog: (...a: unknown[]) => audit(...a) }));

import { GET, POST } from "@/app/api/cron/stores-discovery-popularity-expire/route";

const PATH = "/api/cron/stores-discovery-popularity-expire";
const req = (headers: Record<string, string> = {}) => new Request(`http://localhost${PATH}`, { headers });

const prevSecret = process.env.CRON_SECRET;

beforeEach(() => {
  process.env.CRON_SECRET = "s3cret";
  expireBatch.mockReset();
  audit.mockClear();
  expireBatch.mockResolvedValue({ expiredCount: 52, storesTouched: 2 });
});
afterEach(() => {
  if (prevSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = prevSecret;
});

describe("W5 DB-01 인기 집계 만료 cron", () => {
  it("vercel.json crons 에 매시간(UTC 정각) 1건 등록", () => {
    const vercel = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
      crons: { path: string; schedule: string }[];
    };
    const entry = vercel.crons.filter((c) => c.path === PATH);
    expect(entry).toHaveLength(1);
    expect(entry[0]!.schedule).toBe("0 * * * *");
  });

  it("CRON_SECRET 미설정이면 503, 실행 없음", async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(req({ authorization: "Bearer s3cret" }))).status).toBe(503);
    expect(expireBatch).not.toHaveBeenCalled();
  });

  it("인증 없음·틀린 비밀이면 401, 실행 없음", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req({ authorization: "Bearer wrong" }))).status).toBe(401);
    expect(expireBatch).not.toHaveBeenCalled();
  });

  it("Bearer·x-cron-secret 인증 시 배치 500 으로 1회 실행 + 감사 1건", async () => {
    const res = await GET(req({ authorization: "Bearer s3cret" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, expiredCount: 52, storesTouched: 2 });
    expect(expireBatch).toHaveBeenCalledTimes(1);
    expect(expireBatch.mock.calls[0]![1]).toEqual({ batchSize: 500 });
    expect(audit).toHaveBeenCalledTimes(1);
    const row = audit.mock.calls[0]![1] as { action: string; actor_type: string; after_json: unknown };
    expect(row.action).toBe("stores.discovery_popularity_expire_batch");
    expect(row.actor_type).toBe("system");
    expect(row.after_json).toEqual({ expiredCount: 52, storesTouched: 2 });

    const res2 = await POST(req({ "x-cron-secret": "s3cret" }));
    expect(res2.status).toBe(200);
  });

  it("만료 0건 실행은 응답 200 · 감사 기록 없음", async () => {
    expireBatch.mockResolvedValue({ expiredCount: 0, storesTouched: 0 });
    const res = await GET(req({ authorization: "Bearer s3cret" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, expiredCount: 0, storesTouched: 0 });
    expect(expireBatch).toHaveBeenCalledTimes(1);
    expect(audit).not.toHaveBeenCalled();
  });
});
