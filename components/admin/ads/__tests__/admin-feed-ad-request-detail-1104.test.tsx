// @vitest-environment jsdom
/**
 * 피드 신청 상세 렌더 시험 (2026-11-04) — AL-14 버튼 권한 · FB-A05 정지 L2(사유 두 칸) · D-5 종료 L3(귀책 → 미리보기 → 재입력) ·
 * 보완 §7 감사 이력 블록.
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/admin/feed-ad-requests/req-1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({
    t: (k: string) => k,
    safeT: (k: string, o?: { fallbackKo?: string }) => o?.fallbackKo ?? k,
    language: "ko",
  }),
}));
vi.mock("@/components/admin/AdminFormSheet", () => ({
  AdminFormSheet: ({ children, footer }: { children: ReactNode; footer?: ReactNode }) => (
    <div>
      {children}
      <footer>{footer}</footer>
    </div>
  ),
}));
vi.mock("@/components/admin/AdminCard", () => ({
  AdminCard: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));
vi.mock("@/components/ads/FeedAdBannerCarousel", () => ({ FeedAdFramePreview: () => null }));
const access = { allowed: true, loading: false, reason: null as string | null };
const guard = vi.fn(() => access.allowed);
vi.mock("@/components/admin/access/use-admin-route-access", () => ({
  useAdminWriteGuard: () => ({ ...access, guard }),
}));
const confirmAdminAction = vi.fn();
vi.mock("@/lib/admin/operator-ux/admin-confirm-action", () => ({
  confirmAdminAction: (...a: unknown[]) => confirmAdminAction(...a),
}));

import { AdminFeedAdRequestDetail } from "@/components/admin/ads/AdminFeedAdRequestDetail";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DETAIL = {
  ok: true,
  request: {
    id: "req-12345678",
    userId: "u-1",
    memberLabel: "홍길동",
    status: "active",
    domain: "trade",
    placement: "trade_home_grid",
    productId: "p",
    pointCost: 300,
    durationDays: 7,
    destinationType: "none",
    destinationId: "",
    destinationUrl: "",
    reviewReason: null,
    campaignId: "camp-1",
    createdAt: "2026-11-01T00:00:00Z",
    source: "MEMBER_REQUEST",
  },
  creativeAuthority: "campaign",
  creatives: [{ id: "cr", sortOrder: 1, imageUrl: "https://x.test/a.png", altText: "", headline: "" }],
  campaign: { id: "camp-1", status: "active", startAt: "2026-11-01T00:00:00Z", endAt: "2026-11-30T00:00:00Z", source: "MEMBER_REQUESTED" },
  holds: [],
  timeline: [],
};

type Call = { url: string; method: string; body: Record<string, unknown> | null };
let calls: Call[] = [];
let root: Root | null = null;
let host: HTMLDivElement;

beforeEach(() => {
  calls = [];
  access.allowed = true;
  access.reason = null;
  confirmAdminAction.mockReset();
  guard.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      calls.push({ url, method: init?.method ?? "GET", body });
      if (url.endsWith("/audit")) {
        return new Response(
          JSON.stringify({
            ok: true,
            items: [
              {
                id: "a1",
                action: "feed_ad_request.pause",
                actor_type: "admin",
                created_at: "2026-11-02T00:00:00Z",
                after_json: { reason_public: "신고 확인", fault: null },
              },
            ],
          })
        );
      }
      if (init?.method === "PATCH" && body?.preview === true) {
        return new Response(JSON.stringify({ ok: true, preview: { refundPoints: 120, paidPoints: 300 }, refundPoints: 120 }));
      }
      if (init?.method === "PATCH") return new Response(JSON.stringify({ ok: true }));
      return new Response(JSON.stringify(DETAIL));
    })
  );
  host = document.createElement("div");
  document.body.appendChild(host);
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
  vi.unstubAllGlobals();
});

async function flush() {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function mount() {
  root = createRoot(host);
  act(() => root!.render(<AdminFeedAdRequestDetail requestId="req-12345678" onClose={() => undefined} />));
  await flush();
}

const btn = (sel: string) => host.querySelector<HTMLButtonElement>(sel);

describe("AdminFeedAdRequestDetail — 2026-11-04", () => {
  it("AL-14: 권한이 없으면 정지·종료·연장 버튼이 사유 창 전에 꺼진다", async () => {
    access.allowed = false;
    access.reason = "광고 권한이 필요합니다";
    await mount();
    for (const id of ["pause", "end", "extend-compensation"]) {
      const b = btn(`[data-testid="admin-feed-req-detail-${id}"]`)!;
      expect(b).toBeTruthy();
      expect(b.disabled).toBe(true);
      expect(b.title).toBe("광고 권한이 필요합니다");
    }
    expect(confirmAdminAction).not.toHaveBeenCalled();
  });

  it("FB-A05 · D-6: 정지 = L2 확인창(공개 사유 + 내부 메모) → 두 값을 서버로 보낸다 (코드값 사유 없음)", async () => {
    confirmAdminAction.mockResolvedValue({ ok: true, reason: "신고 확인", internalMemo: "3건" });
    await mount();
    await act(async () => btn('[data-testid="admin-feed-req-detail-pause"]')!.click());
    await flush();
    expect(confirmAdminAction).toHaveBeenCalledWith(expect.objectContaining({ level: "L2", splitReason: true }));
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch?.body).toMatchObject({ action: "pause", reason: "신고 확인", internalReason: "3건" });
    expect(JSON.stringify(patch?.body)).not.toContain("admin_paused");
  });

  it("D-5: 종료 = 귀책 선택 → 환급 미리보기(preview) → L3 재입력 → 귀책과 사유를 보낸다", async () => {
    confirmAdminAction.mockResolvedValue({ ok: true, reason: "운영 오류", internalMemo: null });
    await mount();
    await act(async () => btn('[data-testid="admin-feed-req-detail-end"]')!.click());
    await flush();
    const submit = btn('[data-testid="admin-feed-req-detail-end-submit"]')!;
    expect(submit.disabled).toBe(true); // 귀책·미리보기 전에는 진행 불가
    const operator = host.querySelectorAll<HTMLInputElement>('input[name="feed-end-fault"]')[0]!;
    await act(async () => operator.click());
    await flush();
    expect(calls.some((c) => c.method === "PATCH" && c.body?.preview === true && c.body?.fault === "operator")).toBe(true);
    expect(host.querySelector("[data-admin-feed-end-preview]")!.textContent).toContain("120");
    await act(async () => btn('[data-testid="admin-feed-req-detail-end-submit"]')!.click());
    await flush();
    expect(confirmAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ level: "L3", retypeValue: expect.any(String), splitReason: true })
    );
    const done = calls.filter((c) => c.method === "PATCH" && c.body?.preview !== true);
    expect(done[done.length - 1]!.body).toMatchObject({ action: "end", fault: "operator", reason: "운영 오류" });
  });

  it("보완 §7: 감사 이력 블록이 조치 이름·공개 사유를 한국어로 보인다 (코드값 없음)", async () => {
    await mount();
    const block = host.querySelector("[data-admin-feed-audit-history]")!;
    expect(block.textContent).toContain("운영자 정지");
    expect(block.textContent).toContain("공개 사유: 신고 확인");
    expect(block.textContent).not.toContain("feed_ad_request");
  });
});
