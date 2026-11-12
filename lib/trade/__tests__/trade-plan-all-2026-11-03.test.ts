// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { displayPointLedgerDescription } from "@/lib/points/project-point-financial-history";
import { classifyMyBoostOrderTab } from "@/lib/ads/my-ad-tab";

const src = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const flush = () => new Promise((r) => setTimeout(r, 0));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** 훅 값을 읽는 최소 렌더 (testing-library 없이 react-dom) */
async function mountHook(use: () => boolean) {
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const el = document.createElement("div");
  const root = createRoot(el);
  const box = { value: false };
  function C() {
    box.value = use();
    return null;
  }
  await React.act(async () => {
    root.render(React.createElement(C));
  });
  return {
    get: () => box.value,
    settle: () => React.act(async () => {
      await flush();
      await flush();
    }),
  };
}

describe("F2 숨김 서버 저장 — 저장소 동작", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    vi.resetModules();
    /** 로컬 Node 26 은 jsdom localStorage 가 비어 있다(CI Node 22 는 정상) — 같은 동작의 메모리 저장소로 고정 */
    const mem = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
      setItem: (k: string, v: string) => void mem.set(k, String(v)),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => mem.clear(),
      key: (i: number) => [...mem.keys()][i] ?? null,
      get length() {
        return mem.size;
      },
    });
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  async function load() {
    return import("@/lib/trade/hidden-posts-store");
  }
  const json = (status: number, body: unknown) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

  it("처음 구독 때 서버 목록으로 교체 · 기기 저장(userId 포함)", async () => {
    window.localStorage.setItem("dibay:trade-hidden-post-ids:v1", JSON.stringify({ userId: "other", ids: ["old"] }));
    fetchMock.mockImplementation(() => json(200, { ok: true, userId: "u1", postIds: ["p1", "p2"] }));
    const store = await load();
    const a = await mountHook(() => store.useIsTradePostHidden("p1"));
    const old = await mountHook(() => store.useIsTradePostHidden("old"));
    await a.settle();
    await old.settle();
    expect(a.get()).toBe(true);
    expect(old.get()).toBe(false);
    expect(JSON.parse(window.localStorage.getItem("dibay:trade-hidden-post-ids:v1") ?? "{}")).toEqual({ userId: "u1", ids: ["p2", "p1"] });
    /** 재감사 B-10 ②: 서버는 최신순(p1 이 최신) — 기기 저장은 「최신이 뒤」라 뒤집어 둔다 */
  });

  it("숨기기 = PUT · 되돌리기 = DELETE · 네트워크 실패면 화면 되돌림", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).startsWith("/api/my/hidden-posts")) return json(200, { ok: true, userId: "u1", postIds: [] });
      if (init?.method === "PUT") return json(200, { ok: true });
      if (init?.method === "DELETE") return Promise.reject(new Error("offline"));
      return json(404, {});
    });
    const store = await load();
    const h = await mountHook(() => store.useIsTradePostHidden("p9"));
    await h.settle();
    store.hideTradePost("p9");
    await h.settle();
    expect(h.get()).toBe(true);
    expect(fetchMock.mock.calls.some(([u, i]) => String(u) === "/api/posts/p9/hide" && i?.method === "PUT")).toBe(true);
    store.unhideTradePost("p9");
    await h.settle();
    /** DELETE 실패 → 되돌림(다시 숨김) */
    expect(h.get()).toBe(true);
  });

  it("표가 아직 없으면(tableMissing·503) 메모리로만 — 화면 유지·되돌리지 않음", async () => {
    fetchMock.mockImplementation((url: string) =>
      String(url).startsWith("/api/my/hidden-posts")
        ? json(200, { ok: true, userId: "u1", postIds: [], tableMissing: true })
        : json(503, { ok: false, error: "migration_required" })
    );
    const store = await load();
    const h = await mountHook(() => store.useIsTradePostHidden("p3"));
    await h.settle();
    store.hideTradePost("p3");
    await h.settle();
    expect(h.get()).toBe(true);
  });
});

describe("F2 — API·마이그레이션", () => {
  it("본인 행만 · 멱등 · 표 없으면 503/빈 목록", () => {
    const sql = src("supabase/migrations/20271103180000_trade_post_user_hides.sql");
    expect(sql).toMatch(/UNIQUE \(post_id, user_id\)/);
    expect(sql).toMatch(/REFERENCES public\.posts \(id\) ON DELETE CASCADE/);
    expect(sql).toMatch(/USING \(user_id = auth\.uid\(\)\)/);
    const api = src("app/api/posts/[postId]/hide/route.ts");
    expect(api).toContain("ignoreDuplicates: true");
    expect(api).toContain('"migration_required"');
    expect(src("app/api/my/hidden-posts/route.ts")).toContain("tableMissing: true");
  });
});

