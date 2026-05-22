import { describe, expect, it } from "vitest";
import { resolveSupabaseQueryFailure } from "@/lib/supabase/format-supabase-client-error";

describe("resolveSupabaseQueryFailure", () => {
  it("maps ENOTFOUND to supabase_dns_enotfound", () => {
    const r = resolveSupabaseQueryFailure({
      message: "TypeError: fetch failed",
      details: "Error: getaddrinfo ENOTFOUND example.supabase.co",
    });
    expect(r.isNetworkFailure).toBe(true);
    expect(r.errorCode).toBe("supabase_dns_enotfound");
    expect(r.logLine).toContain("NEXT_PUBLIC_SUPABASE_URL");
  });

  it("stringifies postgrest column errors", () => {
    const r = resolveSupabaseQueryFailure({
      code: "42703",
      message: "column stores.foo does not exist",
    });
    expect(r.isNetworkFailure).toBe(false);
    expect(r.errorCode).toContain("does not exist");
    expect(r.logLine).toContain("message=");
  });
});
