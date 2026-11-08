// @vitest-environment jsdom
/**
 * 재감사 R-01 (2026-11-04 · P0) — 커뮤니티 결제 창을 실제로 그려서 확인한다(문자열 검사 아님).
 * 7일을 고르고 결제 → 응답 끊김 → 창이 다시 불러옴 → 다시 누름:
 * 두 번째 요청도 **같은 요청 키 · 같은 상품(7일)** 이어야 한다(예전에는 3일로 돌아가 새 키 → 연장으로 두 번째 차감).
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/i18n/AppLanguageProvider", async () => {
  /** 언어 SSOT S6: 대체 문구 대신 실제 카탈로그 값(ko)으로 렌더 — 화면과 같은 문구를 확인한다 */
  const { safeTranslate } = await import("@/lib/i18n/safe-translate");
  // 실제 공급자처럼 같은 함수 참조를 돌려준다 (매 렌더 새 함수면 load 효과가 끝없이 다시 돈다)
  const value = {
    language: "ko",
    t: (k: string) => k,
    safeT: (k: string, o?: Parameters<typeof safeTranslate>[2]) => safeTranslate("ko", k as never, o),
  };
  return { useI18n: () => value };
});
vi.mock("@/components/currency", () => ({
  CurrencyAmount: ({ amount }: { amount: number }) => <span>{amount}P</span>,
}));
vi.mock("@/components/ui/dibay-overlay", () => ({
  DibayBottomSheet: ({ open, children, footer }: { open: boolean; children: ReactNode; footer?: ReactNode }) =>
    open ? (
      <div>
        {children}
        <div data-footer="1">{footer}</div>
      </div>
    ) : null,
  DibayOverlayButton: ({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <button type="button" data-overlay-button="1" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

import { MemberPostPromoteSheet } from "@/components/post/MemberPostPromoteSheet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const catalog = [
  { id: "community_promote_3", durationDays: 3, pointCost: 10000, fallbackTitleKo: "3일", fallbackTitleEn: "3d", fallbackDescKo: "", fallbackDescEn: "" },
  { id: "community_promote_7", durationDays: 7, pointCost: 20000, fallbackTitleKo: "7일", fallbackTitleEn: "7d", fallbackDescKo: "", fallbackDescEn: "" },
];

let container: HTMLDivElement;
const posts: Array<{ key: string | null; productId: string }> = [];

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  posts.length = 0;
  let postCount = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      if (String(url).startsWith("/api/me/points/promotion-orders?")) return json({ catalog, activeForTarget: null });
      if (String(url) === "/api/me/points") return json({ balance: postCount === 0 ? 50000 : 30000 });
      if (String(url) === "/api/me/points/promotion-orders" && init?.method === "POST") {
        const headers = new Headers(init.headers);
        posts.push({ key: headers.get("Idempotency-Key"), productId: JSON.parse(String(init.body)).productId });
        postCount += 1;
        // 첫 요청: 서버는 결제했지만 응답이 끊김 · 두 번째: 서버가 같은 키라 처음 결과를 돌려줌
        if (postCount === 1) return Promise.reject(new TypeError("network"));
        return json({ ok: true, idempotent: true, extended: false, endAt: "2026-11-20T00:00:00Z", balanceAfter: 30000 });
      }
      return json({});
    })
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  container.remove();
});

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await act(async () => { await Promise.resolve(); });
};
const buttonWith = (text: string) =>
  [...container.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes(text)) as HTMLButtonElement | undefined;
const buyButton = () =>
  [...container.querySelectorAll('[data-footer="1"] button')].find((b) => !(b as HTMLButtonElement).disabled) as
    | HTMLButtonElement
    | undefined;

describe("R-01 커뮤니티 결제 창 — 응답이 끊긴 뒤 다시 눌러도 같은 결제", () => {
  it("두 요청의 키·상품이 같고, 두 번째는 「이미 처리된 결제예요」", async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<MemberPostPromoteSheet postId="post-1" postTitle="글" open onClose={() => {}} domain="community" />);
    });
    await flush();
    const seven = buttonWith("7일");
    expect(seven).toBeTruthy();
    await act(async () => seven!.click());
    await act(async () => buyButton()!.click());
    await flush();
    // 다시 불러온 뒤에도 7일이 선택돼 있다
    expect(buttonWith("7일")!.getAttribute("data-selected")).toBe("true");
    expect(container.textContent).toContain("결제 결과를 확인하지 못했어요");
    await act(async () => buyButton()!.click());
    await flush();
    expect(posts).toHaveLength(2);
    expect(posts[0]!.productId).toBe("community_promote_7");
    expect(posts[1]!.productId).toBe("community_promote_7");
    expect(posts[1]!.key).toBe(posts[0]!.key);
    expect(container.textContent).toContain("이미 처리된 결제예요");
    await act(async () => root.unmount());
  });
});
