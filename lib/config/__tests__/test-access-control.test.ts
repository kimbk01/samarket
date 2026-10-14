import { describe, expect, it } from "vitest";
import {
  evaluateTestAccess,
  isMiswiredNonProductionOnProductionDb,
  isTestRuntimeSurface,
} from "@/lib/config/test-access-control";

const PROD_URL = "https://ckdosyydvgzqwpbwuhon.supabase.co";
const TEST_URL = "https://abcdefghijklmnopqrst.supabase.co";

describe("test-access-control", () => {
  it("detects miswired preview on production DB", () => {
    expect(
      isMiswiredNonProductionOnProductionDb({
        VERCEL_ENV: "preview",
        NEXT_PUBLIC_SUPABASE_URL: PROD_URL,
        NODE_ENV: "production",
      })
    ).toBe(true);
  });

  it("treats isolated staging+test DB as TEST surface", () => {
    expect(
      isTestRuntimeSurface({
        VERCEL_ENV: "preview",
        NEXT_PUBLIC_SUPABASE_URL: TEST_URL,
        NODE_ENV: "production",
      })
    ).toBe(true);
  });

  it("treats Vercel custom TARGET_ENV=test as TEST surface", () => {
    expect(
      isTestRuntimeSurface({
        VERCEL_ENV: "preview",
        VERCEL_TARGET_ENV: "test",
        NEXT_PUBLIC_SUPABASE_URL: TEST_URL,
        NODE_ENV: "production",
      })
    ).toBe(true);
  });

  it("denies when TEST allowlist empty", () => {
    const d = evaluateTestAccess({
      userId: "u1",
      env: {
        NEXT_PUBLIC_DIBAY_RUNTIME_SURFACE: "test",
        NEXT_PUBLIC_SUPABASE_URL: TEST_URL,
      },
    });
    expect(d.required).toBe(true);
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("test_allowlist_empty");
  });

  it("allows allowlisted user id on TEST surface", () => {
    const d = evaluateTestAccess({
      userId: "AaBb",
      env: {
        NEXT_PUBLIC_DIBAY_RUNTIME_SURFACE: "test",
        DIBAY_TEST_ALLOWED_USER_IDS: "aabb,other",
      },
    });
    expect(d.allowed).toBe(true);
  });
});
