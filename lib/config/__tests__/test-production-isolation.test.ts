import { describe, expect, it } from "vitest";
import {
  DIBAY_PRODUCTION_APP_ID,
  DIBAY_TEST_APP_ID,
  DIBAY_TEST_APP_NAME,
  evaluateSideEffectDispatchGate,
  resolveServerDeployTier,
} from "@/lib/config/test-production-isolation";

const PROD_URL = "https://ckdosyydvgzqwpbwuhon.supabase.co";
const TEST_URL = "https://abcdefghijklmnopqrst.supabase.co";

describe("test-production-isolation SSOT", () => {
  it("locks TEST app identity", () => {
    expect(DIBAY_TEST_APP_ID).toBe("com.dibay.app.test");
    expect(DIBAY_TEST_APP_NAME).toBe("DIBAY TEST");
    expect(DIBAY_PRODUCTION_APP_ID).toBe("com.dibay.app");
    expect(DIBAY_TEST_APP_ID).not.toBe(DIBAY_PRODUCTION_APP_ID);
  });

  it("maps VERCEL_ENV preview to staging tier", () => {
    expect(
      resolveServerDeployTier({
        VERCEL_ENV: "preview",
      })
    ).toBe("staging");
  });

  it("allows production deploy on production DB", () => {
    const d = evaluateSideEffectDispatchGate({
      VERCEL_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: PROD_URL,
      NODE_ENV: "production",
    });
    expect(d.allowed).toBe(true);
    expect(d.reason).toBe("production_deploy");
  });

  it("denies preview/staging deploy on production DB", () => {
    const d = evaluateSideEffectDispatchGate({
      VERCEL_ENV: "preview",
      NEXT_PUBLIC_SUPABASE_URL: PROD_URL,
      NODE_ENV: "production",
    });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("non_production_deploy_production_database");
  });

  it("allows staging deploy on isolated TEST DB", () => {
    const d = evaluateSideEffectDispatchGate({
      VERCEL_ENV: "preview",
      NEXT_PUBLIC_SUPABASE_URL: TEST_URL,
      NODE_ENV: "production",
    });
    expect(d.allowed).toBe(true);
    expect(d.reason).toBe("isolated_non_production_database");
  });

  it("denies production deploy wired to non-production DB", () => {
    const d = evaluateSideEffectDispatchGate({
      VERCEL_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: TEST_URL,
      NODE_ENV: "production",
    });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("production_deploy_non_production_database");
  });

  it("allows vitest without supabase URL (unit-test compatibility)", () => {
    const d = evaluateSideEffectDispatchGate({
      VITEST: "true",
      NODE_ENV: "test",
    });
    expect(d.allowed).toBe(true);
    expect(d.reason).toBe("vitest_runner_without_explicit_production_database");
  });

  it("still denies vitest when Production DB URL is explicit on local tier", () => {
    const d = evaluateSideEffectDispatchGate({
      VITEST: "true",
      NODE_ENV: "test",
      NEXT_PUBLIC_APP_DEPLOY_TIER: "local",
      NEXT_PUBLIC_SUPABASE_URL: PROD_URL,
    });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("non_production_deploy_production_database");
  });
});
