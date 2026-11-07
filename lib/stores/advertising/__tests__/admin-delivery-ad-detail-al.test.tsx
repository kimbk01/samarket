// @vitest-environment jsdom
/**
 * AL-02 · AL-04 · AL-05 · AL-06 — 배달 광고 상세 화면 렌더 시험.
 * 삭제 자리(공용 삭제 `AdminAdDeleteAction` + 종료/보관 · 어드민 SSOT §3-2) · 진행 중 종료 패널(귀책 → 미리보기 → L3 확인창,
 * 대상 재입력 없음 · 공개 사유/내부 메모 두 칸 D-10) · 재개 L2 · 검수 시작 L1 · 연장 L2 · D-03 강제 종료 버튼 없음.
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/delivery-ads/c1",
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
vi.mock("@/components/admin/shell/AdminDeliveryCmsChrome", () => ({
  AdminDeliveryCmsChrome: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/admin/AdminCard", () => ({
  AdminCard: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));
vi.mock("@/components/stores/advertising/DeliveryAdCampaignPlacementPreviews", () => ({
  DeliveryAdCampaignPlacementPreviews: () => null,
}));
vi.mock("@/components/stores/advertising/DeliveryAdPerformancePanel", () => ({
  DeliveryAdPerformancePanel: () => null,
}));
vi.mock("@/components/stores/advertising/DeliveryAdOperationsPanel", () => ({
  DeliveryAdOperationsPanel: () => null,
}));
vi.mock("@/components/stores/advertising/DeliveryAdOwnerPhoneFrame", () => ({
  DeliveryAdOwnerPhoneFrame: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/common/SamarketThumbnail", () => ({ SamarketThumbnail: () => null }));
vi.mock("@/components/admin/access/use-admin-route-access", () => ({
  useAdminRouteAction: () => ({ allowed: true, reason: null }),
}));
vi.mock("@/components/admin/ads/AdminAdDeleteAction", () => ({
  AdminAdDeleteAction: (p: { kind: string; id: string }) => (
    <button data-test-ad-delete-kind={p.kind} data-id={p.id}>
      삭제
    </button>
  ),
}));
const confirmAdminAction = vi.fn();
vi.mock("@/lib/admin/operator-ux/admin-confirm-action", () => ({
  confirmAdminAction: (...a: unknown[]) => confirmAdminAction(...a),
}));
/** 설계 §6 단계 표(담당 A 가 admin-action-levels.ts 에 넣는 값)를 그대로 둔 대역 — 화면이 어떤 종류 이름을 쓰는지 본다. */
const LEVELS: Record<string, string> = {
  pause: "L2",
  resume: "L2",
  end: "L3",
  extend: "L2",
  reviewStart: "L1",
  adResume: "L2",
  delete: "L3",
  disable: "L1",
  forceCancel: "L3",
  approve: "L2",
  reject: "L2",
  save: "L1",
};
const adminActionLevel = vi.fn((k: string) => LEVELS[k]);
vi.mock("@/lib/admin/operator-ux/admin-action-levels", () => ({
  adminActionLevel: (k: string) => adminActionLevel(k),
}));

import { AdminDeliveryAdDetailWorkspace } from "@/components/admin/stores/AdminDeliveryAdDetailWorkspace";

const UPDATED = "2026-11-01T00:00:00Z";

function campaign(over: Record<string, unknown> = {}) {
  return {
    id: "c1",
    productKind: "banner",
    storeId: "s1",
    storeName: "테스트 매장",
    storeThumbnailUrl: null,
    storePrimarySlug: null,
    storeSubSlug: null,
    ownerUserId: "o1",
    ownerDisplayName: "사장님",
    inventoryKeys: ["STORES_HOME_HERO"],
    lifecycleStatus: "ACTIVE",
    reviewStatus: "APPROVED",
    reviewNotes: null,
    title: "가을 배너",
    headline: null,
    imageUrl: "https://x/img.png",
    ctaHref: "/stores/s1",
    storeSlug: "s1",
    creativeId: null,
    startAt: "2026-10-01T00:00:00Z",
    endAt: "2026-12-01T00:00:00Z",
    pricingModel: null,
    submittedAt: null,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: UPDATED,
    listBucket: "active",
    scheduleHint: "in_window",
    campaignSource: "OWNER_PAID",
    sortOrder: 0,
    ...over,
  };
}

type Call = { url: string; body: Record<string, unknown> | null };
let calls: Call[] = [];
let current: Record<string, unknown> = campaign();
let actionResponse: (body: Record<string, unknown>) => { status: number; json: unknown } = () => ({
  status: 200,
  json: { ok: true, result: {} },
});

