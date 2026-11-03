import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addPlatformPopupSessionBlockedCampaign,
  clearPlatformPopupSessionBlockedCampaigns,
  isPlatformPopupSessionBlockedCampaign,
} from "@/lib/platform-popup/popup-app-session";

/** 광고 감사 G-6 — × 닫기·CTA 뒤 이 앱 실행 동안 재노출 금지 (DB 숨김 행 없음) */
describe("G-6 popup session block", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("blocks a closed campaign for the session and clears on identity change", () => {
    expect(isPlatformPopupSessionBlockedCampaign("c1")).toBe(false);
    addPlatformPopupSessionBlockedCampaign("c1");
    expect(isPlatformPopupSessionBlockedCampaign("c1")).toBe(true);
    expect(isPlatformPopupSessionBlockedCampaign("c2")).toBe(false);
    clearPlatformPopupSessionBlockedCampaigns();
    expect(isPlatformPopupSessionBlockedCampaign("c1")).toBe(false);
  });

  it("host records the block on × close and on CTA, and drops a blocked winner as EMPTY", () => {
    const host = readFileSync(join(process.cwd(), "components/platform-popup/GlobalPopupHost.tsx"), "utf8");
    const close = host.slice(host.indexOf("const handleClose = useCallback"));
    expect(close.slice(0, 900)).toContain("addPlatformPopupSessionBlockedCampaign(winner.campaignId);");
    expect(host).toMatch(/if \(opened\) \{\s+addPlatformPopupSessionBlockedCampaign\(winner\.campaignId\);/);
    // 재감사 S-1 (P-a): 1위 id 를 먼저 꺼내 세션 차단·깨진 소재를 같이 본다
    expect(host).toMatch(/isPlatformPopupSessionBlockedCampaign\(winnerId\)[\s\S]{0,200}RESOLVE_EMPTY/);
    // DB 숨김은 여전히 빈도 규칙(close_only → CLOSE, 행 없음)
    expect(close.slice(0, 900)).toContain("frequencyModeToDismissSuppressMode(winner.frequencyMode)");
  });
});
