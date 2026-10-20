import { describe, expect, it } from "vitest";
import {
  LEGACY_HUB_REDIRECTS,
  resolveMypageSectionLegacyHubRedirect,
} from "@/lib/mypage/mypage-section-legacy-redirect";

/** D5 — 섹션 레거시 리다이렉트가 자기 자신을 가리키면 무한 리다이렉트(ERR_TOO_MANY_REDIRECTS) */
describe("mypage section legacy redirect", () => {
  it.each(Object.entries(LEGACY_HUB_REDIRECTS))("%s → 자기 자신이 아님", (key, target) => {
    const [section, item] = key.split(":");
    const self = `/mypage/section/${section}/${item}`;
    expect(target.split("?")[0]).not.toBe(self);
    // 대상이 또 다른 레거시 키로 다시 돌아오는 2단 순환도 없음
    const m = /^\/mypage\/section\/([^/]+)\/([^/?]+)$/.exec(target.split("?")[0]);
    if (m) expect(resolveMypageSectionLegacyHubRedirect(m[1], m[2])).not.toBe(self);
  });

  it("이전 무한 루프 3곳은 정해진 화면으로 1회 이동", () => {
    expect(resolveMypageSectionLegacyHubRedirect("store", "order-chat")).toBe("/mypage/store-orders");
    expect(resolveMypageSectionLegacyHubRedirect("messenger", "friends")).toBe("/mypage/section/account/favorite-users");
    expect(resolveMypageSectionLegacyHubRedirect("messenger", "chat-alerts")).toBe("/mypage/section/settings/notifications");
  });
});
