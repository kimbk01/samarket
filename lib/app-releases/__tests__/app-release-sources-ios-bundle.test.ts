import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { APP_STORE_BUNDLE_ID, collectAppStoreRelease } from "@/lib/app-releases/app-release-sources";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App Store 출시 조회 — iOS 번들 ID", () => {
  it("iOS 프로젝트의 PRODUCT_BUNDLE_IDENTIFIER 와 같다 (Android 패키지명 아님)", () => {
    const pbx = readFileSync(resolve(process.cwd(), "ios/App/App.xcodeproj/project.pbxproj"), "utf8");
    const ids = [...pbx.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map((m) => m[1].trim());
    expect(ids).toContain(APP_STORE_BUNDLE_ID);
    expect(APP_STORE_BUNDLE_ID).not.toBe("com.dibay.app");
  });

  it("iTunes 조회 주소에 iOS 번들 ID 를 쓴다", async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      new Response(
        JSON.stringify({
          results: [
            {
              version: "1.2.3",
              currentVersionReleaseDate: "2026-11-16T18:37:45Z",
              trackViewUrl: "https://apps.apple.com/ph/app/id6831952401",
            },
          ],
        })
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await collectAppStoreRelease();
    expect(String(fetchMock.mock.calls[0][0])).toContain(`bundleId=${APP_STORE_BUNDLE_ID}&`);
    expect(out).toEqual([
      expect.objectContaining({ platform: "ios", version_name: "1.2.3", source: "itunes_lookup" }),
    ]);
  });
});
