import { describe, expect, it } from "vitest";
import {
  DIBAY_PRODUCTION_SITE_ORIGIN,
  normalizeCapacitorServerUrl,
  resolveCapacitorServerUrlFromEnv,
} from "@/lib/platform/capacitor-server-url";

describe("capacitor-server-url", () => {
  it("strips query and hash from server url", () => {
    expect(normalizeCapacitorServerUrl("https://samarket.vercel.app/?dibay_app=android")).toBe(
      DIBAY_PRODUCTION_SITE_ORIGIN,
    );
  });

  it("defaults to production origin when env unset", () => {
    expect(resolveCapacitorServerUrlFromEnv({})).toBe(DIBAY_PRODUCTION_SITE_ORIGIN);
  });

  it("prefers CAPACITOR_SERVER_URL over NEXT_PUBLIC_SITE_URL", () => {
    expect(
      resolveCapacitorServerUrlFromEnv({
        CAPACITOR_SERVER_URL: "https://preview.example.com",
        NEXT_PUBLIC_SITE_URL: "https://other.example.com",
      }),
    ).toBe("https://preview.example.com");
  });
});
