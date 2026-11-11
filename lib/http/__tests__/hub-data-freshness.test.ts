import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHubDataRevisitGate, HUB_DATA_REVISIT_FRESH_MS } from "@/lib/http/hub-data-freshness";
import { invalidateAllHubData, peekHubDataEpoch } from "@/lib/http/hub-data-epoch";
import {
  forgetHubRetentionInstance,
  isHubScreenRetainedFresh,
  recordHubRetentionSnapshot,
} from "@/lib/layout/hub-retention-state";

const root = join(__dirname, "../../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("D1 §4 허브 데이터 60초 규칙", () => {
  it("기준 시간은 60초 하나", () => {
    expect(HUB_DATA_REVISIT_FRESH_MS).toBe(60_000);
  });

  it("같은 인스턴스·같은 키·60초 안·같은 세대만 다시 받지 않음", () => {
    let now = 1_000;
    const gate = createHubDataRevisitGate(() => now);
    expect(gate.isFresh("k")).toBe(false); // 새 화면은 언제나 받음
    gate.markLoaded("k");
    now += 59_999;
    expect(gate.isFresh("k")).toBe(true);
    expect(gate.isFresh("other")).toBe(false); // 조건이 바뀌면 받음
    now += 1;
    expect(gate.isFresh("k")).toBe(false); // 60초 지나면 받음
  });

  it("화면 값을 비우면(reset) 60초 안이라도 다시 받음", () => {
    const gate = createHubDataRevisitGate(() => 0);
    gate.markLoaded("all");
    gate.reset();
    expect(gate.isFresh("all")).toBe(false);
    const feed = readFileSync(join(root, "components/community/CommunityFeed.tsx"), "utf8");
    expect(feed).toContain("topAdsRevisitGate.reset()");
    expect(feed).toContain("feedAdPoolRevisitGate.reset()");
  });

  it("배달 「내 매장」(GET /api/me/stores)도 60초 규칙 — 성공 시에만 기록 (D1 R3)", () => {
    const src = readFileSync(join(root, "lib/delivery/launch/use-delivery-store-owner-entry.ts"), "utf8");
    expect(src).toContain("useHubDataRevisitGate()");
    expect(src).toContain('if (revisitGate.isFresh("owner-entry")) return;');
    expect(src).toMatch(/setValue\(\{ entry: [^\n]+\n\s*revisitGate\.markLoaded\("owner-entry"\);/);
  });

  it("커뮤니티 피드 60초 키에 해시태그(?tag=)가 들어간다 — 태그 해제·변경 뒤 이전 목록 유지 금지 (2026-11-12 재감사 FAIL 1)", () => {
    const feed = readFileSync(join(root, "components/community/CommunityFeed.tsx"), "utf8");
    expect(feed).toContain("const feedRevisitKey = `${viewerSig}|${feedContentKey}|${tagFilter}`;");
    expect(feed).toContain("feedRevisitGate.isFresh(feedRevisitKey)");
    expect(feed).toContain("feedRevisitGate.markLoaded(feedRevisitKey)");
    expect(feed).not.toMatch(/feedRevisitGate\.(isFresh|markLoaded)\(`/);
  });

  it("세대가 오르면(글 쓰기·피드 캐시 비우기·앱 복귀·언어 변경) 다시 받음", () => {
    const gate = createHubDataRevisitGate(() => 0);
    gate.markLoaded("k");
    expect(gate.isFresh("k")).toBe(true);
    invalidateAllHubData("test");
    expect(gate.isFresh("k")).toBe(false);
  });

  it("데이터를 바꾸는 쪽(피드·주제 캐시 무효화)은 세대를 올린다", () => {
    expect(read("lib/philife/fetch-neighborhood-feed-short-ttl.ts")).toContain(
      'invalidateAllHubData("neighborhood_feed_invalidated")'
    );
    expect(read("lib/philife/fetch-neighborhood-topic-options-client.ts")).toContain(
      'invalidateAllHubData("topic_options_invalidated")'
    );
    expect(read("lib/community/philife-feed-session-cache.ts")).toContain(
      'invalidateAllHubData("philife_feed_caches_cleared")'
    );
  });

  it("보관 중 허브는 하단 탭 누름 미리 받기를 건너뜀 (숨긴 지 60초 안·같은 세대)", () => {
    const epoch = peekHubDataEpoch();
    recordHubRetentionSnapshot(9001, ["community"], epoch, 10_000);
    expect(isHubScreenRetainedFresh("community", epoch, 60_000, 69_999)).toBe(true);
    expect(isHubScreenRetainedFresh("community", epoch, 60_000, 70_000)).toBe(false);
    expect(isHubScreenRetainedFresh("community", epoch + 1, 60_000, 20_000)).toBe(false);
    expect(isHubScreenRetainedFresh("home", epoch, 60_000, 20_000)).toBe(false);
    forgetHubRetentionInstance(9001);
    expect(isHubScreenRetainedFresh("community", epoch, 60_000, 20_000)).toBe(false);
    expect(read("lib/main-menu/bottom-nav-tap-prewarm-data.ts")).toContain("isHubScreenRetainedFresh(");
  });

  it("주소·프로필 변경은 세대를 올림 (숨긴 허브는 알림을 못 들음)", () => {
    const src = read("lib/http/hub-data-freshness.ts");
    expect(src).toContain('invalidateAllHubData("addresses_updated")');
    expect(src).toContain('invalidateAllHubData("profile_updated")');
  });

  it("허브 재진입 요청부에 규칙 적용", () => {
    for (const p of [
      "components/community/CommunityFeed.tsx",
      "components/home-hub/HomePostsSection.tsx",
      "components/platform-events/EventPromotionHeroBanner.tsx",
      "components/auth/AuthLoginPanel.tsx",
      "components/home-hub/HomeStoresSection.tsx",
      "components/home-hub/HomeTradeRow.tsx",
      "components/stores/home/hub/StoresHomeHub.tsx",
      "components/stores/home/hub/StoresHomeHeroBanner.tsx",
      "components/stores/home/hub/StoresHomeBeforeRestBanner.tsx",
      "lib/stores/use-browse-featured-items-hydration.ts",
    ]) {
      expect(read(p)).toContain("useHubDataRevisitGate()");
    }
  });
});
