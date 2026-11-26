import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { APP_STORE_BUNDLE_ID } from "@/lib/app-releases/app-release-sources";
import {
  IOS_APP_STORE_BUNDLE_ID,
  IOS_UPDATE_CHECK_COOLDOWN_MS,
  IOS_UPDATE_DEFER_MS,
  IOS_UPDATE_MAX_AUTO_PROMPTS_PER_RUN,
  buildIosAppStoreLookupUrl,
  decideIosUpdatePrompt,
  isIosUpdateCheckDue,
  parseIosAppStoreLookupVersion,
  parseIosUpdateDeferral,
} from "@/lib/platform/ios-app-store-update-policy";

const NOW = 1_764_115_200_000;

describe("iOS App Store 업데이트 안내 정책", () => {
  it("조회 번들 ID 는 서버 수집과 같다", () => {
    expect(IOS_APP_STORE_BUNDLE_ID).toBe(APP_STORE_BUNDLE_ID);
  });

  it("조회 주소는 매번 다른 `_` 값을 붙여 Apple CDN 캐시를 거치지 않는다", () => {
    expect(buildIosAppStoreLookupUrl(NOW)).toBe(
      `https://itunes.apple.com/lookup?bundleId=com.dibay.ph&country=ph&_=${NOW}`
    );
    expect(buildIosAppStoreLookupUrl(NOW + 1)).not.toBe(buildIosAppStoreLookupUrl(NOW));
  });

  it("조회 응답에서 버전 이름만 읽고, 모르면 null", () => {
    expect(parseIosAppStoreLookupVersion({ results: [{ version: "1.2.8" }] })).toBe("1.2.8");
    expect(parseIosAppStoreLookupVersion({ results: [] })).toBeNull();
    expect(parseIosAppStoreLookupVersion({ results: [{ version: "beta" }] })).toBeNull();
    expect(parseIosAppStoreLookupVersion(null)).toBeNull();
  });

  it("설치 버전이 낮으면 안내한다", () => {
    expect(
      decideIosUpdatePrompt({ installedVersion: "1.2.7", latestVersion: "1.2.8", deferral: null, now: NOW, promptsThisRun: 0 })
    ).toEqual({ show: true, latestVersion: "1.2.8" });
    expect(
      decideIosUpdatePrompt({ installedVersion: "1.2.9", latestVersion: "1.2.10", deferral: null, now: NOW, promptsThisRun: 0 })
        .show
    ).toBe(true);
  });

  it("같거나 높으면, 또는 버전을 모르면 안내하지 않는다", () => {
    const base = { deferral: null, now: NOW, promptsThisRun: 0 };
    expect(decideIosUpdatePrompt({ ...base, installedVersion: "1.2.8", latestVersion: "1.2.8" })).toEqual({
      show: false,
      reason: "latest",
    });
    expect(decideIosUpdatePrompt({ ...base, installedVersion: "1.2.9", latestVersion: "1.2.8" }).show).toBe(false);
    expect(decideIosUpdatePrompt({ ...base, installedVersion: null, latestVersion: "1.2.8" })).toEqual({
      show: false,
      reason: "unknown",
    });
    expect(decideIosUpdatePrompt({ ...base, installedVersion: "1.2.7", latestVersion: null })).toEqual({
      show: false,
      reason: "unknown",
    });
  });

  it("「나중에」 한 버전은 24시간 멈추고, 지나거나 더 새 버전이면 다시 안내한다", () => {
    const base = { installedVersion: "1.2.7", latestVersion: "1.2.8", promptsThisRun: 0 };
    const deferral = { version: "1.2.8", at: NOW };
    expect(decideIosUpdatePrompt({ ...base, deferral, now: NOW + 1000 })).toEqual({ show: false, reason: "deferred" });
    expect(decideIosUpdatePrompt({ ...base, deferral, now: NOW + IOS_UPDATE_DEFER_MS }).show).toBe(true);
    expect(decideIosUpdatePrompt({ ...base, latestVersion: "1.2.9", deferral, now: NOW + 1000 }).show).toBe(true);
  });

  it("한 번 실행에서 자동 안내는 최대 2번", () => {
    expect(IOS_UPDATE_MAX_AUTO_PROMPTS_PER_RUN).toBe(2);
    expect(
      decideIosUpdatePrompt({
        installedVersion: "1.2.7",
        latestVersion: "1.2.8",
        deferral: null,
        now: NOW,
        promptsThisRun: 2,
      })
    ).toEqual({ show: false, reason: "prompt_limit" });
  });

  it("깨진 미룸 값은 미룬 적 없음으로 본다", () => {
    expect(parseIosUpdateDeferral(null)).toBeNull();
    expect(parseIosUpdateDeferral("{")).toBeNull();
    expect(parseIosUpdateDeferral(JSON.stringify({ version: 1, at: NOW }))).toBeNull();
    expect(parseIosUpdateDeferral(JSON.stringify({ version: "1.2.8", at: NOW }))).toEqual({ version: "1.2.8", at: NOW });
  });

  it("확인은 30분에 1번", () => {
    expect(isIosUpdateCheckDue(null, NOW)).toBe(true);
    expect(isIosUpdateCheckDue(NOW, NOW + IOS_UPDATE_CHECK_COOLDOWN_MS - 1)).toBe(false);
    expect(isIosUpdateCheckDue(NOW, NOW + IOS_UPDATE_CHECK_COOLDOWN_MS)).toBe(true);
  });
});
