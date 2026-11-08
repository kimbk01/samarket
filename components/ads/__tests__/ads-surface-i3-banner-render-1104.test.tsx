// @vitest-environment jsdom
/**
 * 광고 표면 연동 I3 (Owner 「감사해서 구현해라」 2026-11-04) — 배너 화면 렌더 시험.
 * FA-1·FA-2·FA-4·FA-5 피드 생성 화면 · CX-14 피드 손으로 넘기기 · CX-12 배달 미리보기 = 고객 화면 ·
 * DL-2 배달 히어로 자동 넘김 멈춤 · MY-1·MY-2 마이 배너 폼 · CX-16 이벤트 편집 날짜 PHT
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** 날짜 시험은 PHT 가 아닌 기기 시간대에서 돌린다 — 옛 코드(브라우저 시간대 변환)는 여기서 틀린 값을 낸다 */
vi.hoisted(() => {
  process.env.TZ = "America/New_York";
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/feed-ads/new",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/i18n/AppLanguageProvider", async () => {
  /** 언어 SSOT S6: 대체 문구 대신 실제 카탈로그 값(ko)으로 렌더 — 화면과 같은 문구를 확인한다 */
  const { safeTranslate } = await import("@/lib/i18n/safe-translate");
  const value = {
    language: "ko",
    t: (k: string, p?: { n?: number }) => (k === "ui_home_feed_ad_label" ? "광고" : p?.n != null ? `${k}:${p.n}` : k),
    safeT: (k: string, o?: Parameters<typeof safeTranslate>[2]) => safeTranslate("ko", k as never, o),
    tt: (s: string) => s,
  };
  return { useI18n: () => value };
});
vi.mock("@/components/common/SamarketThumbnail", () => ({
  SamarketThumbnail: ({ src, alt }: { src: string; alt: string }) => <span data-thumb={src} data-alt={alt} />,
}));
vi.mock("@/components/destination/DestinationLink", () => ({
  DestinationLink: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/lib/ads/feed-ad-event-client", () => ({
  FEED_AD_IMPRESSION_DWELL_MS: 1000,
  FEED_AD_IMPRESSION_MIN_RATIO: 0.5,
  feedAdCreativeIdOfSlide: (id: string) => id,
  sendFeedAdEvent: () => {},
}));
vi.mock("@/lib/platform-promotion-lifecycle/client-record-content-visit", () => ({
  recordPromotionContentVisitClient: () => {},
}));
vi.mock("@/components/stores/advertising/useDeliveryAdEvents", () => ({
  reportDeliveryAdClick: () => {},
  useDeliveryAdImpressionObserver: () => {},
}));
const access = { allowed: true, loading: false, reason: null as string | null };
vi.mock("@/components/admin/access/use-admin-route-access", () => ({
  useAdminRouteAction: () => access,
  useAdminWriteGuard: () => ({ ...access, guard: () => true }),
}));
const confirmAdminAction = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/admin/operator-ux/admin-confirm-action", () => ({
  confirmAdminAction: (...a: unknown[]) => confirmAdminAction(...(a as [])),
}));
const heroBanners = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock("@/lib/stores/stores-home-banners-client", () => ({
  peekStoresHomeBannersClientCache: () => ({ banners: heroBanners.list }),
  fetchStoresHomeBannersDeduped: async () => ({ banners: heroBanners.list }),
}));

import { FeedAdBannerCarousel, FeedAdFramePreview } from "@/components/ads/FeedAdBannerCarousel";
import type { FeedAdPublicCampaign } from "@/lib/ads/feed-ad-public-projection";
import { DeliveryAdBanner } from "@/components/stores/advertising/DeliveryAdBanner";
import { inventoryViewFromKey } from "@/lib/stores/advertising/delivery-ad-banner-contract";
import { DELIVERY_AD_CUSTOMER_AD_TAG_CLASS } from "@/lib/stores/advertising/delivery-ad-design-board-contract";
import { StoresHomeHeroBanner } from "@/components/stores/home/hub/StoresHomeHeroBanner";
import { AdminBannerForm } from "@/components/admin/banners/AdminBannerForm";
import { AdminFeedAdCreatePage } from "@/components/admin/ads/AdminFeedAdCreatePage";
import { fromLocalInput, toLocalInput } from "@/components/admin/platform-events/AdminPlatformEventEditorClient";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function render(node: ReactNode) {
  await act(async () => {
    root.render(node);
  });
}

