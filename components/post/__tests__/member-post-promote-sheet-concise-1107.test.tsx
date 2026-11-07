// @vitest-environment jsdom
/**
 * Owner 2026-11-07 「상위노출 부분은 포인트 사용을 위한 불필요한 설명이 너무 많다 — 정확한 버튼과 구현」.
 * 커뮤니티 상위노출 창 = 거래 광고 창과 같은 모양: 내 포인트·충전 / 상품 줄(제목·위치 한 줄·가격·부족분) / 버튼 하나.
 * 상품 긴 설명·「적용 위치」 상자·「관리자 승인」 안내·예상 잔액은 그리지 않는다.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/i18n/AppLanguageProvider", () => {
  const value = {
    language: "ko",
    t: (k: string, p?: Record<string, string>) => (p ? `${k}(${Object.values(p).join(",")})` : k),
    safeT: (_k: string, o?: { fallbackKo?: string }) => o?.fallbackKo ?? _k,
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
        <div data-body="1">{children}</div>
        <div data-footer="1">{footer}</div>
      </div>
    ) : null,
  DibayOverlayButton: ({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

import { MemberPostPromoteSheet } from "@/components/post/MemberPostPromoteSheet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LONG_DESC = "결제 즉시 3일간 커뮤니티 홈 피드와 이 글의 주제 피드에 노출됩니다. 관리자 승인 대기 없이 Point가 결제됩니다.";
const catalog = [
  { id: "community_promote_3", durationDays: 3, pointCost: 10000, fallbackTitleKo: "커뮤니티 3일 상위 노출", fallbackTitleEn: "3d", fallbackDescKo: LONG_DESC, fallbackDescEn: "" },
  { id: "community_promote_7", durationDays: 7, pointCost: 20000, fallbackTitleKo: "커뮤니티 7일 상위 노출", fallbackTitleEn: "7d", fallbackDescKo: LONG_DESC, fallbackDescEn: "" },
];

let container: HTMLDivElement;
let balance = 15000;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const body = String(url).startsWith("/api/me/points/promotion-orders?")
        ? { catalog, activeForTarget: null }
        : String(url) === "/api/me/points"
          ? { balance }
          : {};
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
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
async function render() {
  await act(async () => {
    createRoot(container).render(
      <MemberPostPromoteSheet open onClose={() => {}} postId="p1" postTitle="글 제목" domain="community" />
    );
  });
  await flush();
}

describe("커뮤니티 상위노출 창 — 설명 최소 · 정확한 버튼", () => {
  it("긴 설명·적용 위치 상자·관리자 승인 안내·예상 잔액이 없다", async () => {
    balance = 15000;
    await render();
    const text = container.textContent ?? "";
    expect(text).not.toContain(LONG_DESC);
    expect(text).not.toContain("적용 위치");
    expect(text).not.toContain("관리자 승인");
    expect(text).not.toContain("예상 잔액");
    expect(text).toContain("promo_sheet_where_community");
  });

  it("내 포인트가 위에 · 버튼 하나 = 고른 상품 금액으로 시작", async () => {
    balance = 15000;
    await render();
    expect(container.querySelector('[data-promo-sheet-balance="1"]')?.textContent).toContain("15,000P");
    const footerButtons = [...container.querySelectorAll('[data-footer="1"] button, [data-footer="1"] a')];
    expect(footerButtons).toHaveLength(1);
    expect(footerButtons[0]!.textContent).toBe("trade_ad_start(10,000P)");
  });

  it("⑨ 모자란 상품 줄은 못 고름 · 「N P 부족」 · 고를 수 있는 줄이 있으면 버튼은 그 금액", async () => {
    balance = 15000;
    await render();
    const seven = [...container.querySelectorAll('[role="radio"]')].find((b) => (b.textContent ?? "").includes("7일")) as HTMLButtonElement;
    expect(seven.disabled).toBe(true);
    expect(seven.getAttribute("data-promo-sheet-option-state")).toBe("disabled");
    expect(seven.querySelector("[data-promo-sheet-short]")?.textContent).toBe("trade_ad_short(5,000P)");
    await act(async () => {
      seven.click();
    });
    expect(container.querySelector('[data-footer="1"] button')?.textContent).toBe("trade_ad_start(10,000P)");
  });

  it("⑦⑧ 다 모자라면 주 버튼 = 충전 신청(가장 적게 모자란 양 need) · 위 잔액 줄에도 충전", async () => {
    balance = 6100;
    await render();
    expect(container.querySelector('[data-promo-sheet-balance="1"]')?.textContent).toContain("6,100P");
    const charge = container.querySelector('[data-promo-sheet-charge="1"]') as HTMLAnchorElement;
    expect(charge).not.toBeNull();
    expect(charge.getAttribute("href")).toContain("/mypage/points/charge?need=3900");
    expect([...container.querySelectorAll('[role="radio"]')].every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });
});

describe("거래 광고 창 (코드 구조)", () => {
  const src = readFileSync(join(process.cwd(), "components/trade/seller-ad/TradeAdQuickSheet.tsx"), "utf8");
  it("② 성공 응답의 결제 후 잔액(balanceAfter)으로 내 포인트를 바꾼다", () => {
    expect(src).toContain("balanceAfter?: number;");
    expect(src).toMatch(/setData\(\(prev\) => \(prev \? \{ \.\.\.prev, balance: after \} : prev\)\)/);
  });
  it("③ 정지 줄 오른쪽은 한 단어(이유는 줄 아래 한 번만)", () => {
    expect(src).toContain('t("trade_ad_boost_paused_short")');
    expect(src).not.toContain('t("trade_ad_boost_paused")');
  });
  it("① 고객 문의에 글 제목(표시용)을 넘긴다", () => {
    expect(src).toContain("referenceTitle: postTitle");
  });
});
