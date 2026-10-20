import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fetchPhoneVerificationJson, fetchPhoneVerificationSettings } from "@/lib/mypage/load-phone-verification-state";

const root = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("R7 — single-flight shares parsed JSON, not a one-shot Response", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("phone verification: concurrent callers → 1 request, both get the body", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ ok: true, verification: { settings: { enabled: true, provider: "semaphore" } } }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    );
    vi.stubGlobal("fetch", fetchMock);
    const [a, b, c] = await Promise.all([
      fetchPhoneVerificationJson(),
      fetchPhoneVerificationJson(),
      fetchPhoneVerificationSettings(),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a.json?.ok).toBe(true);
    expect(b.json?.ok).toBe(true);
    expect(c?.provider).toBe("semaphore");
  });

  it("callers of shared flight keys no longer read a shared Response body", () => {
    for (const rel of [
      "components/my/PhoneVerificationRequestForm.tsx",
      "components/my/edit/ProfileEditForm.tsx",
      "components/mypage/required/RequiredInfoFlowClient.tsx",
    ]) {
      const src = read(rel);
      expect(src).toContain("fetchPhoneVerificationJson()");
      expect(src).not.toContain('"me:phone-verification:get"');
    }
    expect(read("components/my/settings/NativePushSettingsRow.tsx")).toContain(
      'runSingleFlight("me:devices:status:get", async (): Promise<DeviceStatusRes> =>'
    );
    expect(read("components/mypage/tabs/CommunityTab.tsx")).toContain("return res.ok && json.ok && Array.isArray(json.posts)");
    expect(read("hooks/usePromotionOrderTargets.ts")).not.toContain("await postsRes.json()");
    expect(read("components/offers/OfferStatusBuyer.tsx")).not.toMatch(/const res = await runSingleFlight/);
    expect(read("components/offers/useMyPriceOffersForProduct.ts")).not.toMatch(/const res = await runSingleFlight/);
  });

  it("dead My Info rows removed (0 imports)", () => {
    for (const rel of [
      "components/my/settings/SettingsRow.tsx",
      "components/my/settings/SettingsValueRow.tsx",
      "components/my/settings/SettingsDangerRow.tsx",
      "components/mypage/activity/MypageActivityListState.tsx",
      "components/ads/MyPostAdList.tsx",
    ]) {
      expect(existsSync(join(root, rel))).toBe(false);
    }
    // 메신저가 쓰는 토글 행은 유지
    expect(existsSync(join(root, "components/my/settings/SettingsToggleRow.tsx"))).toBe(true);
  });

  it("admin code may not import My Info ds components (eslint rule present)", () => {
    const cfg = read("eslint.config.mjs");
    expect(cfg).toContain('"@/components/mypage/ds/*"');
    expect(cfg).toContain('"components/admin/**/*.{ts,tsx}"');
  });
});
