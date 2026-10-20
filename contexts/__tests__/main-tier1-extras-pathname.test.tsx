// @vitest-environment jsdom
/**
 * 헤더 보조정보(MainTier1Extras) 경로 키 계약 (설계서 §12 「전환 중」 · §13-4).
 * A 경로에서 등록한 제목은 B 경로 렌더에서 보이지 않아야 한다(이전 화면 제목 잔존 차단).
 */
import { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MainTier1ExtrasProvider,
  mainTier1ExtrasForPathname,
  useMainTier1ExtrasOptional,
  useSetMainTier1ExtrasOptional,
  type MainTier1ExtrasState,
} from "@/contexts/MainTier1ExtrasContext";

const nav = vi.hoisted(() => ({ pathname: "/mypage/benefits" }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({
    t: (key: string) => `t:${key}`,
    tt: (text: string) => text,
    safeT: (key: string, opts?: { fallbackKo?: string }) => opts?.fallbackKo ?? key,
  }),
}));
vi.mock("@/hooks/use-is-messenger-split-viewport", () => ({ useIsMessengerSplitViewport: () => false }));
vi.mock("@/components/my/MyHubHeaderActions", () => ({ MyHubHeaderActions: () => null }));
vi.mock("@/components/layout/RegionBarMainHubTier1", () => ({ RegionBarMainHubTier1: () => null }));
vi.mock("@/components/stores/browse/StoresBrowseHeaderChrome", () => ({ StoresBrowseHeaderChrome: () => null }));
vi.mock("@/components/stores/home/hub/StoresHomeHeaderChrome", () => ({ StoresHomeHeaderChrome: () => null }));
vi.mock("@/components/layout/sector-header", () => ({
  DetailHeader: ({ title }: { title?: React.ReactNode }) => <h1 data-testid="tier1-title">{title}</h1>,
}));

import { RegionBar } from "@/components/layout/RegionBar";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";

function Registrar({ extras }: { extras: MainTier1ExtrasState }) {
  const set = useSetMainTier1ExtrasOptional();
  useLayoutEffect(() => {
    set?.(extras);
  }, [set, extras]);
  return null;
}

const probe: { extras: MainTier1ExtrasState | null } = { extras: null };
function ExtrasProbe() {
  const extras = useMainTier1ExtrasOptional()?.extras ?? null;
  useLayoutEffect(() => {
    probe.extras = extras;
  }, [extras]);
  return null;
}

describe("MainTier1Extras pathname key", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    probe.extras = null;
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("A registers → render at B → A title not shown (route-table title instead)", () => {
    const aExtras: MainTier1ExtrasState = { tier1: { title: "A 화면 제목" }, pathname: "/mypage/benefits" };

    nav.pathname = "/mypage/benefits";
    act(() => {
      root.render(
        <MainTier1ExtrasProvider>
          <Registrar extras={aExtras} />
          <RegionBar />
        </MainTier1ExtrasProvider>
      );
    });
    expect(host.querySelector("[data-testid=tier1-title]")?.textContent).toBe("A 화면 제목");

    /** 같은 extras 가 남아 있는 상태로 B 경로 렌더 (전환 중 잔존 시나리오) */
    nav.pathname = "/mypage/trust";
    act(() => {
      root.render(
        <MainTier1ExtrasProvider>
          <Registrar extras={aExtras} />
          <RegionBar />
        </MainTier1ExtrasProvider>
      );
    });
    const title = host.querySelector("[data-testid=tier1-title]")?.textContent ?? "";
    expect(title).not.toContain("A 화면 제목");
    expect(title).toBe("t:mypage_trust_title");
  });

  it("MySubpageHeader registers its pathname with the extras", () => {
    nav.pathname = "/mypage/benefits";
    act(() => {
      root.render(
        <MainTier1ExtrasProvider>
          <MySubpageHeader title="혜택" hideCtaStrip />
          <ExtrasProbe />
        </MainTier1ExtrasProvider>
      );
    });
    expect(probe.extras?.pathname).toBe("/mypage/benefits");
    expect(probe.extras?.tier1?.title).toBe("혜택");
  });

  it("mainTier1ExtrasForPathname: legacy extras (no pathname) apply everywhere; keyed extras only on match", () => {
    const legacy: MainTier1ExtrasState = { tier1: { title: "x" } };
    expect(mainTier1ExtrasForPathname(legacy, "/any")).toBe(legacy);
    const keyed: MainTier1ExtrasState = { tier1: { title: "x" }, pathname: "/mypage/offers" };
    expect(mainTier1ExtrasForPathname(keyed, "/mypage/offers/")).toBe(keyed);
    expect(mainTier1ExtrasForPathname(keyed, "/mypage/offers?tab=sent")).toBe(keyed);
    expect(mainTier1ExtrasForPathname(keyed, "/mypage/trust")).toBeNull();
    expect(mainTier1ExtrasForPathname(null, "/x")).toBeNull();
  });
});
