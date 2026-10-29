import { describe, expect, it } from "vitest";
import {
  mapDeliveryBanner,
  mapFeedCampaign,
  mapMypageBanner,
  mapPromotionBanner,
  sortBannerOverviewRows,
} from "@/lib/admin/banners-overview/banner-overview-model";

const NOW = Date.parse("2026-10-30T04:00:00Z");

describe("배너 현황 읽기 모델 (감사 AD-02 · N-01)", () => {
  it("마이페이지 배너: 상태값 + 기간으로 운영 상태", () => {
    const base = { id: "m1", title: "t" };
    expect(mapMypageBanner({ ...base, status: "draft" }, NOW).status).toBe("DRAFT");
    expect(mapMypageBanner({ ...base, status: "hidden" }, NOW).status).toBe("PAUSED");
    expect(mapMypageBanner({ ...base, status: "active" }, NOW).status).toBe("ACTIVE");
    expect(mapMypageBanner({ ...base, status: "active", endAt: "2026-10-01T00:00:00Z" }, NOW).status).toBe("ENDED");
    expect(mapMypageBanner({ ...base, status: "active", startAt: "2026-11-01T00:00:00Z" }, NOW).status).toBe("SCHEDULED");
    const row = mapMypageBanner({ ...base, status: "active" }, NOW);
    expect(row.editHref).toBe("/admin/my/banners/m1/edit");
    expect(row.domain).toBe("common");
  });

  it("피드 배너: active 인데 종료 시각이 지나면 종료 (N-01), 종료는 수정 불가", () => {
    const c = {
      id: "f1",
      name: "n",
      domain: "trade",
      placement: "TRADE_HOME",
      status: "active",
      startAt: "2026-09-01T00:00:00Z",
      endAt: "2026-09-20T00:00:00Z",
    };
    expect(mapFeedCampaign(c, NOW).status).toBe("ENDED");
    expect(mapFeedCampaign({ ...c, endAt: null }, NOW).status).toBe("ACTIVE");
    expect(mapFeedCampaign({ ...c, status: "paused" }, NOW).status).toBe("PAUSED");
    const ended = mapFeedCampaign({ ...c, status: "ended" }, NOW);
    expect(ended.editable).toBe(false);
    expect(mapFeedCampaign({ ...c, endAt: null }, NOW).editHref).toBe("/admin/feed-ads/f1/edit");
    expect(mapFeedCampaign({ ...c, domain: "community", placement: "COMMUNITY_HOME" }, NOW).domain).toBe("community");
  });

  it("프로모션 배너: 기존 배포 상태 판정 재사용, 수정은 이벤트 노출 설정", () => {
    const r = mapPromotionBanner(
      {
        distributionId: "d1",
        eventId: "e1",
        eventTitle: "E",
        placement: "COMMUNITY_HOME",
        presentation: "HERO_BANNER",
        status: "disabled",
        enabled: false,
        startsAt: null,
        endsAt: null,
        thumbUrl: null,
      },
      NOW
    );
    expect(r.status).toBe("PAUSED");
    expect(r.domain).toBe("community");
    expect(r.editHref).toBe("/admin/platform-events/e1#distribution");
  });

  it("배달 홈 배너: 목록 버킷 → 운영 상태", () => {
    const d = {
      id: "b1",
      title: null,
      headline: "H",
      storeName: "S",
      imageUrl: null,
      ctaHref: null,
      startAt: "2026-10-01T00:00:00Z",
      endAt: "2026-12-01T00:00:00Z",
      listBucket: "active",
      inventoryKeys: [],
      updatedAt: "2026-10-01T00:00:00Z",
    };
    expect(mapDeliveryBanner(d, NOW).status).toBe("ACTIVE");
    expect(mapDeliveryBanner({ ...d, listBucket: "ended" }, NOW).status).toBe("ENDED");
    expect(mapDeliveryBanner({ ...d, listBucket: "held" }, NOW).status).toBe("PAUSED");
    expect(mapDeliveryBanner({ ...d, listBucket: "review" }, NOW).status).toBe("DRAFT");
    expect(mapDeliveryBanner(d, NOW).title).toBe("H");
  });

  it("정렬: 노출 중 → 예약 → 중지 → 초안 → 종료", () => {
    const rows = [
      mapMypageBanner({ id: "a", title: "a", status: "draft" }, NOW),
      mapMypageBanner({ id: "b", title: "b", status: "expired" }, NOW),
      mapMypageBanner({ id: "c", title: "c", status: "active" }, NOW),
      mapMypageBanner({ id: "d", title: "d", status: "hidden" }, NOW),
    ];
    expect(sortBannerOverviewRows(rows).map((r) => r.status)).toEqual(["ACTIVE", "PAUSED", "DRAFT", "ENDED"]);
  });
});