function touch(el: Element, type: "touchstart" | "touchend", clientX: number) {
  const ev = new Event(type, { bubbles: true }) as Event & { changedTouches: unknown };
  Object.defineProperty(ev, "changedTouches", { value: [{ clientX }] });
  el.dispatchEvent(ev);
}

function setInput(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}

const pub = (id: string, advertiserName: string): FeedAdPublicCampaign => ({
  id,
  placement: "TRADE_HOME",
  advertiserName,
  destinationType: "internal_page",
  destinationId: "",
  destinationUrl: "/market",
  slides: [
    {
      id: `s-${id}`,
      sortOrder: 1,
      imageUrl: `https://cdn.example.com/${id}.png`,
      altText: "",
      headline: "",
      description: "",
      ctaLabel: "",
      destinationType: null,
      destinationId: "",
      destinationUrl: "",
    },
  ],
});

describe("FA-5 피드 미리보기 머리줄 = 고객 화면", () => {
  it("거래: 광고주 이름 + 「광고」 (고객 캐러셀과 같은 머리줄)", async () => {
    await render(<FeedAdFramePreview density="trade" imageUrl="https://x/a.png" advertiserName="철수네 가게" />);
    const head = container.querySelector("[data-feed-ad-advertiser]")!;
    expect(head.textContent).toContain("철수네 가게");
    expect(head.textContent).toContain("광고");
  });
  it("커뮤니티: 이름 + 「광고」 칩 · 이름 없으면 「광고」만", async () => {
    await render(<FeedAdFramePreview density="community" imageUrl="https://x/a.png" advertiserName="꽃집" />);
    expect(container.querySelector("[data-feed-ad-advertiser-name]")?.textContent).toBe("꽃집");
    await render(<FeedAdFramePreview density="community" imageUrl="https://x/a.png" />);
    expect(container.querySelector("[data-feed-ad-advertiser-name]")).toBeNull();
    expect(container.querySelector("[data-feed-ad-advertiser]")?.textContent).toBe("광고");
  });
});

describe("CX-14 피드 배너 손으로 넘기기 (40px)", () => {
  const selected = () =>
    [...container.querySelectorAll("[data-feed-ad-dot]")].findIndex((b) => b.getAttribute("aria-selected") === "true");

  it("왼쪽으로 40px 이상 → 다음 · 오른쪽 → 이전 · 39px 은 그대로", async () => {
    await render(
      <ul>
        <FeedAdBannerCarousel domain="trade" placement="TRADE_HOME" campaignPool={[pub("a", "A"), pub("b", "B"), pub("c", "C")]} />
      </ul>
    );
    const media = container.querySelector("[data-feed-ad-media]")!;
    expect(media.getAttribute("data-feed-ad-swipe")).toBe("1");
    expect(selected()).toBe(0);
    await act(async () => {
      touch(media, "touchstart", 200);
      touch(media, "touchend", 161);
    });
    expect(selected()).toBe(0);
    await act(async () => {
      touch(media, "touchstart", 200);
      touch(media, "touchend", 150);
    });
    expect(selected()).toBe(1);
    await act(async () => {
      touch(media, "touchstart", 100);
      touch(media, "touchend", 200);
    });
    expect(selected()).toBe(0);
  });
});

describe("CX-12 배달 배너 미리보기 = 고객 화면", () => {
  it("어드민 미리보기에 CTA 칩 없음 · 「광고」 표기 클래스가 고객 화면과 같다", async () => {
    const inventory = inventoryViewFromKey("STORES_SEARCH_TOP");
    await render(
      <DeliveryAdBanner
        inventory={inventory}
        creative={{ assetUrl: "https://x/a.png", headline: "", subcopy: "" }}
        destination={{ href: "", ctaLabel: "지금 주문" }}
        adLabel="광고"
        renderContext="admin_preview"
        campaignId="p"
      />
    );
    expect(container.textContent).not.toContain("지금 주문");
    const previewLabel = container.querySelector("[data-delivery-ad-label]")!.className;
    await render(
      <DeliveryAdBanner
        inventory={inventory}
        creative={{ assetUrl: "https://x/a.png" }}
        destination={{ href: "" }}
        adLabel="광고"
        renderContext="customer"
        campaignId="p"
        exposureToken="t"
      />
    );
    const customerLabel = container.querySelector("[data-delivery-ad-label]")!.className;
    expect(previewLabel).toBe(customerLabel);
    expect(customerLabel).toContain(DELIVERY_AD_CUSTOMER_AD_TAG_CLASS);
  });
});

