// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** 광고 ② 구현 U — PT-07 (CTA 칩만 버튼) · PU-13 (열린 창 등록) · MB-A01·D-14·DS-7 렌더 시험 */

vi.mock("next/navigation", () => ({ usePathname: () => "/market/1", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({ t: (k: string) => k, safeT: (k: string) => k, language: "ko" }),
}));

import { DibayPtrRevealBand } from "@/components/ptr/DibayPtrRevealBand";
import { TradeChatEntryCreatingOverlay } from "@/components/chats/TradeChatEntryCreatingOverlay";
import { OAuthProviderLoginPanel } from "@/components/auth/OAuthProviderLoginPanel";
import { MyTopBanner } from "@/components/my/MyTopBanner";
import { readNonAdOpenOverlayCount } from "@/lib/ui/open-overlay-registry";
import { setTradeChatEntryCreatingOverlayVisible } from "@/lib/chats/trade-chat-entry-overlay-events";
import { adminBannerDisplayStatus } from "@/lib/admin-banners/admin-banner-utils";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("PT-07 · D-1 — PTR 띠는 CTA 칩만 버튼", () => {
  const props = {
    variant: "default" as const,
    imageUrl: "https://img.example.com/b.webp",
    altText: "광고",
    frameWidthPx: 360,
    slotHeightPx: 80,
    adLabel: "광고",
    ctaLabel: "자세히 보기",
  };
  it("버튼 1개 = CTA 칩 · 띠 전체(inset-0) 버튼 없음 · 이미지는 버튼 밖 · 누르는 영역 44×44", () => {
    const html = renderToStaticMarkup(<DibayPtrRevealBand {...props} interactive onCta={() => {}} />);
    const buttons = html.match(/<button/g) ?? [];
    expect(buttons).toHaveLength(1);
    const button = html.slice(html.indexOf("<button"), html.indexOf("</button>"));
    expect(button).toContain("data-ptr-reveal-cta");
    expect(button).toContain("min-h-11");
    expect(button).toContain("min-w-11");
    expect(button).not.toContain("inset-0");
    expect(button).not.toContain("<img");
  });
  it("당기는 중(interactive=false)에는 버튼이 없다", () => {
    const html = renderToStaticMarkup(<DibayPtrRevealBand {...props} interactive={false} onCta={() => {}} />);
    expect(html).not.toContain("<button");
  });
  it("CTA 칩을 누르면 onCta 1회", async () => {
    const onCta = vi.fn();
    await act(async () => root.render(<DibayPtrRevealBand {...props} interactive onCta={onCta} />));
    (container.querySelector("[data-ptr-reveal-cta]") as HTMLButtonElement).click();
    expect(onCta).toHaveBeenCalledTimes(1);
  });
});

describe("PU-13 — 자체 전체 화면 창도 열린 창으로 센다(팝업 보류)", () => {
  it("채팅방 여는 중 오버레이", async () => {
    await act(async () => root.render(<TradeChatEntryCreatingOverlay />));
    expect(readNonAdOpenOverlayCount()).toBe(0);
    await act(async () => setTradeChatEntryCreatingOverlayVisible(true));
    expect(readNonAdOpenOverlayCount()).toBe(1);
    await act(async () => setTradeChatEntryCreatingOverlayVisible(false));
    expect(readNonAdOpenOverlayCount()).toBe(0);
  });
  it("로그인 계속 시트", async () => {
    await act(async () => root.render(<OAuthProviderLoginPanel provider="google" phase="idle" status="idle" />));
    expect(readNonAdOpenOverlayCount()).toBe(0);
    await act(async () => root.render(<OAuthProviderLoginPanel provider="google" phase="entered" status="opening" />));
    expect(readNonAdOpenOverlayCount()).toBe(1);
    await act(async () => root.render(<OAuthProviderLoginPanel provider="google" phase="idle" status="idle" />));
    expect(readNonAdOpenOverlayCount()).toBe(0);
  });
});

describe("마이 배너", () => {
  const row = {
    id: "b1",
    title: "안내",
    description: "",
    image_url: "",
    mobile_image_url: "",
    is_active: true,
    dismissible: false,
    sort_order: 0,
    created_at: "",
    updated_at: "",
  };
  it("DS-7: 링크 없는 배너는 그리지 않는다(무반응 제거) · 링크 있으면 그린다", () => {
    expect(renderToStaticMarkup(<MyTopBanner banner={{ ...row, link_url: "" } as never} />)).toBe("");
    expect(renderToStaticMarkup(<MyTopBanner banner={{ ...row, link_url: "/events/e1" } as never} />)).toContain("안내");
  });
  it("D-15: 「광고」 표시가 없다", () => {
    expect(renderToStaticMarkup(<MyTopBanner banner={{ ...row, link_url: "/events/e1" } as never} />)).not.toContain("광고");
  });
  it("MB-A01: 활성인데 시작 전이면 「예정」", () => {
    const now = Date.parse("2026-11-04T00:00:00Z");
    expect(adminBannerDisplayStatus({ status: "active", startAt: "2026-11-05T00:00:00Z", endAt: "" }, now)).toBe("scheduled");
    expect(adminBannerDisplayStatus({ status: "active", startAt: "2026-11-03T00:00:00Z", endAt: "" }, now)).toBe("active");
    expect(adminBannerDisplayStatus({ status: "active", startAt: "", endAt: "2026-11-03T00:00:00Z" }, now)).toBe("expired");
  });
});

const alertMock = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/components/ui/dibay-overlay/DibayAppDialogProvider", () => ({ dibayAlert: alertMock }));

describe("DS-9 — 열 수 없는 링크 안내(무반응 제거)", () => {
  it("형식이 틀린 목적지 → false + 「열 수 없는 링크입니다」", async () => {
    const { openDestination } = await import("@/lib/destination/open-destination");
    const { setRuntimeAppLanguage } = await import("@/lib/i18n/runtime-app-language");
    setRuntimeAppLanguage("ko");
    const push = vi.fn();
    expect(openDestination("javascript:alert(1)", { push })).toBe(false);
    await vi.waitFor(() => expect(alertMock).toHaveBeenCalled());
    expect((alertMock.mock.calls[0] as unknown as [{ title: string }])[0].title).toBe("열 수 없는 링크입니다");
    expect(push).not.toHaveBeenCalled();
  });
  it("정상 내부 경로는 안내 없이 이동", async () => {
    alertMock.mockClear();
    const { openDestination } = await import("@/lib/destination/open-destination");
    const push = vi.fn();
    expect(openDestination("/market", { push })).toBe(true);
    expect(push).toHaveBeenCalledWith("/market");
    expect(alertMock).not.toHaveBeenCalled();
  });
});

describe("D-14 — 마이 배너 어드민 표에 노출·클릭 칸 없음", () => {
  it("AdminBannerTable", async () => {
    const { AdminBannerTable } = await import("@/components/admin/banners/AdminBannerTable");
    const html = renderToStaticMarkup(
      <AdminBannerTable
        banners={[
          {
            id: "b1", title: "t", description: "", imageUrl: "", mobileImageUrl: "", targetUrl: "/events/e1",
            placement: "mypage_top", status: "active", priority: 0, startAt: "", endAt: "",
            clickCount: 7, impressionCount: 9, createdAt: "", updatedAt: "", createdBy: "",
          },
        ]}
      />
    );
    expect(html).not.toContain("admin_banners_th_click_impression");
    expect(html).not.toContain("7 / 9");
  });
});
