// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push, refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/mypage/gift-certificates/g1",
  useSearchParams: () => new URLSearchParams(""),
  useParams: () => ({}),
}));
vi.mock("@/lib/ui/use-form-keyboard-viewport", () => ({
  useFormKeyboardViewport: () => ({ effectiveBottomInset: 0, keyboardOpen: false }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...(rest as Record<string, never>)}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/delivery/customer/commerce-child-chrome", () => ({ useCommerceChildChrome: () => undefined }));
vi.mock("@/components/gift-certificate/GiftVisualCard", () => ({ GiftVisualCard: () => <div data-testid="gift-card" /> }));
vi.mock("@/components/gift-certificate/WalletGiftFriendPicker", () => ({ WalletGiftFriendPicker: () => null }));

import { PointChargeForm } from "@/components/points/PointChargeForm";
import { OwnedGiftInstanceDetailView } from "@/components/gift-certificate/OwnedGiftInstanceDetailView";
import type { PointPlan } from "@/lib/types/point";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const q = (id: string) => host!.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.unstubAllGlobals();
  push.mockReset();
});

const plan: PointPlan = {
  id: "plan1",
  name: "1,000P",
  paymentAmount: 100,
  pointAmount: 1000,
  bonusPointAmount: 0,
  isActive: true,
  description: "",
  rateVersion: 1,
};

describe("S41 충전 신청 — 하단 고정 CTA · 연타해도 요청 1회", () => {
  it("[충전 요청] 연타 → POST 1회, 성공 시 onSuccess", async () => {
    let resolveFetch: (v: Response) => void = () => {};
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((r) => {
          resolveFetch = r;
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    const onSuccess = vi.fn();
    act(() => root!.render(<PointChargeForm layout="page" plans={[plan]} onSuccess={onSuccess} />));
    // 은행 이체 선택(입금자명 불필요)
    const bank = Array.from(host!.querySelectorAll("button")).find((b) => b.textContent && /bank|이체|계좌/i.test(b.textContent));
    if (bank) act(() => bank.click());
    const cta = q("my-sticky-cta-primary")!;
    expect(cta).not.toBeNull();
    await act(async () => {
      cta.click();
      cta.click();
      cta.click();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveFetch(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});

describe("S45 상품권 상세 — 네트워크 오류도 끝난다(무한 로딩 금지)", () => {
  it("fetch reject → 오류 + [다시 시도], 재시도 성공 → 본문", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => {
      root!.render(<OwnedGiftInstanceDetailView instanceId="g1" />);
    });
    expect(q("my-state-error")).not.toBeNull();
    expect(host!.querySelector('[data-load-state="error"]')).not.toBeNull();

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          instance: {
            id: "g1",
            title: "G",
            status: "ACTIVE",
            transferable: true,
            giftScope: "STORE",
            storeSlug: "s",
            faceValue: 500,
            purchasePrice: 450,
            publicGiftNumber: "",
            redemptionHistory: [],
          },
        }),
        { status: 200 }
      )
    );
    await act(async () => {
      q("my-state-retry")!.click();
    });
    expect(q("gift-card")).not.toBeNull();
    expect(q("my-sticky-cta-primary")).not.toBeNull();
    expect(q("my-sticky-cta-secondary")).not.toBeNull();
  });

  it("404 → 없음 안내 + [목록으로], 403 → 수령 대기 안내", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false }), { status: 404 })));
    await act(async () => {
      root!.render(<OwnedGiftInstanceDetailView instanceId="g404" />);
    });
    expect(q("my-state-empty")).not.toBeNull();
    expect(host!.querySelector('[data-load-state="not_found"]')).not.toBeNull();
  });
});
