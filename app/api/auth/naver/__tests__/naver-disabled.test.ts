import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const listUsers = vi.fn();
const updateUserById = vi.fn();
const createUser = vi.fn();

vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => ({
    auth: { admin: { listUsers, updateUserById, createUser } },
    from: vi.fn(),
  }),
}));

/** P0-1 — Naver 비활성: 410 · 계정 조회/변경 없음 */
describe("Naver login disabled (P0-1)", () => {
  it("start returns 410 naver_login_disabled", async () => {
    const { GET } = await import("@/app/api/auth/naver/start/route");
    const res = GET();
    expect(res.status).toBe(410);
    expect((await res.json()).errorCode).toBe("naver_login_disabled");
  });

  it("callback returns 410 without touching auth.users", async () => {
    const { GET } = await import("@/app/api/auth/naver/callback/route");
    const res = GET();
    expect(res.status).toBe(410);
    expect((await res.json()).errorCode).toBe("naver_login_disabled");
    expect(listUsers).not.toHaveBeenCalled();
    expect(updateUserById).not.toHaveBeenCalled();
    expect(createUser).not.toHaveBeenCalled();
  });

  it("route sources have no email-reuse / password / profile overwrite path", () => {
    for (const rel of ["app/api/auth/naver/start/route.ts", "app/api/auth/naver/callback/route.ts"]) {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      expect(src, rel).not.toMatch(/findAuthUserByEmail|updateUserById|signInWithPassword|from\("profiles"\)/);
    }
    const helper = readFileSync(join(process.cwd(), "lib/auth/naver-oauth.ts"), "utf8");
    expect(helper).not.toMatch(/buildNaverSupabasePassword|requestNaverToken|fetchNaverProfile/);
  });
});