describe("D1~D5 글쓰기·내 매물", () => {
  it("D1: 시트 코드가 오는 동안 틀을 바로 · 열림 시간 계측(재감사 B-11 — 중복 미리 받기 제거)", () => {
    expect(src("components/layout/MainAppProviderTree.tsx")).toContain("loading: () => <TradeWriteSheetLoadingFrame />");
    expect(src("components/trade/TradeWriteSheetLoadingFrame.tsx")).toContain("if (!sheet?.isOpen) return null;");
    expect(src("contexts/TradeWriteSheetContext.tsx")).toContain("markTradeWriteSheetOpenStart();");
    expect(src("components/trade/TradeWriteBottomSheet.tsx")).toContain("recordTradeWriteSheetFirstFrame();");
    expect(src("components/trade/MarketplaceSellHubPage.tsx")).not.toContain("preloadTradeWriteSheet");
    expect(src("components/mypage/products/MyProductsView.tsx")).not.toContain("preloadTradeWriteSheet");
  });
  it("D2: 시트 안에서는 폼이 좌우 여백을 한 번 더 주지 않는다 · 선택 전에도 * 와 ₱", () => {
    expect(src("components/write/trade/TradeWriteForm.tsx")).toContain(
      'className={rootTopicSelect != null ? "min-w-0 w-full max-w-full space-y-0" : APP_TRADE_WRITE_FORM_FB_STACK_CLASS}'
    );
    const sheet = src("components/write/WriteSheetFlowInner.tsx");
    /** 한국 주소 지원 3단계: 단위 = 대표 주소 나라 통화(필리핀이면 ₱ 그대로) */
    expect(sheet).toContain("getCurrencyUnitLabel(masterTradeCurrency)");
    expect((sheet.match(/<span className="text-sam-danger">\*<\/span>/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
  it("D2 보정: 주제 고르기 전에도 판매하기/나눔하기 — 같은 자리·모양, 고른 값은 중고거래 폼으로 이어짐", () => {
    const sheet = src("components/write/WriteSheetFlowInner.tsx");
    const ungated = sheet.slice(sheet.indexOf('data-ui3-slot="price"'), sheet.indexOf('data-ui3-slot="item"'));
    expect(ungated).toContain('t("trade_write_sell_cta")');
    expect(ungated).toContain('t("trade_write_share_cta")');
    expect(ungated).toContain("KARROT_PILL_ACTIVE");
    expect(ungated).toContain("{!pendingFreeShare ? (");
    expect(sheet).toContain("isFreeShare: pendingFreeShare,");
    const form = src("components/write/trade/TradeWriteForm.tsx");
    expect(form).toContain('resolveTradeWriteSkinKey(category.icon_key) === "general"');
    expect(form).toContain("useState(seededFreeShare)");
    expect(form).toContain("if (seededShareCategoryRef.current === category.id) return;");
  });
  it("D3: 하위 주제·추가 칸이 없으면 감싼 칸도 그리지 않는다", () => {
    const form = src("components/write/trade/TradeWriteForm.tsx");
    expect(form).not.toMatch(/<div className=\{`\$\{TRADE_WRITE_FB_SECTION\}[^`]*`\}>\s*<WriteTradeTopicSection/);
    expect((form.match(/wrapperClassName=\{`\$\{TRADE_WRITE_FB_SECTION\}/g) ?? []).length).toBe(3);
    expect(src("components/write/shared/WriteTradeTopicSection.tsx")).toContain("return wrapperClassName ? <div className={wrapperClassName}>{body}</div> : body;");
    expect(src("components/write/trade/generic/GenericTradeWriteFields.tsx")).toContain("return wrapperClassName ? <section className={wrapperClassName}>{body}</section> : body;");
  });
  it("D4: 칸을 고치면 그 칸 오류를 지운다", () => {
    const form = src("components/write/trade/TradeWriteForm.tsx");
    for (const k of ["title", "description", "price", "images", "location"]) {
      expect(form).toContain(`clearFieldError("${k}")`);
    }
  });
  it("D5: 전체가 비었는데 숨긴 글이 있으면 안내·숨김 탭 바로가기", () => {
    const v = src("components/mypage/products/MyProductsView.tsx");
    /** 재감사 B-9: 숨긴 매물 「개수」를 보여 주려고 1건 → HIDDEN_COUNT_LIMIT 건 */
    expect(v).toContain("/api/my/posts?limit=${HIDDEN_COUNT_LIMIT}&filter=hidden");
    expect(v).toContain('onFilterChange("hidden")');
  });
});

describe("문구·내역", () => {
  it("결제 내역 문구 → 상위노출 N일 (B-12 · 다른 문구는 그대로)", () => {
    expect(displayPointLedgerDescription("프로모션 구매 (trade_promote_7, 7일)")).toBe("상위노출 7일");
    expect(displayPointLedgerDescription("프로모션 구매 (trade_promote_14, 14일)")).toBe("상위노출 14일");
    expect(displayPointLedgerDescription("프로모션 구매 (community_promote_3, 3일)")).toBe("프로모션 구매 (community_promote_3, 3일)");
    expect(displayPointLedgerDescription("충전")).toBe("충전");
  });
  it("새 결제 문구는 DB 함수에서 — 정의를 읽어 문구만 교체 · 없으면 멈춤", () => {
    const sql = src("supabase/migrations/20271103190000_trade_boost_ledger_wording.sql");
    expect(sql).toContain("pg_get_functiondef(v_oid)");
    expect(sql).toContain("RAISE EXCEPTION");
    expect(sql).toContain("replace(v_def, '거래 더 알리기', '거래 상위노출')");
  });
  it("거래 화면·알림·관리자에 「더 알리기」 문구가 남지 않는다", () => {
    for (const f of [
      "lib/i18n/catalog/notifications.ts",
      "lib/promotion/apply-trade-paid-exposure.ts",
      "lib/i18n/catalog/admin-trade-console.ts",
    ]) {
      expect(src(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""), f).not.toMatch(/거래 더 알리기|"더 알리기/);
    }
  });
  it("내 광고: 상위노출 주문 분류 — 진행 중·대기·종료", () => {
    const now = Date.parse("2026-11-03T05:00:00Z");
    expect(classifyMyBoostOrderTab("active", "2026-11-05T00:00:00Z", now)).toBe("active");
    expect(classifyMyBoostOrderTab("active", "2026-11-01T00:00:00Z", now)).toBe("ended");
    expect(classifyMyBoostOrderTab("pending_review", null, now)).toBe("pending");
    expect(classifyMyBoostOrderTab("ended", null, now)).toBe("ended");
    expect(src("app/(main)/mypage/ads/MyAdsPageClient.tsx")).toContain('kind: "boost" as const');
  });
});