describe("DL-2 배달 히어로 — 화면 밖·앱 백그라운드·동작 줄이기면 자동 넘김 멈춤", () => {
  const slide = (id: string) => ({
    id,
    imageUrl: `https://x/${id}.png`,
    title: id,
    subtitle: "",
    ctaHref: "/stores",
    inventoryKey: "STORES_HOME_HERO",
    aspectRatioWidth: 39,
    aspectRatioHeight: 16,
    cropPolicy: "cover",
    objectPosition: "center",
    creativeId: null,
  });
  let ioCallback: ((entries: Array<{ isIntersecting: boolean }>) => void) | null = null;
  let reduce = false;
  beforeEach(() => {
    heroBanners.list = [slide("h1"), slide("h2")];
    ioCallback = null;
    reduce = false;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: (e: Array<{ isIntersecting: boolean }>) => void) {
          ioCallback = cb;
        }
        observe() {}
        disconnect() {}
      }
    );
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q.includes("reduced-motion") ? reduce : false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });
  const shown = () => container.querySelector("[data-banner-campaign-id]")?.getAttribute("data-banner-campaign-id");

  it("보이는 동안은 5초마다 넘어간다", async () => {
    vi.useFakeTimers();
    await render(<StoresHomeHeroBanner />);
    expect(shown()).toBe("h1");
    await act(async () => {
      vi.advanceTimersByTime(5100);
    });
    expect(shown()).toBe("h2");
  });

  it("화면 밖이면 멈춘다", async () => {
    vi.useFakeTimers();
    await render(<StoresHomeHeroBanner />);
    await act(async () => {
      ioCallback?.([{ isIntersecting: false }]);
    });
    await act(async () => {
      vi.advanceTimersByTime(12_000);
    });
    expect(shown()).toBe("h1");
  });

  it("앱이 백그라운드면 멈춘다", async () => {
    vi.useFakeTimers();
    await render(<StoresHomeHeroBanner />);
    await act(async () => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => {
      vi.advanceTimersByTime(12_000);
    });
    expect(shown()).toBe("h1");
  });

  it("동작 줄이기 설정이면 멈춘다 · 손으로 넘기기는 그대로", async () => {
    reduce = true;
    vi.useFakeTimers();
    await render(<StoresHomeHeroBanner />);
    await act(async () => {
      vi.advanceTimersByTime(12_000);
    });
    expect(shown()).toBe("h1");
    const rootEl = container.querySelector("[data-stores-home-hero='banner']")!;
    await act(async () => {
      touch(rootEl, "touchstart", 300);
      touch(rootEl, "touchend", 200);
    });
    expect(shown()).toBe("h2");
  });
});

describe("MY-1 · MY-2 마이 배너 폼", () => {
  it("gif 허용 안 함 · 48×48 썸네일 안내", async () => {
    await render(<AdminBannerForm onSubmit={() => {}} />);
    const accepts = [...container.querySelectorAll("input[type=file]")].map((i) => i.getAttribute("accept"));
    expect(accepts.length).toBe(2);
    for (const a of accepts) expect(a).not.toContain("gif");
    expect(container.querySelector("[data-admin-mypage-banner-image-hint]")?.textContent).toContain("48×48");
  });

  it("업로드 오류는 한국어 문구 (코드값 노출 없음)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: false, error: "file_too_large" }), { status: 400 }))
    );
    await render(<AdminBannerForm onSubmit={() => {}} />);
    const input = container.querySelector("input[type=file]") as HTMLInputElement;
    const f = new File(["x"], "a.png", { type: "image/png" });
    Object.defineProperty(input, "files", { configurable: true, value: [f] });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const alert = container.querySelector("[role=alert]")!.textContent!;
    expect(alert).toContain("2MB");
    expect(alert).not.toContain("file_too_large");
  });
});