function installFetch() {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { body?: string }) => {
      const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : null;
      calls.push({ url, body });
      const ok = (status: number, json: unknown) =>
        ({ ok: status < 400, status, json: async () => json }) as unknown as Response;
      if (url.includes("/actions")) {
        const r = actionResponse(body ?? {});
        return ok(r.status, r.json);
      }
      if (url.includes("/business-cash")) return ok(200, { ok: true, funding: null, businessCash: null });
      if (url.includes("/performance")) return ok(200, { ok: true });
      if (url.includes("/extend")) {
        return ok(200, {
          ok: true,
          quote: { amountMinor: 0, currency: "PHP", previousEndAt: "2026-12-01T00:00:00Z", newEndAt: "2026-12-08T00:00:00Z", daysAdded: 7 },
        });
      }
      return ok(200, { ok: true, campaign: current, audits: [], creative: null, placementPreview: null });
    })
  );
}

let host: HTMLDivElement;
let root: Root;

async function flush() {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<AdminDeliveryAdDetailWorkspace campaignId="c1" productHint="banner" />);
  });
  await flush();
  // 「추가 검수 액션」 펼치기
  const toggle = Array.from(host.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").includes("추가 검수 액션")
  );
  await act(async () => {
    toggle?.click();
  });
}

function btn(sel: string) {
  return host.querySelector(sel) as HTMLButtonElement | null;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  current = campaign();
  actionResponse = () => ({ status: 200, json: { ok: true, result: {} } });
  installFetch();
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.unstubAllGlobals();
});

describe("AL-02 삭제 자리 → 공용 삭제 (어드민 SSOT §3-2 · 2026-11-07)", () => {
  it("진행 중 사장님 광고: 공용 삭제(delivery_banner) + 종료 버튼 · 「강제 종료」 없음(D-03) · 일반 목록에는 종료 없음", async () => {
    await mount();
    const slot = host.querySelector("[data-admin-delivery-ads-delete-slot]");
    expect(slot?.getAttribute("data-admin-delivery-ads-delete-slot")).toBe("delete");
    expect(slot?.querySelector('[data-test-ad-delete-kind="delivery_banner"]')?.getAttribute("data-id")).toBe("c1");
    expect(host.querySelectorAll('[data-admin-delivery-ads-action="end"]')).toHaveLength(1);
    expect(host.querySelector('[data-admin-delivery-ads-action="terminate"]')).toBeNull();
    expect(host.querySelector('[data-admin-delivery-ads-action="delete_safe_draft"]')).toBeNull();
  });

  it("매장 홍보 초안: 공용 삭제 kind = delivery_sponsored (사장님 초안도 422 안내 대신 삭제 자리)", async () => {
    current = campaign({ productKind: "store_sponsored", lifecycleStatus: "DRAFT", campaignSource: "OWNER_PAID" });
    await mount();
    expect(host.querySelector('[data-test-ad-delete-kind="delivery_sponsored"]')).not.toBeNull();
    expect(host.querySelector("[data-admin-delivery-ads-delete-blocked]")).toBeNull();
  });
});

describe("AL-04 진행 중 종료 = 귀책 + 미리보기 + L3", () => {
  it("종료 → 패널 → 귀책 선택 시 preview=true 호출 · 환급 표시 → 종료 진행 = L3 확인창 → 사유·귀책 전송", async () => {
    actionResponse = (b) =>
      b.preview === true
        ? { status: 200, json: { ok: true, result: { preview: true, refundAmount: 50000, paidAmount: 100000, remainingSeconds: 90000 } } }
        : { status: 200, json: { ok: true, result: { preview: false } } };
    confirmAdminAction.mockResolvedValue({ ok: true, reason: "운영 오류로 종료", internalMemo: "내부 확인" });
    await mount();
    await act(async () => {
      btn('[data-admin-delivery-ads-action="end"]')?.click();
    });
    // 바로 확인창·종료 호출 없이 패널만
    expect(confirmAdminAction).not.toHaveBeenCalled();
    expect(host.querySelector("[data-admin-delivery-ads-end-panel]")).not.toBeNull();
    expect(host.textContent).toContain("운영 사유 — 남은 기간 비례 환급");
    expect(host.textContent).toContain("사장님 사유 — 환급 없음");
    expect(host.textContent).toContain("해당 없음 — 환급 없음");
    expect(btn("[data-admin-delivery-ads-end-confirm]")?.disabled).toBe(true);

    await act(async () => {
      (host.querySelector('[data-admin-delivery-ads-end-fault="operator"]') as HTMLInputElement).click();
    });
    await flush();
    const previewCall = calls.find((c) => c.url.includes("/actions") && c.body?.preview === true);
    expect(previewCall?.body).toMatchObject({ action: "end", fault: "operator", preview: true, expectedLifecycle: "ACTIVE" });
    expect(host.querySelector("[data-admin-delivery-ads-end-preview]")?.textContent).toContain("환급 예정 비즈니스 캐시");

    await act(async () => {
      btn("[data-admin-delivery-ads-end-confirm]")?.click();
    });
    await flush();
    expect(adminActionLevel).toHaveBeenCalledWith("end");
    // 어드민 SSOT §3-1: 대상 재입력 없음 · D-10 공개 사유 + 내부 메모 두 칸
    expect(confirmAdminAction.mock.calls[0][0]).toMatchObject({ level: "L3", splitReason: true });
    expect(confirmAdminAction.mock.calls[0][0].retypeValue).toBeUndefined();
    expect(String(confirmAdminAction.mock.calls[0][0].description)).toContain("운영 사유 — 남은 기간 비례 환급");
    const runCall = calls.find((c) => c.url.includes("/actions") && c.body?.preview === false);
    expect(runCall?.body).toMatchObject({
      action: "end",
      fault: "operator",
      reason: "운영 오류로 종료",
      ownerVisibleNotes: "운영 오류로 종료",
      internalReason: "내부 확인",
    });
  });
});

