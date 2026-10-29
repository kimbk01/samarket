// @vitest-environment jsdom
/**
 * v4 W3 PERF-13 — 검색 제출·추천어 탭은 즉시 1회 호출, 같은 검색어 debounce 호출은 건너뛴다 (중복 요청 0).
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/stores/search",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/addresses/MandatoryAddressGate", () => ({
  SAMARKET_ADDRESSES_UPDATED_EVENT: "samarket:addresses-updated",
}));
vi.mock("@/lib/dibay/use-delivery-list-scroll-restore", () => ({
  useDeliveryListScrollRestore: () => {},
}));
vi.mock("@/lib/dibay/delivery-list-scroll-restore", () => ({
  buildDeliveryListScrollRouteKey: (p: string, s: string) => `${p}${s}`,
  saveDeliveryListScrollBeforeStoreNavigation: () => {},
}));
vi.mock("@/lib/dibay/store-detail-seed-patch-trace", () => ({
  markStoreDetailListSeedNavigation: () => {},
}));
vi.mock("@/lib/navigation/navigate-to-delivery-store-product", () => ({
  navigateToDeliveryStoreCard: () => {},
  navigateToDeliveryStoreProduct: () => {},
}));
vi.mock("@/components/delivery/search/DeliverySearchHeader", () => ({
  DeliverySearchHeader: ({
    onChange,
    onSubmit,
  }: {
    onChange: (v: string) => void;
    onSubmit: (v: string) => void;
  }) => (
    <div>
      <button type="button" data-testid="type" onClick={() => onChange("pizza")} />
      <button type="button" data-testid="submit" onClick={() => onSubmit("pizza")} />
    </div>
  ),
}));
vi.mock("@/components/delivery/search/RecentSearchChips", () => ({
  RecentSearchChips: ({ onPick }: { onPick: (k: string) => void }) => (
    <button type="button" data-testid="chip" onClick={() => onPick("chicken")} />
  ),
}));
vi.mock("@/components/delivery/search/PopularSearchList", () => ({ PopularSearchList: () => null }));
vi.mock("@/components/delivery/search/RecommendedSearchChips", () => ({
  RecommendedSearchChips: () => null,
}));
vi.mock("@/components/delivery/search/DeliverySearchResults", () => ({
  DeliverySearchResults: () => <div data-testid="results" />,
}));
vi.mock("@/components/delivery/viewer-gate/DeliveryViewerGatePanel", () => ({
  DeliveryViewerGatePanel: () => null,
}));

import { DeliverySearchPage } from "@/components/delivery/search/DeliverySearchPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const fetchMock = vi.fn(async () => ({
  ok: true,
  status: 200,
  json: async () => ({ ok: true, stores: [], menus: [], result_count: 0 }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function render(node: ReactNode) {
  act(() => root!.render(node));
}
function click(testId: string) {
  act(() => {
    (host!.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement).click();
  });
}
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
}
const searchCalls = () =>
  fetchMock.mock.calls.filter((c) => String((c as unknown[])[0]).startsWith("/api/stores/search")).length;

describe("PERF-13 — 검색 중복 요청 0", () => {
  it("추천어(칩) 탭 → 즉시 1회, debounce 재호출 없음", async () => {
    render(<DeliverySearchPage />);
    click("chip");
    expect(searchCalls()).toBe(1);
    await settle();
    expect(searchCalls()).toBe(1);
  });

  it("입력 직후(250ms 안) 제출 → 즉시 1회, debounce 재호출 없음", async () => {
    render(<DeliverySearchPage />);
    click("type");
    click("submit");
    expect(searchCalls()).toBe(1);
    await settle();
    expect(searchCalls()).toBe(1);
  });

  it("입력만 하면 debounce 1회", async () => {
    render(<DeliverySearchPage />);
    click("type");
    expect(searchCalls()).toBe(0);
    await settle();
    expect(searchCalls()).toBe(1);
  });
});