describe("FA-1 · FA-2 · FA-4 · FA-5 피드 배너 만들기 화면", () => {
  let posted: Record<string, unknown> | null = null;
  beforeEach(() => {
    posted = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.startsWith("/api/admin/feed-ads/targets")) {
          return new Response(
            JSON.stringify({ tradeCategories: [], communityTopics: [{ id: "t1", slug: "food", name: "맛집", nameEn: null }] })
          );
        }
        if (url === "/api/admin/feed-ads/upload") {
          return new Response(JSON.stringify({ ok: true, url: "https://cdn.example.com/u.png" }));
        }
        if (url === "/api/admin/feed-ads" && init?.method === "POST") {
          posted = JSON.parse(String(init.body));
          return new Response(JSON.stringify({ ok: true, campaignId: "c1" }));
        }
        return new Response(JSON.stringify({ ok: true, campaigns: [] }));
      })
    );
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }));
  });

  it("이름 안내 · 날짜 라벨 PHT · 상태 한국어 · 커뮤니티 주제 안내", async () => {
    await render(<AdminFeedAdCreatePage />);
    expect(container.querySelector("[data-admin-feed-name-hint]")?.textContent).toBe(
      "거래·커뮤니티 피드 광고 위쪽에 광고주 이름으로 보입니다."
    );
    expect(container.textContent).toContain("시작 (PHT)");
    expect(container.textContent).toContain("종료 (PHT)");
    const opts = [...container.querySelectorAll("option")].map((o) => o.textContent);
    expect(opts).toContain("초안");
    expect(opts).toContain("노출");
    expect(opts).not.toContain("draft");
    expect(container.querySelector("[data-admin-feed-topic-all-hint]")).toBeNull();
    const communityChip = [...container.querySelectorAll("button")].find((b) => b.textContent === "Community")!;
    await act(async () => communityChip.click());
    const topicChip = [...container.querySelectorAll("button")].find((b) => b.textContent === "커뮤니티 주제 피드")!;
    await act(async () => topicChip.click());
    expect(container.querySelector("[data-admin-feed-topic-all-hint]")?.textContent).toContain("커뮤니티 전체 피드");
  });

  it("날짜는 PHT 벽시계로 저장 · 미리보기 머리줄에 광고 이름", async () => {
    await render(<AdminFeedAdCreatePage />);
    const nameInput = container.querySelector("[data-admin-feed-ad-create] section input") as HTMLInputElement;
    await act(async () => setInput(nameInput, "철수네 가게"));
    const file = container.querySelector("[data-admin-feed-file-input='0']") as HTMLInputElement;
    Object.defineProperty(file, "files", { configurable: true, value: [new File(["x"], "a.png", { type: "image/png" })] });
    await act(async () => {
      file.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.querySelector("[data-feed-ad-preview] [data-feed-ad-advertiser]")?.textContent).toContain(
      "철수네 가게"
    );
    const [start, end] = [...container.querySelectorAll("input[type=datetime-local]")] as HTMLInputElement[];
    await act(async () => {
      setInput(start!, "2026-12-01T09:00");
      setInput(end!, "2026-12-31T23:30");
    });
    const destUrl = container.querySelector("input[placeholder='/path']") as HTMLInputElement;
    await act(async () => setInput(destUrl, "/market"));
    const cta = container.querySelector("[data-admin-feed-register-cta]") as HTMLButtonElement;
    await act(async () => {
      cta.click();
    });
    await act(async () => {});
    expect(posted).not.toBeNull();
    // PHT(UTC+8) 09:00 = UTC 01:00 — 브라우저 시간대와 무관
    expect(posted!.startAt).toBe("2026-12-01T01:00:00.000Z");
    expect(posted!.endAt).toBe("2026-12-31T15:30:00.000Z");
  });
});

describe("CX-16 이벤트 편집 날짜 = Asia/Manila 벽시계", () => {
  it("ISO ↔ 칸 값이 PHT 기준 (브라우저 시간대와 무관)", () => {
    expect(toLocalInput("2026-11-04T16:00:00.000Z")).toBe("2026-11-05T00:00");
    expect(fromLocalInput("2026-11-05T00:00")).toBe("2026-11-04T16:00:00.000Z");
    expect(fromLocalInput("")).toBeNull();
    expect(toLocalInput(null)).toBe("");
  });
});
