/**
 * 광고 ② D-9 (2026-11-04) — 커뮤니티 상위노출 만료 cron: 거래와 같은 구조·같은 인증·같은 주기(10분),
 * DB 함수 `community_promotion_orders_expire()` 1회 호출.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
let sbAvailable = true;
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => (sbAvailable ? { rpc: (...a: unknown[]) => rpc(...a) } : null),
}));

import { GET, POST } from "@/app/api/cron/community-promotion-orders-expire/route";

const PATH = "/api/cron/community-promotion-orders-expire";
const req = (headers: Record<string, string> = {}) => new Request(`http://localhost${PATH}`, { headers });
const prevSecret = process.env.CRON_SECRET;

beforeEach(() => {
  process.env.CRON_SECRET = "s3cret";
  sbAvailable = true;
  rpc.mockReset();
  rpc.mockResolvedValue({ data: { ok: true, expired: 4 }, error: null });
});
afterEach(() => {
  if (prevSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = prevSecret;
});

describe("D-9 커뮤니티 상위노출 만료 cron", () => {
  it("vercel.json 에 거래 만료 cron 과 같은 주기로 1건 등록", () => {
    const vercel = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
      crons: { path: string; schedule: string }[];
    };
    const mine = vercel.crons.filter((c) => c.path === PATH);
    const trade = vercel.crons.filter((c) => c.path === "/api/cron/trade-promotion-orders-expire");
    expect(mine).toHaveLength(1);
    expect(trade).toHaveLength(1);
    expect(mine[0]!.schedule).toBe(trade[0]!.schedule);
  });

  it("CRON_SECRET 미설정이면 503, 실행 없음", async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(req({ authorization: "Bearer s3cret" }))).status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("인증 없음·틀린 비밀이면 401, 실행 없음", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req({ authorization: "Bearer wrong" }))).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("인증 시 만료 함수를 1회 부르고 결과를 그대로 돌려준다 (GET·POST)", async () => {
    const res = await GET(req({ authorization: "Bearer s3cret" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, expired: 4 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("community_promotion_orders_expire");
    expect((await POST(req({ "x-cron-secret": "s3cret" }))).status).toBe(200);
  });

  it("DB 함수 오류면 500 · 서비스 클라이언트 없으면 503", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "function does not exist" } });
    expect((await GET(req({ authorization: "Bearer s3cret" }))).status).toBe(500);
    sbAvailable = false;
    expect((await GET(req({ authorization: "Bearer s3cret" }))).status).toBe(503);
  });
});