describe("AL-05 재개 L2 · 검수 시작 L1 · 정지 L2", () => {
  it("재개: 확인창(L2) 사유를 서버로 보낸다", async () => {
    current = campaign({ lifecycleStatus: "PAUSED_ADMIN" });
    confirmAdminAction.mockResolvedValue({ ok: true, reason: "점검 끝" });
    await mount();
    await act(async () => {
      btn('[data-admin-delivery-ads-action="resume"]')?.click();
    });
    await flush();
    expect(adminActionLevel).toHaveBeenCalledWith("adResume");
    expect(confirmAdminAction.mock.calls[0][0].level).toBe("L2");
    expect(calls.find((c) => c.url.includes("/actions"))?.body).toMatchObject({ action: "resume", reason: "점검 끝" });
  });

  it("재개 확인창 취소 → 서버 호출 없음", async () => {
    current = campaign({ lifecycleStatus: "PAUSED_ADMIN" });
    confirmAdminAction.mockResolvedValue({ ok: false });
    await mount();
    await act(async () => {
      btn('[data-admin-delivery-ads-action="resume"]')?.click();
    });
    await flush();
    expect(calls.some((c) => c.url.includes("/actions"))).toBe(false);
  });

  it("검수 시작: L1 확인창", async () => {
    current = campaign({ lifecycleStatus: "SUBMITTED", reviewStatus: "PENDING" });
    confirmAdminAction.mockResolvedValue({ ok: true, reason: null });
    await mount();
    const b = host.querySelector('[data-admin-delivery-ads-action="start_review"]') as HTMLButtonElement | null;
    expect(b).not.toBeNull();
    await act(async () => {
      b?.click();
    });
    await flush();
    expect(adminActionLevel).toHaveBeenCalledWith("reviewStart");
    expect(confirmAdminAction.mock.calls[0][0].level).toBe("L1");
  });

  it("정지: L2(사유)", async () => {
    confirmAdminAction.mockResolvedValue({ ok: true, reason: "신고 접수" });
    await mount();
    await act(async () => {
      btn('[data-admin-delivery-ads-action="pause"]')?.click();
    });
    await flush();
    expect(adminActionLevel).toHaveBeenCalledWith("pause");
    expect(calls.find((c) => c.url.includes("/actions"))?.body).toMatchObject({ action: "pause", reason: "신고 접수" });
  });
});

describe("AL-06 연장 L2", () => {
  it("미리보기 후 연장 실행 = L2 확인창 · 확인창 사유를 서버로", async () => {
    confirmAdminAction.mockResolvedValue({ ok: true, reason: "운영 보상" });
    await mount();
    const find = (t: string) =>
      Array.from(host.querySelectorAll("button")).find((b) => (b.textContent ?? "").trim() === t) as
        | HTMLButtonElement
        | undefined;
    await act(async () => {
      find("비용 미리보기")?.click();
    });
    await flush();
    await act(async () => {
      find("연장 실행")?.click();
    });
    await flush();
    expect(adminActionLevel).toHaveBeenCalledWith("extend");
    expect(confirmAdminAction.mock.calls[0][0].level).toBe("L2");
    const post = calls.find((c) => c.url.endsWith("/extend") && c.body);
    expect(post?.body).toMatchObject({ reason: "운영 보상", requestedDays: 7 });
  });
});
