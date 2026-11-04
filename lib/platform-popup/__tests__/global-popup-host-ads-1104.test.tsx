// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** 광고 ② 구현 U — PU-30 · PU-31 · D-27 · D-2(숨김 판 전송) 동작 시험 (실제 GlobalPopupHost 렌더) */

const h = vi.hoisted(() => ({
  winner: null as Record<string, unknown> | null,
  imageResult: "ready" as "ready" | "failed" | "timeout",
  openDestination: vi.fn(() => true),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/market",
  useRouter: () => ({ push: h.push }),
}));
vi.mock("@/hooks/use-client-membership-state", () => ({
  useClientMembershipState: () => ({ status: "guest" }),
}));
vi.mock("@/lib/startup/startup-metrics", () => ({
  isAppShellReady: () => true,
  whenAppShellReady: () => () => {},
}));
vi.mock("@/lib/stores/use-stores-home-overlay-defer-until-input", () => ({
  useStoresHomeOverlayDeferUntilInput: () => false,
}));
vi.mock("@/lib/auth/client-instance-id", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  ensureClientInstanceId: () => "device-1",
}));
vi.mock("@/lib/platform-promotion-lifecycle/client-record-content-visit", () => ({
  recordPromotionContentVisitClient: () => {},
}));
vi.mock("@/lib/platform-popup/fetch-platform-popup-resolve-client", () => ({
  fetchPlatformPopupResolveDeduped: vi.fn(async () => ({ json: { ok: true, winner: h.winner, impression: false } })),
}));
vi.mock("@/lib/platform-popup/popup-image-ready", () => ({
  waitPlatformPopupImageReady: vi.fn(async () => h.imageResult),
}));
vi.mock("@/lib/destination/open-destination", () => ({
  openDestination: h.openDestination,
  notifyDestinationOpenFailed: vi.fn(),
}));
vi.mock("@/components/platform-popup/DibayPopupAd", () => ({
  DibayPopupAd: (p: { onClose: () => void; onCta: () => void; onSuppress: (m: string) => void }) => (
    <div data-test-popup="">
      <button data-close="" onClick={p.onClose} />
      <button data-cta="" onClick={p.onCta} />
      <button data-campaign="" onClick={() => p.onSuppress("CAMPAIGN")} />
    </div>
  ),
}));

import { GlobalPopupHost } from "@/components/platform-popup/GlobalPopupHost";
import { isPlatformPopupSessionBlockedCampaign } from "@/lib/platform-popup/popup-app-session";

function winner(frequencyMode: string) {
  return {
    campaignId: `c-${frequencyMode}`,
    creativeId: "cr-1",
    surface: "TRADE",
    presentationType: "center_modal",
    frequencyMode,
    creative: { id: "cr-1", imageUrl: "https://img.example.com/a.webp", altText: "", aspectW: 36, aspectH: 25, creativeMode: "card" },
    title: null,
    body: null,
    benefit: null,
    cta: { type: "internal_page", href: "/market/abc", label: null },
    suppressionOptions: ["CAMPAIGN"],
    timezone: "Asia/Manila",
    suppressionDurationSeconds: null,
    revision: "cr-1~d1234abcd",
  };
}

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
  window.sessionStorage.clear();
  fetchMock.mockClear();
  h.openDestination.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function mountWith(w: Record<string, unknown>, image: "ready" | "failed" | "timeout" = "ready") {
  h.winner = w;
  h.imageResult = image;
  await act(async () => {
    root.render(<GlobalPopupHost />);
  });
  for (let i = 0; i < 5; i++) await act(async () => {});
}

const urls = () => fetchMock.mock.calls.map((c) => String((c as unknown[])[0]));

describe("GlobalPopupHost — 광고 ② 구현", () => {
  it("D-27: 이미지 준비(ready) 뒤에만 틀을 보인다", async () => {
    await mountWith(winner("close_only"), "ready");
    expect(container.querySelector("[data-test-popup]")).not.toBeNull();
  });

  it("D-27: 3초 안에 준비 안 되면(timeout) 틀을 보이지 않고 이번 실행 건너뜀 목록에 넣는다", async () => {
    await mountWith(winner("close_only"), "timeout");
    expect(container.querySelector("[data-test-popup]")).toBeNull();
    expect(isPlatformPopupSessionBlockedCampaign("c-close_only")).toBe(true);
  });

  it("PU-31: × (close_only) 는 요청 0 — 숨김·dismiss 기록을 보내지 않는다", async () => {
    await mountWith(winner("close_only"));
    await act(async () => {
      (container.querySelector("[data-close]") as HTMLButtonElement).click();
    });
    expect(container.querySelector("[data-test-popup]")).toBeNull();
    expect(urls()).toEqual([]);
  });

  it("× (once_per_day) 는 효과 있는 숨김이라 suppress 를 기록한다", async () => {
    await mountWith(winner("once_per_day"));
    await act(async () => {
      (container.querySelector("[data-close]") as HTMLButtonElement).click();
    });
    expect(urls()).toContain("/api/platform-popup/suppress");
  });

  it("PU-30: CTA 로 끝나면 click → landing 만 — dismiss·suppress 를 남기지 않는다", async () => {
    await mountWith(winner("once_per_day"));
    await act(async () => {
      (container.querySelector("[data-cta]") as HTMLButtonElement).click();
    });
    for (let i = 0; i < 3; i++) await act(async () => {});
    expect(h.openDestination).toHaveBeenCalledTimes(1);
    expect(urls()).not.toContain("/api/platform-popup/suppress");
    const kinds = fetchMock.mock.calls
      .filter((c) => String((c as unknown[])[0]) === "/api/platform-popup/events")
      .map((c) => JSON.parse(String(((c as unknown[])[1] as RequestInit).body)).eventType);
    expect(kinds).toEqual(["click", "landing_success"]);
    expect(container.querySelector("[data-test-popup]")).toBeNull();
  });

  it("D-2: 「다시 보지 않기」는 서버 판(소재 + 목적지 해시)을 보낸다", async () => {
    await mountWith(winner("once_campaign"));
    await act(async () => {
      (container.querySelector("[data-campaign]") as HTMLButtonElement).click();
    });
    const call = fetchMock.mock.calls.find((c) => String((c as unknown[])[0]) === "/api/platform-popup/suppress");
    expect(JSON.parse(String(((call as unknown[])[1] as RequestInit).body))).toMatchObject({
      mode: "CAMPAIGN",
      campaignRevision: "cr-1~d1234abcd",
    });
  });
});
