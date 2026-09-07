import { describe, expect, it } from "vitest";
import { resolveOperationsPrimaryCta } from "@/lib/admin/ads-exposure/operations-primary-cta";
import {
  formatActualPlacement,
  formatRequestedPlacement,
} from "@/lib/admin/ads-exposure/canonical-location-period";
import { adsShellKindLabel } from "@/lib/admin/ads-exposure/shell-row";
import { adsLiveRouteHref, adsBoostExactTargetHref, adsLiveLinkLabel } from "@/lib/admin/ads-exposure/live-route";

describe("CUT R4 operations primary CTA", () => {
  it("live with liveHref → 실제 노출 보기 (not pause)", () => {
    const cta = resolveOperationsPrimaryCta({
      statusTab: "live",
      domain: "delivery",
      liveHref: "/stores",
      href: "/admin/delivery-ads/manage/1",
      waitingReasonLabel: null,
      runtimeExposureStatusLabel: "현재 노출",
    });
    expect(cta.kind).toBe("view_live");
    expect(cta.href).toBe("/stores");
    expect(cta.mutation).toBeFalsy();
  });

  it("waiting → 대기 이유 보기", () => {
    const cta = resolveOperationsPrimaryCta({
      statusTab: "waiting",
      domain: "popup",
      liveHref: null,
      href: "/admin/platform-popup/1",
      waitingReasonLabel: "다른 팝업이 우선",
      runtimeExposureStatusLabel: "노출 대기",
    });
    expect(cta.kind).toBe("waiting_reason");
    expect(cta.selectDetail).toBe(true);
  });

  it("boost live → 제재; boost paused → 재개", () => {
    const sanction = resolveOperationsPrimaryCta({
      statusTab: "live",
      domain: "community_promote",
      liveHref: "/philife",
      href: "/admin/x",
      waitingReasonLabel: null,
      runtimeExposureStatusLabel: "현재 노출",
    });
    expect(sanction.kind).toBe("sanction");
    expect(sanction.mutation).toBe("pause");

    const resume = resolveOperationsPrimaryCta({
      statusTab: "paused",
      domain: "trade_promote",
      liveHref: null,
      href: "/admin/x",
      waitingReasonLabel: null,
      runtimeExposureStatusLabel: "제재 중",
    });
    expect(resume.kind).toBe("resume");
    expect(resume.mutation).toBe("resume");
  });

  it("paused non-boost → 재개", () => {
    const cta = resolveOperationsPrimaryCta({
      statusTab: "paused",
      domain: "delivery",
      liveHref: null,
      href: "/admin/delivery-ads/manage/1",
      waitingReasonLabel: null,
      runtimeExposureStatusLabel: "비노출",
    });
    expect(cta.kind).toBe("resume");
    expect(cta.mutation).toBe("resume");
  });
});

describe("CUT R4 placement / labels / live links", () => {
  it("Delivery Hero actual uses Slide N not Slot", () => {
    const act = formatActualPlacement({
      kind: "delivery_banner",
      ko: true,
      inventoryKey: "STORES_HOME_HERO",
      slotIndex: 2,
    });
    expect(act).toContain("Slide 2");
    expect(act).not.toMatch(/Slot/);
  });

  it("Delivery without inventory → 아직 배정되지 않음", () => {
    expect(
      formatActualPlacement({
        kind: "delivery_banner",
        ko: true,
        inventoryKey: null,
        slotIndex: null,
      })
    ).toBe("아직 배정되지 않음");
  });

  it("Feed banner uses human home feed labels", () => {
    expect(
      formatRequestedPlacement({
        kind: "feed_banner",
        ko: true,
        inventoryKey: "COMMUNITY_HOME",
        feedDomain: "community",
      })
    ).toContain("Community");
    expect(
      formatRequestedPlacement({
        kind: "feed_banner",
        ko: true,
        inventoryKey: "TRADE_HOME",
        feedDomain: "trade",
      })
    ).toMatch(/거래/);
  });

  it("kind labels match R4 domain/product matrix", () => {
    expect(adsShellKindLabel("community_promote", "boost", true)).toBe(
      "[Community] 게시물 상위노출"
    );
    expect(adsShellKindLabel("trade_promote", "boost", true)).toBe("[거래] 게시물 상위노출");
    expect(adsShellKindLabel("popup", "platform_popup", true)).toBe("[Platform] Popup");
    expect(adsShellKindLabel("feed", "feed_banner_community", true)).toBe("[Community] 배너");
  });

  it("boost domains do not claim domain-root as exact live href", () => {
    expect(
      adsLiveRouteHref({ productKind: "boost", domain: "community_promote", placementKey: null })
    ).toBeNull();
    expect(
      adsLiveRouteHref({ productKind: "boost", domain: "trade_promote", placementKey: null })
    ).toBeNull();
  });

  it("boost exact post target is labeled 실제 노출 보기", () => {
    const href = adsBoostExactTargetHref({ domain: "trade_promote", targetId: "post-1" });
    expect(href).toBe("/post/post-1");
    const label = adsLiveLinkLabel({ href, domain: "trade_promote", ko: true });
    expect(label?.exact).toBe(true);
    expect(label?.labelKo).toBe("실제 노출 보기");
  });

  it("boost domain root must not use 실제 노출 보기 label", () => {
    const label = adsLiveLinkLabel({ href: "/philife", domain: "community_promote", ko: true });
    expect(label?.exact).toBe(false);
    expect(label?.labelKo).not.toBe("실제 노출 보기");
  });
});
