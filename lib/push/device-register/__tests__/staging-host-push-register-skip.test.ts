import { describe, expect, it } from "vitest";
import { stagingHostPushRegisterSkip } from "@/lib/push/device-register/staging-host-push-register-skip";

function req(host: string, forwarded?: string): Request {
  const headers = new Headers({ host });
  if (forwarded) headers.set("x-forwarded-host", forwarded);
  return new Request(`https://${host}/api/me/devices/register`, { method: "POST", headers });
}

describe("스테이징 주소 푸시 등록 — 저장 안 함", () => {
  it("운영 주소는 그대로 진행(null)", () => {
    expect(stagingHostPushRegisterSkip(req("samarket.vercel.app"))).toBeNull();
    expect(stagingHostPushRegisterSkip(req("localhost:3000"))).toBeNull();
  });

  it("스테이징 주소는 저장 없이 성공(skipped)", async () => {
    const res = stagingHostPushRegisterSkip(req("samarket-git-main-kimbk01s-projects.vercel.app"));
    expect(res).not.toBeNull();
    expect(res?.status).toBe(200);
    expect(await res?.json()).toEqual({ ok: true, skipped: "staging_host" });
  });

  it("x-forwarded-host 를 우선한다", () => {
    expect(
      stagingHostPushRegisterSkip(req("internal", "samarket-abc123-kimbk01s-projects.vercel.app"))
    ).not.toBeNull();
    expect(stagingHostPushRegisterSkip(req("internal", "samarket.vercel.app"))).toBeNull();
  });

  it("개발 DB(운영 아님)를 쓰는 개발 서버 주소는 등록을 막지 않는다", () => {
    const devEnv = { NEXT_PUBLIC_SUPABASE_URL: "https://tcwnueuzuxftyomttdyu.supabase.co" } as NodeJS.ProcessEnv;
    expect(stagingHostPushRegisterSkip(req("samarket-env-test-kimbk01s-projects.vercel.app"), devEnv)).toBeNull();
  });

  it("운영 DB 를 쓰는 스테이징 주소는 계속 막는다", () => {
    const prodEnv = { NEXT_PUBLIC_SUPABASE_URL: "https://ckdosyydvgzqwpbwuhon.supabase.co" } as NodeJS.ProcessEnv;
    expect(stagingHostPushRegisterSkip(req("samarket-git-main-kimbk01s-projects.vercel.app"), prodEnv)).not.toBeNull();
  });

  it("DB 를 알 수 없으면 막는다 (fail-closed)", () => {
    expect(stagingHostPushRegisterSkip(req("samarket-env-test-kimbk01s-projects.vercel.app"), {} as NodeJS.ProcessEnv)).not.toBeNull();
    const customDomain = { NEXT_PUBLIC_SUPABASE_URL: "https://db.example.com" } as NodeJS.ProcessEnv;
    expect(stagingHostPushRegisterSkip(req("samarket-env-test-kimbk01s-projects.vercel.app"), customDomain)).not.toBeNull();
  });

  it("운영 주소는 DB 와 무관하게 그대로 진행", () => {
    const devEnv = { NEXT_PUBLIC_SUPABASE_URL: "https://tcwnueuzuxftyomttdyu.supabase.co" } as NodeJS.ProcessEnv;
    expect(stagingHostPushRegisterSkip(req("samarket.vercel.app"), devEnv)).toBeNull();
  });

  it("두 등록 경로가 인증 직후 이 검사를 호출한다", async () => {
    const { readFileSync } = await import("node:fs");
    for (const p of ["app/api/me/devices/register/route.ts", "app/api/me/push/subscribe/route.ts"]) {
      const src = readFileSync(p, "utf8");
      const authAt = src.indexOf("if (!auth.ok) return auth.response;");
      const skipAt = src.indexOf("stagingHostPushRegisterSkip(req)");
      expect(authAt).toBeGreaterThan(-1);
      expect(skipAt).toBeGreaterThan(authAt);
      expect(skipAt).toBeLessThan(src.indexOf("enforceRateLimit({"));
    }
  });
});
